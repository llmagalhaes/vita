# OPS-013 — HTTP API on the default execute-api URL (AWS-managed TLS) → VPC Link
# (free) → Cloud Map → the Fargate task (registered by OPS-014). ADR-0005.
# prevent_destroy on the API: shipped apps couple to the URL (ADR-0009).

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  description = "App-tier subnets the VPC Link ENIs live in."
  type        = list(string)
}

variable "app_security_group_id" {
  description = "The Fargate app SG — we add the one ingress rule it was left open for."
  type        = string
}

variable "container_port" {
  description = "Port the Kotlin app listens on. Backend to confirm (Spring default 8080)."
  type        = number
  default     = 8080
}

# --- VPC Link SG + the app SG's only ingress rule --------------------------
resource "aws_security_group" "vpc_link" {
  name        = "vita-vpclink"
  description = "API Gateway VPC Link ENIs"
  vpc_id      = var.vpc_id

  tags = { Name = "vita-vpclink" }
}

resource "aws_vpc_security_group_egress_rule" "vpc_link_to_app" {
  security_group_id            = aws_security_group.vpc_link.id
  referenced_security_group_id = var.app_security_group_id
  from_port                    = var.container_port
  to_port                      = var.container_port
  ip_protocol                  = "tcp"
  description                  = "To the app tier only"
}

# The rule the network module (OPS-005) deliberately deferred to here: the app
# tier's ONLY inbound, from the VPC Link SG on the container port. No CIDR.
resource "aws_vpc_security_group_ingress_rule" "app_from_vpc_link" {
  security_group_id            = var.app_security_group_id
  referenced_security_group_id = aws_security_group.vpc_link.id
  from_port                    = var.container_port
  to_port                      = var.container_port
  ip_protocol                  = "tcp"
  description                  = "API Gateway VPC Link only"
}

# --- Cloud Map: ECS (OPS-014) registers task IPs here ----------------------
resource "aws_service_discovery_private_dns_namespace" "this" {
  name = "vita.local"
  vpc  = var.vpc_id
}

resource "aws_service_discovery_service" "app" {
  name = "api"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.this.id

    # SRV, not A: API Gateway's Cloud Map private integration resolves both IP AND
    # port from the discovered instance. With A records ECS registers no
    # AWS_INSTANCE_PORT, so API Gateway has no port to reach and returns 500. SRV +
    # the ECS service_registries container_port (OPS-014) register IP:8080. (2026-07-15,
    # first-deploy milestone: this path was never exercised while ECS was parked at 0.)
    dns_records {
      type = "SRV"
      ttl  = 10
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

# --- VPC Link + HTTP API ---------------------------------------------------
resource "aws_apigatewayv2_vpc_link" "this" {
  name               = "vita"
  subnet_ids         = var.public_subnet_ids
  security_group_ids = [aws_security_group.vpc_link.id]
}

resource "aws_apigatewayv2_api" "this" {
  name          = "vita"
  protocol_type = "HTTP"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_apigatewayv2_integration" "this" {
  api_id             = aws_apigatewayv2_api.this.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  connection_type    = "VPC_LINK"
  connection_id      = aws_apigatewayv2_vpc_link.this.id
  integration_uri    = aws_service_discovery_service.app.arn
}

# Catch-all: every path/method proxies to the app (backend owns /health etc).
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.this.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  # Crude, free DDoS/cost protection (ADR-0005). Ample for 5 users.
  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 50
  }
}

output "api_endpoint" {
  description = "https default execute-api URL. → bootstrap-ids.md + app build config."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "service_discovery_service_arn" {
  description = "OPS-014 ECS service registers into this."
  value       = aws_service_discovery_service.app.arn
}

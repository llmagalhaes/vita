# OPS-005 — VPC & networking, no NAT (ADR-0004), region-agnostic (ADR-0002).
# App tier lives in public subnets (task ENIs get public IPs for egress to the
# Claude API/ECR — saves the ~$37/mo NAT gateway); security groups are the
# boundary: zero inbound from the internet. DB subnets have no internet route.

data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "vita"
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "vita"
  }
}

# App tier: public subnets. Public IP assignment happens per ECS service
# (assign_public_ip), not at the subnet level.
resource "aws_subnet" "public" {
  count             = var.az_count
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone = local.azs[count.index]

  tags = {
    Name = "vita-public-${local.azs[count.index]}"
    Tier = "app"
  }
}

# DB tier: private subnets with NO route to the internet at all (RDS needs no egress).
resource "aws_subnet" "db" {
  count             = var.az_count
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, 8 + count.index)
  availability_zone = local.azs[count.index]

  tags = {
    Name = "vita-db-${local.azs[count.index]}"
    Tier = "db"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "vita-public"
  }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = var.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# DB route table: local routes only — deliberately nothing else.
resource "aws_route_table" "db" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "vita-db"
  }
}

resource "aws_route_table_association" "db" {
  count          = var.az_count
  subnet_id      = aws_subnet.db[count.index].id
  route_table_id = aws_route_table.db.id
}

# Free gateway endpoint: S3 traffic (uploads/exports/ECR layers) stays on the AWS
# network instead of the public internet path. No interface endpoints (ADR-0004).
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.current.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id, aws_route_table.db.id]

  tags = {
    Name = "vita-s3"
  }
}

# Lock the VPC default SG: no rules at all, nothing may use it.
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "vita-default-locked"
  }
}

# App SG: ZERO inbound. The single allowed ingress (VPC Link ENIs' SG on the
# container port) is added by the API Gateway stack (OPS-013) when that SG exists.
resource "aws_security_group" "app" {
  name        = "vita-app"
  description = "Fargate app tier - zero inbound; VPC Link rule added by OPS-013"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "vita-app"
  }
}

# ponytail: egress open (stateful SG, inbound stays closed) — the task needs the
# Claude API, ECR, SSM, AMP over 443 plus the DB; tighten to explicit rules if a
# security review ever demands egress control.
resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
  description       = "Egress for Claude API, ECR, S3, SSM, AMP, RDS"
}

# DB SG: PostgreSQL from the app SG only; no egress whatsoever.
resource "aws_security_group" "db" {
  name        = "vita-db"
  description = "RDS - inbound 5432 from the app SG only, no egress"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "vita-db"
  }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "PostgreSQL from the app tier only"
}

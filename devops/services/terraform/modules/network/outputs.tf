output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "App-tier subnets (public, no NAT — ADR-0004)."
  value       = aws_subnet.public[*].id
}

output "db_subnet_ids" {
  description = "DB-tier subnets (no internet route)."
  value       = aws_subnet.db[*].id
}

output "app_security_group_id" {
  value = aws_security_group.app.id
}

output "db_security_group_id" {
  value = aws_security_group.db.id
}

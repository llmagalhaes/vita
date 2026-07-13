# Negative-test fixture — NOT part of any stack, never applied. Run checkov's
# custom rule against this dir; CKV_VITA_1 must FAIL on this resource:
#
#   checkov -d devops/services/ci/checkov/tests \
#           --external-checks-dir devops/services/ci/checkov \
#           --check CKV_VITA_1,CKV_VITA_2
#
# Expected: "Check: CKV_VITA_1 ... FAILED for resource aws_vpc_security_group_ingress_rule.bad".
# If it PASSES, the guardrail is broken — do not merge.
resource "aws_vpc_security_group_ingress_rule" "bad" {
  security_group_id = "sg-placeholder"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

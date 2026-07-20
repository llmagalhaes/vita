# OPS-023 — SES sender identity for the magic-link sign-in email (backend BE-033).
# Email-ADDRESS identity only: no domain is owned yet → no domain identity, no
# DKIM, no Route53. Sandbox mode is fine at ~5 users — while sandboxed, SES only
# delivers to verified addresses, and during testing sender == recipient == the
# CEO's verified address. Creating this identity makes AWS email a verification
# link to that address; NOTHING sends until the CEO clicks it (identity stays
# Pending until then). Production-access request + real domain + DKIM are a later
# CEO decision (flagged in the ticket/handover), not built here.

variable "sender_address" {
  description = "The From: address to verify as an SES email identity."
  type        = string
}

resource "aws_ses_email_identity" "sender" {
  email = var.sender_address
}

output "identity_arn" {
  description = "Identity ARN the ECS task role scopes ses:SendEmail to (OPS-014)."
  value       = aws_ses_email_identity.sender.arn
}

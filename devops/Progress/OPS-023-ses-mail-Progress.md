# OPS-023 — SES: identity, IAM, SSM for magic-link email

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368584/task/1216730018739518
Implements backlog **OPS-012** (SES sandbox + tester identities) — OPS-012 closed as duplicate → this.
Coordination: backend **BE-033** ships the SES mailer in parallel; ENV CONTRACT below is fixed.
Region eu-west-1, account 201261380352. CEO decision 2026-07-20: real magic-link email.

## Status: IN PROGRESS (applied + verified; ONE manual gate left)
The SES identity is **Pending** — creating it made AWS send a verification email to
`lucasmagalhaes2007@gmail.com`. **Nothing sends until the CEO clicks that link.** Once clicked,
the ticket is Done (run the post-click SendEmail test below).

## What was applied (Terraform, all in services/terraform)
1. `modules/ses/main.tf` (new) — `aws_ses_email_identity.sender` for the From: address
   (email-ADDRESS identity, no domain / no DKIM / no Route53). Outputs `identity_arn`.
2. `modules/ssm/main.tf` — new `aws_ssm_parameter.mail_from` = `/vita/prod/mail-from`
   (SecureString, storage CMK). **NOT** a REPLACE_ME placeholder and **no** `ignore_changes`:
   Terraform owns the real value (`var.mail_from_address`) because it's the CEO's own address,
   not a credential, and backend treats blank/REPLACE_ME as "email disabled → log the link".
3. `modules/ecs/main.tf`:
   - `container_secrets` += `MAIL_FROM_ADDRESS = "mail-from"` → task-def env from that SSM param.
   - new `var.ses_identity_arn`; `SesSend` statement resource narrowed from `["*"]` to the
     identity ARN (same least-privilege pattern as the OPS-022 KMS statement). Actions kept:
     `ses:SendEmail` + `ses:SendRawEmail` (BE-033 SDK path not yet pinned; both scoped, cheap).
4. `envs/prod-eu/{variables,main}.tf` — `var.mail_from_address` (default
   `lucasmagalhaes2007@gmail.com`); `module "ses"`; wired `mail_from_address`→ssm,
   `ses_identity_arn`→ecs.

## ENV CONTRACT (fixed, agreed with backend BE-033 — do not rename)
- SSM SecureString `/vita/prod/mail-from` = `lucasmagalhaes2007@gmail.com`
- task-def env var `MAIL_FROM_ADDRESS` sourced from that param
- blank / `REPLACE_ME_IN_CONSOLE` ⇒ backend disables email and logs the magic link (fail-safe)

## Plan / apply
`terraform plan` = **3 add, 2 change, 1 destroy** (add: ses identity, mail-from param, new
task-def rev; change: task-role policy in-place + ecs service in-place; destroy: old task-def
revision deregistered). Applied; second apply = clean no-op (converged). No new paid resources
(SES identity free, Standard SSM param free; only per-email SES cost once sending starts).

## Verified live
- `ses get-identity-verification-attributes` → **Pending** (expected; CEO click outstanding).
- `sesv2 get-account` → ProductionAccess=false (**sandbox**), SendingEnabled=true.
- `/vita/prod/mail-from` (with-decryption) = `lucasmagalhaes2007@gmail.com`, SecureString.
- Task role `vita-ecs-task` SesSend now `Resource =
  arn:aws:ses:eu-west-1:201261380352:identity/lucasmagalhaes2007@gmail.com`.
- `iam simulate-principal-policy` ses:SendEmail + ses:SendRawEmail on that resource → **allowed**.
- Task-def **vita:4**, app container has `MAIL_FROM_ADDRESS` → `.../mail-from`.
- Service recycled: `ecs wait services-stable` STABLE, 1/1 running on vita:4,
  rolloutState **COMPLETED**, `GET /health` → **HTTP 200 {"status":"up"}**.

## Post-CEO-click test (hand to orchestrator/CEO — run AFTER clicking the verify email)
Sandbox delivers only to verified addresses; in sandbox sender == recipient == the CEO's address,
so this works as-is:
```
aws sesv2 send-email --region eu-west-1 \
  --from-email-address lucasmagalhaes2007@gmail.com \
  --destination ToAddresses=lucasmagalhaes2007@gmail.com \
  --content 'Simple={Subject={Data="Vita SES test",Charset=UTF-8},Body={Text={Data="OPS-023 SES pipe live.",Charset=UTF-8}}}'
```
(Run as vita-admin. The task-role's scoped SendEmail is already proven by simulate-principal-policy
above; the true end-to-end is BE-033 emitting the magic link from the running task.)

## Flagged for the CEO (later decisions — NOT done now)
- **Production access request**: SES stays in sandbox (only verified recipients). Fine for ~5
  self-testing users. Request production access before onboarding anyone whose address isn't
  verified. Sending quota/rate then also lifts.
- **Real domain + DKIM**: no domain owned → sending as a bare Gmail From: without DKIM/SPF will
  land many recipients' mail in spam. When Vita gets real users, buy a domain, switch to a
  DOMAIN identity, add DKIM (and a MAIL FROM subdomain) — that's a Route53 + DNS change, bigger
  than this ticket.

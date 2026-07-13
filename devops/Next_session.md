# DevOps — Next session

## Current state (Phase 2 implementation, session 1 — 2026-07-13)

- **Terraform written and validating** (Terraform 1.15.6, aws ~> 6.0, `fmt`+`validate` green): `devops/services/terraform/` — `bootstrap/` (state bucket + $40 budget, local-state-then-migrate), `modules/{network,kms,audit}`, thin root `envs/prod-eu/`. Covers OPS-002/003/005/006/007 — all five **In progress** on Asana. **Nothing applied.**
- **ADR-0010** (supersedes ADR-0003): **single account**, no Organization — the new account (201261380352) is dedicated; org + `vita-backup` member account deferred until *before the first real user's data* (trigger recorded in the ADR). OPS-001 re-scoped on Asana to "account security baseline".
- **Region reviewed, eu-west-1 stands** (note appended to ADR-0002): Fargate ARM ~10% cheaper in Ireland beats RDS $0.001/h cheaper in Stockholm; net ≈ $0.10/mo. CLI default eu-north-1 is irrelevant — Terraform pins the region.
- **SECURITY BLOCKER**: the CEO's CLI holds a **root access key** (`sts` shows `:root`). Remediation = step 0 of `devops/Doc/apply-runbook.md`; setup-guide step 1 rewritten with exact console steps. No applies, no mutating AWS calls until fixed.
- **Free-tier honesty flag**: account created after July 2025 → credit-based free tier ($100 + up to $100), NOT the legacy 12-month offers behind the ~$16/mo year-1 figure. Realistic: ~$37/mo offset by credits; still under the $40 alarm. Awaiting CEO's credit-balance confirmation.

## Next steps

1. **CEO runs `devops/Doc/apply-runbook.md`** (root-key fix → bootstrap → state migration → prod-eu apply → verify). Closes the apply half of OPS-002/003/005/006/007.
2. After apply hand-back: commit `devops/Doc/bootstrap-ids.md` (profile name, account ID, region) — OPS-001's remaining deliverable.
3. Then **OPS-004** (GitHub OIDC plan/apply CI — needs the repo pushed, setup-guide step 2) so this runbook is the *last* manual apply path. checkov 0.0.0.0/0 rule lands there.
4. Queue after that: OPS-008 (ECR) → OPS-009 (RDS — note ADR-0010: same-account backup vault until the org trigger; 14 d vs backend's 35 d ask still open) → OPS-010/011.

## Open questions for the CEO

- Confirm root key deleted + MFA on (runbook step 0) — blocks everything.
- Free-tier credits: what does Billing → Credits show? (updates the year-1 estimate honestly)
- Carried: audit/log retention 400 d default; exports 90 d; domain-purchase trigger.

## Blockers

- Root access key on the CLI — no applies until remediated (runbook step 0).
- GitHub repo not yet pushed (setup-guide step 2) — blocks OPS-004.

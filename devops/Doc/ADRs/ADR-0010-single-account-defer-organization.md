# ADR-0010 — Single AWS account now; Organization deferred until real user data

**Status**: Accepted 2026-07-13. **Supersedes ADR-0003.**

## Context

ADR-0003 (2-account org) assumed the CEO's pre-existing personal AWS account would become the management account, with a fresh `vita-prod` member holding the workload. Round 5 changed the facts: the CEO created a **brand-new AWS account dedicated to Vita** (201261380352). The org's entire remaining payoff was the **cross-account backup vault copy** — backups that survive prod-account compromise.

## Decision

**Start single-account.** The dedicated account holds everything: workload, state, budgets, audit trail, and (for now) backups.

Why the org doesn't pay its way *today*:

- The data at risk is ~5 testers' logs during implementation — recoverable, not ransom-worthy. The cross-account copy protects irreplaceable data; none exists yet.
- A second account means a second root user (email alias, password, MFA) to create and secure. The account's root credentials were already mishandled once (root access key in the CLI); fewer root identities is itself the security win right now.
- Everything else ADR-0003 wanted (budgets, consolidated billing) is trivially satisfied by one account.

**Trigger to create the org** (a standing condition, not a date): **before the first real (non-tester) user's health data lands in RDS** — or earlier if tester data becomes non-disposable. At that point: enable Organizations on this account, create member `vita-backup` (root email `lucasmagalhaes2007+vita-backup@gmail.com`), point the AWS Backup copy job there. Terraform-wise this is additive — no re-architecture, the backup module grows a provider alias.

## Consequences

- OPS-001 re-scoped: from "org bootstrap" to "account security baseline" (IAM admin access, **delete the root access key**, root MFA, `bootstrap-ids.md`).
- OPS-009's cross-account vault copy line becomes same-account AWS Backup vault until the trigger fires; the ransomware boundary is accepted as deferred and tracked by this ADR.
- Known deviation accepted for later: when the org is created, this account becomes the management account *while running the workload* — not AWS best practice, fine at this scale, revisit only if the company grows real teams.

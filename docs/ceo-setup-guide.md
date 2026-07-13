# CEO Setup Guide — human-only accounts and actions

> Every step here requires a human (payment, identity, MFA). Do them in order — later steps depend on earlier ones.
> Written by team-lead-devops, 2026-07-13. Amended same day per Round 3 decisions: **no domain purchase, no SES production-access request** — v1 runs on placeholder DNS (see `devops/Doc/cost-revision.md` §1.8). Companion to that doc.

## Where things you create go

- **Secrets** (API keys, tokens): into **AWS SSM Parameter Store** (SecureString) via console/CLI once AWS exists (devops Terraform creates named empty parameters; you paste values). Until AWS exists, keep them in your password manager. **Never in git, never in chat.**
- **Identifiers** (account IDs, repo URL — not secret): tell the orchestrator; they get committed to `devops/Doc/bootstrap-ids.md`.
- Asana and Notion already exist — nothing to do there.

## Critical path

**Step 1 (AWS) blocks everything.** Then 2 (GitHub) and 3 (Anthropic) are quick; kick off 4/5 (Apple/Google) early because they have multi-day approval waits. No domain, no SES request — both deferred (see last section).

| # | What | Cost | Your time | Wait time | Blocks |
|---|---|---|---|---|---|
| 1 | AWS org (2 accounts) + MFA + $40 budget | $0 | ~45 min | none | all infra |
| 2 | GitHub repo + push + apply gate | $0 | ~30 min | none | all CI/CD |
| 3 | Anthropic API key ($10 limit, zero-retention) | usage-based | ~10 min | none | product AI |
| 4 | Apple Developer Program | $99/yr | ~30 min | **~2 days verification** | iOS TestFlight |
| 5 | Google Play Console | $25 once | ~30 min | **up to ~1 week ID verification** | Android testing track |

---

## 1. AWS — organization, MFA, budget, admin access

1. Create the **management account** at aws.amazon.com → "Create an AWS Account". Email: use a plus-alias, e.g. `lucasmagalhaes2007+vita-aws@gmail.com`. Account name: `vita-management`. Needs a credit card and phone verification.
2. **Immediately enable MFA on root**: sign in as root → IAM → "Add MFA for root user" → use your phone's authenticator app (add a second MFA device as backup).
3. Enable **AWS Organizations**: console → Organizations → "Create an organization".
4. Create the **prod account** from Organizations → "Add an AWS account" → "Create": name `vita-prod`, email `lucasmagalhaes2007+vita-prod@gmail.com`. (Its root password: use "Forgot password" flow with that alias once, then enable root MFA on it too.) **A fresh account also means 12 months of AWS free tier** — the cost table counts on it.
5. Enable **IAM Identity Center** (console → IAM Identity Center → Enable, home region **eu-west-1**). Create user `lucas`, create permission set `AdministratorAccess` (predefined), assign it to yourself on **both** accounts. Note the **SSO start URL**.
6. Create a **budget**: console (management account) → Billing → Budgets → monthly cost budget, **$40**, email alerts at 50% / 80% / 100% to your email. (Per your Round 3 decision — estimate is ~$16/mo year 1, ~$37/mo year 2+.)
7. This admin access is what devops uses (through you or session credentials you run locally) for the one-time Terraform bootstrap; after bootstrap, CI uses OIDC roles and no keys exist.

**Hand back**: both 12-digit account IDs + the Identity Center SSO start URL + confirmation MFA is on both roots → orchestrator (goes to `bootstrap-ids.md`).

## 2. GitHub — repo, push, apply gate (Free plan)

1. Create a **private repo** (your account is fine) named e.g. `vita`. GitHub **Free** — per your decision, no paid plan.
2. Push this monorepo: from the repo root, `git remote add origin git@github.com:<you>/vita.git && git push -u origin main`.
3. **Note on branch protection**: enforced protection rules on private repos need a paid plan — on Free we rely on you being the sole collaborator plus the gate below. If a second human ever gets push access, upgrade to Team ($4/mo) that day and enable protection.
4. Apply gate (designed in `devops/Doc/cost-revision.md` §3.1): Terraform applies run **only** via a manually triggered workflow (`workflow_dispatch` on `apply.yml`) that re-uses the plan artifact produced on `main` — on a private repo only you can trigger it, and the AWS apply role only trusts that exact workflow on `main`.
5. OIDC note: **no AWS keys are ever stored in GitHub.** Devops ships Terraform creating an OIDC identity provider trusting `token.actions.githubusercontent.com` scoped to this exact repo, with two roles (read-only *plan*, CEO-triggered *apply*). You just confirm the repo path (`<you>/vita`) so the trust policy matches.

**Hand back**: the repo URL/path.

## 3. Anthropic API key (product AI)

1. console.anthropic.com → your organization → API Keys → create key named `vita-prod`. **Zero-retention arrangement applies to this key** (your Round 3 decision #3 — confirm it's active on the org before first production traffic).
2. **Set the monthly spend limit first** (Settings → Limits): **$10/mo** hard limit, per your decision — the API stops rather than overspends; you review usage daily. Raise deliberately later.
3. Put the key in **SSM Parameter Store** (prod account, eu-west-1): devops Terraform will have created parameter `/vita/prod/anthropic-api-key`; console → Systems Manager → Parameter Store → that parameter → edit → paste. If infra isn't up yet, park it in your password manager.

**Hand back**: confirmation only (never the key itself).

## 4. Apple Developer Program — $99/yr

1. developer.apple.com → enroll as an **Individual** with your Apple ID (2FA required). Identity verification typically takes **~2 days**.
2. Once approved, **reserve the bundle ID**: Certificates, Identifiers & Profiles → Identifiers → new App ID. **Per your Round 3 decision it must NOT derive from the future domain.** Proposed: `com.lucasmagalhaes.vita` (reverse-DNS of something you permanently control; Apple doesn't verify domain ownership). Bundle IDs are permanent — confirm with the app team, then reserve.
3. You build/submit from your Mac (your decision), so no CI certificates are needed — Xcode's automatic signing with your account is enough.

**Hand back**: the chosen bundle ID → app team.

## 5. Google Play Console — $25 one-time

1. play.google.com/console → sign up as **personal developer account**; $25 fee; **identity verification can take up to a week**.
2. Note: personal accounts created now must run a **closed test with ~12 testers for 14 days** before production release — with ~5 users, plan to recruit a few extra testers, or factor it into Android launch timing.
3. Package name: same as iOS, e.g. `com.lucasmagalhaes.vita`. **Immutable after first upload** — same confirmation as step 4.

**Hand back**: the chosen package name → app team.

---

## When we buy the domain (later)

Deliberately deferred (Round 3 decision #1). Until then: API on the default `execute-api` URL, SES in sandbox emailing the ~5 verified testers, magic links via an https redirect route on the backend. Testers will each click one SES verification email — that's expected.

When a domain is bought, **exactly this changes, nothing else**:

1. **Buy the domain** (Route 53 preferred: management account → Route 53 → Registered domains; ~$15–45/yr, +~$0.50/mo hosted zone). Hand the name to the orchestrator.
2. **SES domain identity**: devops Terraform swaps the verified-email-address setup for a domain identity with DKIM; then you file the **production-access request** (SES console → "Request production access", mail type *Transactional*, ~1–2 business days AWS review) so unverified recipients can receive mail.
3. **API custom domain**: devops adds an ACM cert + `api.<domain>` mapping on the existing API Gateway; app updates its base URL config.
4. **Universal links / app links**: app team adds the `https://<domain>/...` association files so magic links open the app verified (replaces the raw `vita://` scheme risk).

Bundle IDs, AWS accounts, GitHub, Anthropic — all untouched by the domain.

---

## After all steps

Tell the orchestrator "setup complete" with the hand-backs above. Devops then runs the one-time Terraform bootstrap (state bucket, OIDC roles) under your approval, and from then on everything is PR → plan → your gated apply.

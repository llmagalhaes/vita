# CEO Setup Guide — human-only accounts and actions

> Every step here requires a human (payment, identity, MFA). Do them in order — later steps depend on earlier ones.
> Written by team-lead-devops, 2026-07-13. Companion to `devops/Doc/cost-revision.md`.

## Where things you create go

- **Secrets** (API keys, tokens): into **AWS Secrets Manager** via console/CLI once AWS exists (devops Terraform creates named empty secrets; you paste values). Until AWS exists, keep them in your password manager. **Never in git, never in chat.**
- **Identifiers** (account IDs, domain name, repo URL — not secret): tell the orchestrator; they get committed to `devops/Doc/bootstrap-ids.md`.
- Asana and Notion already exist — nothing to do there.

## Critical path

**Step 1 (AWS) blocks everything.** Then do 2 (domain) and 4 (GitHub) in parallel; kick off 3 (SES request) and 6/7 (Apple/Google) early because they have multi-day approval waits. 5 (Anthropic) is 10 minutes, needed before backend AI work.

| # | What | Cost | Your time | Wait time | Blocks |
|---|---|---|---|---|---|
| 1 | AWS org (2 accounts) + MFA + budget | $0 | ~45 min | none | all infra |
| 2 | Domain + Route 53 | ~$15–45/yr | ~15 min | none | SES, API URL, bundle IDs |
| 3 | SES production access request | $0 | ~10 min | **1–2 days AWS review** | magic-link sign-in |
| 4 | GitHub repo + push + apply gate | $0 | ~30 min | none | all CI/CD |
| 5 | Anthropic API key + spend limit | usage-based | ~10 min | none | product AI |
| 6 | Apple Developer Program | $99/yr | ~30 min | **~2 days verification** | iOS TestFlight |
| 7 | Google Play Console | $25 once | ~30 min | **up to ~1 week ID verification** | Android testing track |

---

## 1. AWS — organization, MFA, budget, admin access

1. Create the **management account** at aws.amazon.com → "Create an AWS Account". Email: use a plus-alias, e.g. `lucasmagalhaes2007+vita-aws@gmail.com`. Account name: `vita-management`. Needs a credit card and phone verification.
2. **Immediately enable MFA on root**: sign in as root → IAM → "Add MFA for root user" → use your phone's authenticator app (add a second MFA device, e.g. a second app/device, as backup).
3. Enable **AWS Organizations**: console → Organizations → "Create an organization".
4. Create the **prod account** from Organizations → "Add an AWS account" → "Create": name `vita-prod`, email `lucasmagalhaes2007+vita-prod@gmail.com`. (Its root password: use "Forgot password" flow with that alias once, then enable root MFA on it too.)
5. Enable **IAM Identity Center** (console → IAM Identity Center → Enable, in your home region — pick **eu-west-1**). Create user `lucas`, create permission set `AdministratorAccess` (predefined), assign it to yourself on **both** accounts. Note the **SSO start URL** it gives you.
6. Create a **budget**: console (management account) → Billing → Budgets → monthly cost budget, **$60**, email alerts at 50% / 80% / 100% to your email.
7. This admin access is what devops uses (through you or session credentials you run locally) for the one-time Terraform bootstrap; after bootstrap, CI uses OIDC roles and no keys exist.

**Hand back**: both 12-digit account IDs + the Identity Center SSO start URL + confirmation MFA is on both roots → orchestrator (goes to `bootstrap-ids.md`).

## 2. Domain + Route 53

1. Decide the product domain (open question — e.g. `vita.app` if available, `getvita.app`, `vitalog.app`, …). **This choice also fixes the app bundle IDs (step 6/7) — decide once.**
2. Recommended: buy it directly in **Route 53** (management account → Route 53 → Registered domains → Register). One vendor, DNS is instantly Terraform-manageable, WHOIS privacy included. Price ~$14/yr (`.com`) to ~$45/yr (some TLDs). If the name is only available at another registrar (e.g. Porkbun/Cloudflare), buy there and we'll point its nameservers at Route 53 — fine too.
3. That's it — devops Terraform creates the hosted zone records (API host, SES DKIM, etc.).

**Hand back**: the domain name (and registrar, if not Route 53).

## 3. SES production access (magic-link email)

New AWS accounts start in the **SES sandbox** (can only email verified addresses). Devops does the domain verification via Terraform; only the exit-sandbox request is human:

1. Prod account console → SES (eu-west-1) → Account dashboard → "Request production access".
2. Fill in: mail type *Transactional*; website: the domain from step 2; use case description: "Passwordless sign-in (magic links) and account emails for a personal health-logging app; ~5 users initially; bounces/complaints monitored via SES event destinations; no marketing mail."
3. **AWS reviews in ~1–2 business days** — do this as soon as the domain exists.

**Hand back**: nothing — just tell the orchestrator when approval lands.

## 4. GitHub — repo, push, apply gate

1. Create a **private repo** (your account is fine; an org is optional) named e.g. `vita`. GitHub **Free** is enough.
2. Push this monorepo: from the repo root, `git remote add origin git@github.com:<you>/vita.git && git push -u origin main`.
3. Branch protection on `main`: Settings → Branches → require pull request + require status checks.
4. Apply gate: Terraform applies run only via a manually triggered workflow (`workflow_dispatch`) — on a private repo only collaborators (you) can trigger it. If you later want formal approval-review gates, that's GitHub Team ($4/mo) + Environments; not needed now.
5. OIDC note: **no AWS keys are ever stored in GitHub.** Devops ships Terraform that creates an AWS IAM OIDC identity provider trusting `token.actions.githubusercontent.com` scoped to this exact repo, with two roles (read-only *plan*, CEO-triggered *apply*). You just confirm the repo path (`<you>/vita`) so the trust policy matches.

**Hand back**: the repo URL/path.

## 5. Anthropic API key (product AI)

1. console.anthropic.com → create/use your organization → API Keys → create key named `vita-prod`.
2. **Set a monthly spend limit first** (Settings → Limits): suggest **$25/mo** to start — 5 users parsing meals won't approach it; raise deliberately later.
3. Put the key in **AWS Secrets Manager** (prod account, eu-west-1): devops Terraform will have created secret `vita/prod/anthropic-api-key`; console → Secrets Manager → that secret → "Retrieve/Set secret value" → paste. If infra isn't up yet, park it in your password manager.

**Hand back**: confirmation only (never the key itself).

## 6. Apple Developer Program — $99/yr

1. developer.apple.com → enroll as an **Individual** with your Apple ID (2FA required). Identity verification typically takes **~2 days**.
2. Once approved: App Store Connect → no need to create the app record yet, but **reserve the bundle ID**: Certificates, Identifiers & Profiles → Identifiers → new App ID. Bundle IDs are reverse-DNS of a domain you own — **depends on step 2**. E.g. domain `getvita.app` → bundle ID `app.getvita.vita`. Bundle IDs are permanent; wait for the domain decision rather than guessing.
3. You build/submit from your Mac (your decision #9), so no CI certificates are needed — Xcode's automatic signing with your account is enough.

**Hand back**: the chosen bundle ID → app team.

## 7. Google Play Console — $25 one-time

1. play.google.com/console → sign up as **personal developer account** with your Google account; $25 fee; **identity verification can take up to a week**.
2. Note: personal accounts created now must run a **closed test with ~12 testers for 14 days** before production release — with ~5 users, plan to recruit a few extra testers, or consider it when timing the Android launch.
3. Package name: same reverse-DNS convention and same domain dependency as iOS (e.g. `app.getvita.vita`). **Immutable after first upload** — wait for the domain.

**Hand back**: the chosen package name → app team.

---

## After all steps

Tell the orchestrator "setup complete" with the hand-backs above. Devops then runs the one-time Terraform bootstrap (state bucket, OIDC roles) under your approval, and from then on everything is PR → plan → your gated apply.

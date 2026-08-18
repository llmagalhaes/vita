# V4 — DevOps plan

**Status:** planning only. Nothing applied, nothing committed by this team.
**Baseline:** prod is task-def `vita:9`, image `vita-api:2ca6def`, Flyway at **V009**, RDS Postgres 16.13,
Terraform reconciled (OPS-024) — `envs/prod-eu/variables.tf app_image_tag = "2ca6def"` matches live.
**Cost today:** ≈ **$19/mo** (RDS free tier) → ≈ **$34/mo** when the 12-month free tier lapses.

## 0 · Verdict up front

v4 is an **app + backend round**. Reading `docs/v4/README.md` end to end, the only infra-touching items are:

| v4 item | Infra impact |
|---|---|
| Day-record model (planned/done/adjusted/skipped/unrecorded, retro-close) | New rows in existing RDS tables → **V010+ migration**, nothing else. Backups/encryption/retention already cover it. |
| Single day-close notification (replaces per-meal ones) | **Device-local** notification (`expo-notifications`), same as the v3 evening recap. **No push infra, no SNS/FCM, no scheduler.** Strictly fewer notifications than v3. |
| Export PDF (recipient-shaped) | Existing `vita-prod-exports-*` bucket + 30-day lifecycle. Unchanged. |
| Muscle map / habit detail / Trends scrub / scenic home / parallax | Pure client rendering off existing endpoints. Zero. |
| Onboarding 5→2 steps, Integrations screen removed | Zero. |
| PDF plan import (kept sacred) | Unchanged — uploads bucket + KMS + async parse job all already live. |

So devops **rides at the end**: one deploy ticket, plus the standing pre-user items that v4 does not change
but that publishing does gate. **No new AWS resources are proposed.**

---

## 1 · Tickets (continue after OPS-024)

### OPS-025 — v4 backend deploy (image + V010+ via Terraform)
**Wave: LAST** (after backend build is gated + reviewed; blocks the fresh APK).
Same discipline as OPS-024/BE-046 — **Terraform is the only path to prod, no CLI clones**.

1. Backend pushes `vita-api:<sha>` (host `bootJar` → `Dockerfile.runtime` → `buildx --push`, arm64,
   scoped `DOCKER_CONFIG` + staged minimal context — the recurring Docker gotchas, see BE-046 ledger).
2. `envs/prod-eu/variables.tf` → `app_image_tag = "<sha>"`. **That must be the whole diff.**
3. `terraform plan` must be exactly **1 add / 1 change / 1 destroy** (task-def replace + service update +
   old-rev deregister). **Anything else in the plan = stop and reconcile**, never apply through drift.
4. Apply → new task-def rev (`vita:10`), rollout COMPLETED 1/1, previous rev drained.
5. **Migration gate before apply:** confirm with backend that V010+ is **expand-only** (additive). If v4's
   day-record model needs a destructive change, that is a CEO-approval item, not a devops call — the CEO
   has previously allowed drop/recreate of the prod DB (session 18 amendment A2), but it must be asked
   again, per-round, in writing.
6. **Post-apply probes:** `/health` 200 · Flyway boot line `… now at version v010` · one end-to-end
   day-record write + read (close a day, retro-close a past day) · PDF import still green (it is the most
   fragile money-path; re-run the async parse probe against the real `meal-plan.pdf`) · parse cost INFO
   line queryable in Logs Insights.
7. **Rollback:** revert `app_image_tag` to `2ca6def` + apply. Precondition — a V010-applied DB must still
   boot the old image (Flyway future-migration validation). Rehearse locally before the apply, as in OPS-024.
8. Fresh APK with the **prod URL baked** (`apiBaseUrl` ends `/v1`, verified inside the artifact) and the
   `adb uninstall com.llmagal.vita` clean-install note. Built by the app team / CEO — devops verifies the
   baked URL only.

Ledger: `devops/Progress/OPS-025-v4-deploy-Progress.md`.

### OPS-026 — Privacy-policy URL (publishing prerequisite)
**Wave: can start now** (prep), lands with OPS-025.
Play Console + the Health Connect declaration both require a **public HTTPS privacy-policy URL**. We have no
domain (still `vita://` scheme).

**Proposal (laziest that holds):** serve it from the **existing public API Gateway** — a static
`GET /privacy` HTML route on the backend, exactly the pattern BE-035 already proved with the magic-link
HTML fallback (`PUBLIC_BASE_URL` is already wired into the task-def). Result:
`https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/privacy`.
- **Terraform changes: none. New AWS resources: none. Cost: $0.00.**
- ~15 lines in the backend (cross-team ask), no auth, no DB.
- Trade-off: the URL is ugly and dies if the API is down. At 5 users, acceptable.

**Rejected (documented, not built):** S3 static site + CloudFront (HTTPS needs CloudFront since the S3
website endpoint is HTTP-only) — ~5 Terraform resources, ~$0–0.50/mo, and still no nice domain. **Upgrade
path:** when a real domain is bought, move the policy to `vita.<domain>/privacy` behind CloudFront and
update Play Console — a URL swap, no rework. GitHub Pages rejected: the repo is private.

Deliverable now: the routing decision + a one-page ADR (`Doc/ADRs/ADR-0011-privacy-policy-hosting.md`).
**The policy text itself is a CEO/product deliverable, not devops** — devops hosts what it is handed.

### OPS-027 — Publishing readiness pack (prepare now, CEO executes)
**Wave: parallel, any time.** Touches no prod infra. Devops prepares artifacts; the CEO performs every
account/credential action himself.

| Item | Devops prepares now | CEO does (gated) |
|---|---|---|
| Signed **AAB** | `bundleRelease` runbook + gradle signing config reading from `~/.gradle/gradle.properties` (never the repo) | runs `./gradlew bundleRelease` |
| **Upload keystore** | exact `keytool` command + storage guidance (keystore + password in his password manager, **never** in git, never in SSM) | **generates the keystore with his own password** — devops does not create or handle signing credentials |
| **Play App Signing** | note on enrolment + where the release SHA-1 appears after first upload | enrols, uploads the AAB |
| **Health Connect declaration** | draft answers (what we read: active energy, steps, sessions; **stored SQLite-only on device, never sent to the backend** — ADR-0016) + the privacy-policy URL from OPS-026 | submits the form |
| **Data-safety form** | draft answers from the real data map (health data encrypted in transit + at rest, per-user DEK crypto-shredding, deletable via "Delete my data", uploads expire in 30 days) | submits |
| **Content rating** | draft questionnaire answers (no ads, no UGC sharing, no purchases) | submits |
| **OAuth consent screen + Android OAuth client** | package name `com.llmagal.vita` documented | creates both in Google Cloud Console |

**Sequencing catch worth flagging:** the Android OAuth client needs the **release SHA-1**, which only exists
**after** Play App Signing is enabled — i.e. after the first AAB upload. So: AAB → Play App Signing → SHA-1 →
Android OAuth client → paste client id into SSM. Google sign-in cannot be finished before the first upload.

Note: the **Health Connect runtime bug** (permission never prompts, session 21) is an app-team fix and is
**not** a publishing gate — it does not block AAB, declaration, or listing.

### OPS-028 — SES production access + domain/DKIM
**CEO-gated. Not a v4 blocker.**
SES is still in **sandbox** with a single verified address identity (the CEO's gmail). That is fine for 5 test
users but not for real ones. Two separate asks:
1. **Production access request** — an AWS support form; removes the sandbox recipient restriction. Free.
   Devops can draft the justification text; the CEO submits from his account.
2. **Domain + DKIM** — needs a **domain purchase decision** (still open, carried since session 8). Route 53
   hosted zone ≈ **$0.50/mo** + domain registration (~$12–15/yr, varies by TLD). Terraform work: a `modules/ses`
   domain identity + DKIM records ≈ 4 resources, ~1 hour.
   Also unblocks: a proper privacy-policy URL (OPS-026 upgrade path) and dropping `vita://` for universal links.

**Recommendation:** do 1 now (free, no decision needed beyond "yes"), defer 2 until the CEO decides on a domain.

### OPS-029 — S3 uploads 30-day lifecycle — CEO decision
**CEO-gated. One-line change, zero cost either way at this volume.**
`vita-prod-uploads-*` expires objects at **30 days** (`modules/storage/main.tf:59`). Meal photos are deleted a
month after upload. Standing question since session 8, still unanswered. v4 makes it slightly sharper: the day
record makes **past days** a first-class, browsable surface — if a user opens a day from 6 weeks ago, any
attached photo is already gone.

- Keep 30d → cheapest, most privacy-preserving, and consistent with "store strictly what's necessary".
- Raise/remove → a one-line tfvar + apply. Storage cost at 5 users is rounding-error either way (< $0.10/mo).

**Devops recommendation: keep 30 days** unless v4's past-day view is meant to show photos indefinitely — that
is a product call. Exports staying at 30d is fine (regenerated on demand).

---

## 2 · Standing items — where they sit relative to v4

| Item | Blocks v4? | Blocks first real users / publishing? |
|---|---|---|
| SES production access (OPS-028.1) | No | **Yes** — real users get no magic link outside the sandbox |
| SES domain + DKIM (OPS-028.2) | No | Soft yes (deliverability) — needs the domain decision |
| S3 uploads 30d (OPS-029) | No | No — product decision |
| OIDC placeholder client-ids (`/vita/prod/google-|apple-client-config` = `REPLACE_ME_IN_CONSOLE`) | No | Only if Google sign-in must work at launch. Fail-closed today (401). **Unblocked by the AAB→SHA-1 sequence above, not by devops.** Paste the id into SSM → next task start picks it up, **no redeploy, no Terraform**. |
| Observability backlog (AMP workspace, ADOT sidecar `essential=false` with no `remote_write`, `aps:RemoteWrite` still `*`) | No | No — CloudWatch covers 5 users |
| OPS-017 RDS PITR restore rehearsal | No | Should happen before real users' data exists |
| OPS-004 CI negative tests | No | No |

---

## 3 · Cost impact of v4

**≈ $0.00/month.** No new AWS resources, no new managed services, no new egress path.

- Day records = a few KB per user per year in the existing RDS instance.
- Day-close notification is device-local → no SNS/FCM/Pinpoint, and it **reduces** notification count vs v3.
- PDF import volume is unchanged (same async parse, same Claude token profile, same 20480 output cap).
- Privacy-policy hosting via the existing API GW route adds no line item.
- The only real cost event on the horizon is unrelated to v4: **RDS free tier lapse → ≈ $34/mo**
  (+db.t4g.micro ~$13, +20 GB gp3 ~$2). Still under the $40 budget alarm, but it will be close — worth a
  heads-up before it fires.

---

## 4 · Monitoring / observability gap from the day-record model

**Confirmed: none beyond what exists.** Checked against the v4 model rather than assumed:

- Day records are ordinary authenticated writes to the existing API on the existing task — already covered by
  the `/ecs/vita` CloudWatch log group and the existing API GW metrics.
- Backups: the RDS `daily-45d` plan is instance-level, so new v4 tables are backed up automatically. No change.
- Encryption: new columns inherit the per-user DEK / crypto-shredding model (ADR-0003). No new key material,
  no new KMS grant (unlike OPS-022, which was needed only because S3+KMS crossed an IAM boundary).
- The existing parse-cost INFO line stays the one cost signal we can query.

**One cheap addition, only if the CEO wants it** (not proposed as a ticket): the day-close write is the single
action v4 leans on most — one INFO log line on close/retro-close would make "did the notification actually
lead to a close?" answerable in Logs Insights with zero infra. Backend one-liner if wanted. **Otherwise: skip.**

---

## 5 · Wave assignment

```
Wave 1  app + backend build (v4)              devops: idle
        └─ parallel, no prod contact:         OPS-026 (ADR + backend ask), OPS-027 (readiness pack)
Wave 2  review + gates                        devops: idle
Wave 3  DEPLOY                                OPS-025 (image + V010 + probes + rollback rehearsal)
        └─ then fresh APK (prod URL baked, verified)
Post-v4 / CEO-gated, any order                OPS-028, OPS-029, + the CEO actions in OPS-027
```

---

## 6 · Questions for the CEO

1. **Privacy-policy hosting** — OK with the API-Gateway route (`…execute-api…/privacy`, $0, ugly URL), or do
   you want to buy a domain now and do it properly on CloudFront? A domain also unblocks SES DKIM.
2. **S3 uploads 30-day expiry** (asked before, still open) — keep 30 days, or should meal photos survive so
   that v4's past-day view can still show them months later?
3. **SES production access** — shall I draft the justification for you to submit? (Free, no downside, and real
   users need it.)
4. **Upload keystore** — confirm you will generate it yourself with your own password and store it in your
   password manager. Devops will not create or hold app-signing credentials.
5. **V010 shape** — if v4's day-record model needs a destructive migration, do we still have blanket approval
   to drop/recreate the prod DB (as in session 18, A2), or do you want to be asked at apply time?
6. **Budget alarm** — the RDS free tier lapse takes us from ~$19 to ~$34/mo against a $40 alarm. Raise the
   alarm now, or let it fire as the reminder?

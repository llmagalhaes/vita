# Orchestrator — Next Session

> Read `CLAUDE.md` first (bootstrap + non-negotiables). This file is the orchestrator's state: what just happened, what to do next, without re-reading the whole history. Team-level detail lives in `backend|app|devops/Next_session.md`.

## Where we are (2026-07-15, session 6 — Fable fidelity backlog + emulator-verified bug fixes)

**The CEO's 3 remaining live-test bugs (#3/#4/#6) are FIXED and emulator-verified, and the full Fable prototype-fidelity backlog is implemented.** Session ran in 4 passes, all committed + working tree clean (`2bb753f..bfc4e48`, 16 commits). tsc 0 / Jest **168 green (34 suites)** at every commit. Ledger with everything: **`app/Progress/APP-CEO-BUGS-Progress.md`** (sessions 6.1–6.4 appended).

1. **Fable fidelity audit** (CEO asked for it): a Fable subagent compared prototype vs app screen-by-screen → **`docs/reviews/2026-07-14-fable-fidelity-audit.md`** (verdict: "structurally faithful, motionally flat"; 20 ranked tasks).
2. **Backlog implemented** (CEO: "vai fazendo tudo"): motion system (`PressScale`, animated `Bar`/`Toggle`/`Chevron`, `Card` shadow, `GrowBar`, `MorphBlob`/`MorphContainer`, `SheetOverlay` + worklet `useSheetDrag`), Home hero 82px + filling water vessel, check-in deck, donut sweep, voice equalizer, portion pop-up + floating totals, onboarding/auth/account/habits staggers + pops, muscle-sessions sheet on Trends heatmap (B4), workout muscle chip pop (B8), calorie-curve draw-on + scrub guide line.
3. **Emulator drive (CEO-authorized this session)** found + fixed 3 real device bugs:
   - **Tab swipe "sometimes dead" (pre-existing root cause):** lazy-mounting a neighbor tab from the pan's `onBegin` setState re-rendered the pager MID-GESTURE → gesture reset → swipe snapped back. Neighbors now pre-mount from a deferred effect. Verified Home↔Trends↔Habits.
   - **Mount animations dropped on busy boots:** new `src/ui/useStartOnLayout.ts` (mount tweens start at first `onLayout`); vessel animates px not %; `WaveIllustration` memo'd; SVG draw-ons pin final state post-tween. Verified on cold boot.
   - **#4 PDF export (2 rounds):** print-cache path is unreadable by the share FileProvider AND the File API → final fix `printToFileAsync({base64:true})` → `File.write` into document dir → share. **Verified: Android share sheet opens "vita-log.pdf".**
   - Also verified on screen: #6 tap-to-open scrub w/ readout + guide line (closed card = tab swipe, open card = scrub), #3 drag-dismiss on capture/vacation/export, MorphBlob parsing, pops, vessel fill, muscle sheet.

**Next session:**
- **CEO phone pass** — only subjective feel remains (all functional bugs device-verified). If motion still feels short of the prototype, iterate from the audit's P2 leftovers.
- **Two CEO-gated items from the audit:** B12 blurred pop-up backdrops (needs `expo-blur`, new dep) · per-exercise muscle row-tinting (needs `exercises[].muscles` in the parse — backend contract change → BE ticket).
- Housekeeping not done this session: Asana/Notion not updated (repo is current); fold into next session close.
- Emulator + Metro (:8082) were torn down at session close.

## Where we are (2026-07-14, session 5 — CEO live-test bug-fix pass)

**The CEO test-drove the app on a physical Android phone (Expo Go SDK 56, real backend) and filed 11 bugs.** 8 are fixed + committed + pushed (commits `163e8c4..8f04847`); the **navigation swipe crash (the CEO's #1 priority)** was **device-verified on the emulator**. Full per-bug ledger with root causes + the remaining recipes: **`app/Progress/APP-CEO-BUGS-Progress.md`** (READ THIS FIRST for the bug work).

- **Fixed:** #1/#11 swipe-nav worklet crash + pill/route desync (real cause: `idxRef` read inside the gesture worklet in `TabsPager`) · #9 keyboard-covers-input (app-wide `src/ui/keyboard.tsx`) · #5 habit-add crash (guard `expo-notifications` behind Expo Go detection — no-op stub; real notifs need dev build APP-007) · #2 vacation button (TZ-safe `isValidDate`) · #7 home-breaks-on-water (row `alignItems:flex-start`, water Card sizes to content) · #1-muscles tappable (BodyMap `onMusclePress`) · #8 macros-card tap expands kcal breakdown · #2b vacation square shadow (`overflow:hidden`) · #10 totals — confirmed already OK on device.
- **Remaining (need on-device verification — CEO tests on their phone; do NOT boot the emulator):** **#6** Trends scrub (needs pager gesture ref via React Context — risks regressing the just-fixed nav, verify carefully) · **#3** sheet drag-to-dismiss fluidity (worklet-ize `shouldDismiss`, decide inline; recipe in ledger) · **#4** export PDF (silent `catch{}` in `ExportSheet` hides the real failure — surface it on a device run first). Recipes + risk for each are in the ledger.
- **Local dev launcher:** `vita up | up mock | down | login | status | logs` (in `/opt/homebrew/bin`, source `scripts/vita`). Real-backend sign-in in Expo Go: `vita login` reprints the magic-link token as an `exp://` URL (the `vita://` scheme only works in a dev build). A `__DEV__`-only "paste token" field on the auth screen also works.

**The "Vita 100% local" feature backlog itself remains COMPLETE** (below). This session was live-QA fixes on top of it.

## Where we are (2026-07-14, session 4 closed — "Vita 100% local" backlog COMPLETE)

**Phase 2 — Implementation. The entire "Vita 100% local" backlog is built and green LOCALLY.** Contract at **v0.4.0** (additive over v0.3.0). All feature slices 1–8 shipped in one parallel-agent execution day (commits `0ae4310..5a35dfa`). AWS infra still applied but **parked at $0** (ECS off). **No production deploy** — CEO policy: local-first. Working tree clean, pushed to GitHub.

### DONE this session (all local, DoD = `check`/`tsc`/`jest`/`expo export` green)
- **Backend — `./gradlew check` 122 green + 6 LocalStack adapter tests.** BE-017 entries `from`/`to`/CSV `type`; BE-023 pinned model ids (+`photo-model`; `plan-pdf-model=claude-sonnet-4-6` verified valid, sonnet-5 deferred — needs `thinking:disabled`); BE-018 `/parse/photo` vision (multipart, image discarded, 413/415/422); BE-019/020 plan+program versioned (history≤5), editable (full-doc PUT + re-encrypt), per-user-DEK encrypted, cascade-shred; BE-024 `checkin` entry type (idempotency `habitId:date`, PATCH change-answer); BE-025 `/me/vacations` encrypted opaque ranges; BE-022 `@Scheduled` token cleanup (closes audit 2.3); BE-026/027 real S3/KMS adapters behind `@Profile("aws")`, LocalStack-tested (default check stays AWS-free). ADR-0011 ext, ADR-0013.
- **DevOps** — OPS-020 LocalStack (S3+KMS) profile-gated in backend compose; plain `docker compose up` stays Postgres-only.
- **App — Jest 158 green, 32 suites, Expo Go SDK 56.** Slices: water (APP-017) · workout + reusable BodyMap (APP-018/019) · plan/program persist + edit-mode screens (APP-021/022/023) · photo capture (APP-020) · habits + check-ins-via-outbox + local notifications (APP-024/025/026) · Trends Food/Activity client-side agg (APP-027/028) · Account/Integrations/Vacation/Export-PDF-on-device/Energy (APP-029/030/031/032) · offline interpretation + NetInfo reconnect + Maestro E2E + fidelity pass (APP-033/034/035).
- **Two Fable audits** — `docs/reviews/2026-07-14-fable-audit.md` (pre-session) and `docs/reviews/2026-07-14-fable-audit-2.md` (full session). **Both audits' fixes landed and re-verified:** app day-filter UTC, outbox poison-pill + taxonomy (dead-photo-URI, 404/403, checkin-409 PATCH-fallback), Home philosophy slips (no 2500-kcal target, no fabricated 7-day chart incl. the spent series), offline plan/vacation dirty-flag (edits survive hydrate), backend muscle mapping + numeric validation. Crypto envelope on every new encrypted surface verified per-user-DEK + cascade/shred.
- **CEO live-testing bugfix** (`1c6fe2c`): Home layout blowout (`height:"100%"`→`flex:1`) + confirm-sheet drag-to-dismiss (pan gesture, `runOnJS`). Verified live on Android emulator. (The blue floating gear the CEO saw is a device/OS overlay, NOT app UI.)
- **Offline-capture review banner** (`5a35dfa`, CEO Round 12): offline captures still auto-add on reconnect but are marked `needsReview` with an "N offline captures added — tap to review" banner + review sheet (Keep/Adjust/Discard); the `failed` timeline card got a Dismiss. Restores confirm-before-log affordance without losing durability.

### What's PARKED (CEO-gated — do NOT start autonomously)
1. **Hygiene sweep** — BE-028 + APP-037 (pre-release code cleanup). CEO calls this stage.
2. **F-LAST production deploy** — AWS deploy → Android vs AWS → iOS on iPhone vs AWS → Play Store → App Store. Needs CEO secrets (RDS pw, 7 SSM values, GitHub repo Variables) + Apple/Play accounts. Runbook in `docs/backlog-local-100.md` §F-LAST.

### Small follow-ups noted (non-blocking, not started)
- **Authoritative discard**: the offline-review Discard and the `failed`-card Dismiss are **local-only** (SQLite is the display source; trends are client-side per D4). A capture that synced before the user discards it leaves an orphan server row. A backend delete/void op would make Discard authoritative — build only if ever needed.
- **Audit-2 1.7 (backend, hygiene-sweep debt)**: `CryptoService` AAD binds userId only, not table/column — defense-in-depth; fold `"$userId:$table"` into BE-028.
- **Plan/program history UI**: backend serves `/plan/history` (≤5) but the app has no "previous plans" picker yet (APP-022 explicitly deferred it) — small follow-up ticket.

**Rules unchanged**: no GitHub CI/CD (local pre-merge checklists are the guardrail), no AWS applies (LocalStack for adapters), Terraform kept ready.

## Snapshot by team

### Backend — local, `./gradlew check` = 84 tests green
All In progress on Asana (Done = production, gated on BE-004 deploy). Packages all follow **controller→service→repository** (BE-016 refactor done, ADR-0012 supersedes ADR-0001).
- BE-005 crypto (AES-256-GCM per-user DEK, blind index, crypto-shred; KMS behind `KeyWrapper` seam)
- BE-006 magic link · BE-008 sessions (JWT + refresh rotation, family revoke)
- BE-009 profile `/me` · BE-010 account deletion (7d grace + Postgres job queue + crypto-shred job)
- BE-011 entries (idempotent write) · BE-012 timeline (keyset pagination, tz day filter)
- BE-013 parse/text (Claude, tool-forced, nothing persisted) · BE-014 AI guardrails (per-user quota 429, token/cost Micrometer metrics, eval fixtures)
- BE-015 plan/program parse + `POST /uploads` presigned (S3 behind `FileStore` seam)
- Local seams (LocalKeyWrapper, LocalFileStore, LogMailer) swap for real AWS at deploy.
- **Done (deploy) gated on BE-004**; real Claude for text confirmed working (`claude-haiku-4-5`).

### App — local, Jest 51 green, Expo SDK 56 (store-Expo-Go compatible)
FEATURE-COMPLETE except APP-007. All tickets done: onboarding (APP-009/010), Home (APP-013), capture text+voice (APP-011/012), meal detail (APP-014), auth+magic link (APP-008), SQLite+outbox (APP-005), generated API client (APP-006), design system (APP-003), i18n (APP-004), SDK pin (APP-016).
- Native OIDC (Google/Apple) and voice STT are **stubbed behind interfaces** — need a dev build (APP-007) to become real.
- **Run walkable (mocks):** `cd app/services/vita-app && npm install && npx expo start`.
- **Run against local backend (real E2E):** start backend (below), then `VITA_API_BASE_URL=http://<Mac-LAN-IP>:8080/v1 npx expo start` (base URL MUST include `/v1`; iOS sim = localhost, Android emu = 10.0.2.2). Unset the var → mock mode (test default).

### DevOps — AWS eu-west-1, all applied, parked at ~$6/mo idle
- Applied & running: VPC/subnets/SGs, 2 KMS CMKs, CloudTrail, GuardDuty, audit bucket, ECR `vita-api`, RDS `vita` (encrypted/private/force_ssl, 45d backups via AWS Backup vault), 7 SSM SecureStrings (placeholders), S3 uploads/exports, OIDC CI roles + PR/main/apply workflows.
- **API Gateway live**: `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/` (503, no backend).
- **ECS parked at `module.ecs.desired_count = 0` = Fargate $0.** RDS free-tier $0, left running.
- Done: OPS-002/003/005/006/007/008/011. In progress (applied, deferred verify): OPS-013/014. Backlog: OPS-012 (SES), OPS-015 (observability/AMP), OPS-016 (magic-link redirect), OPS-017 (quarterly RDS restore rehearsal).

## Proven this session (integration milestone)
The real app client drove the real local backend: magic-link sign-in → parse/text (1 real Haiku call) → confirm → `POST /entries` (idempotency 201/200-replay) → `GET /entries` timeline with server-computed totals, persisted in real Postgres → `GET/PATCH /me`. **Zero contract drift** — generated types (v0.3.0) matched real responses exactly. Recipe in `app/Progress/APP-INTEGRATION-local-e2e-Progress.md`; dev harness `npm run integration:smoke`.

## ⚠️ Follow-up to verify (non-blocking)
- **Claude PDF model id**: `application.yaml` `vita.ai.plan-pdf-model = claude-sonnet-4-6` looks wrong (current Sonnet is `claude-sonnet-5`). Verify via the claude-api reference before the first live PDF parse. The text model `claude-haiku-4-5` is confirmed working.

## Next actions — WAITING ON CEO DIRECTION (nothing autonomous left)
1. **Call a deploy milestone** → resume the chain: flip `module.ecs.desired_count`→1, backend builds+pushes the arm64 image (Dockerfile ready) to ECR (BE-004), Flyway migrate, verify `/health` through the API GW. **Requires the CEO's manual secrets first** — all listed in `devops/Next_session.md`:
   - RDS master password (console) + paste into `/vita/prod/db-credentials`
   - 7 SSM SecureString values (currently `REPLACE_ME_IN_CONSOLE`)
   - 3 GitHub repo Variables: `AWS_PLAN_ROLE_ARN=arn:aws:iam::201261380352:role/vita-ci-plan`, `AWS_APPLY_ROLE_ARN=arn:aws:iam::201261380352:role/vita-ci-apply`, `AWS_REGION=eu-west-1`
2. **Create Apple Developer + Play Console accounts** → unblocks APP-007 (first real device build) and BE-007 (Google/Apple OIDC); turns stubbed native OIDC/voice real.
3. **BE-007** (OIDC sign-in) — blocked on #2. Only major backend ticket not yet built.
4. Verify the PDF model id (above) whenever the plan-import goes live.

## Operating rules quick-recall
- Orchestrator commits; **subagents never run git** (index races). Commit per team: `backend|app|devops|docs: <summary>`. Push uses `gh` HTTPS token (SSH key not in this env): `git push https://github.com/llmagalhaes/vita.git HEAD:main`.
- **Per-task model (Round 7)**: every Asana ticket carries `Model:` (Sonnet simple / Opus 4.8 complex / Fable heavy-orchestration). Team-lead agents pinned `model: opus` in `.claude/agents/`.
- Same-team parallel agents → use `isolation: worktree` (disjoint packages), then merge with a real `./gradlew check` before commit. Cross-team agents → disjoint folders, commit separately.
- Every architecture decision → ADR. Product doubts → CEO, never invented. Chat with CEO in PT-BR; repo in English.
- Anthropic key lives in `backend/services/vita-api/secrets.yaml` (gitignored). Never commit real secrets.

## Key artifacts
| What | Where |
|---|---|
| Decision log (newest first) | `docs/ceo-decisions.md` |
| Roadmap M0–M8 | `docs/roadmap.md` |
| API contract v0.3.0 | `docs/contracts/vita-api-v0.yaml` |
| Apply runbook / infra ids | `devops/Doc/apply-runbook.md`, `devops/Doc/bootstrap-ids.md` |
| CEO setup guide (accounts/secrets) | `docs/ceo-setup-guide.md` |
| ADRs | `backend/Doc/ADRs/` (0001–0012), `devops/Doc/ADRs/`, `app/Doc/ADRs/` (0001–0003) |
| Local-backend leftover | bootRun + docker-compose Postgres were left up during integration; stop with `docker compose down` in `backend/services/vita-api` + kill the bootRun. (Orchestrator tears these down at session close.) |

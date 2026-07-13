# App Team — Next Session

## Current state (Phase 1 — Specification, in progress)

- Phase 0 approved: stack is **React Native + Expo** (CEO decision log Round 4).
- **`Doc/foundations.md` written** — fixed decisions: bundle id `com.llmagal.vita` (immutable, both stores), deep-link scheme `vita://` (auth callback `vita://auth` via https redirect), API base URL from build config only (API Gateway execute-api URL), react-i18next with `en` as the sole locale file, manual one-command release flow on the CEO's Mac, local-only notifications.
- **Asana backlog populated**: APP-001 … APP-014 in "Vita frontend" Backlog (waves 0–2: foundations → identity & onboarding → capture & the log). APP-001 is the contract review of `docs/contracts/vita-api-v0.yaml` (backend is drafting it now).
- Still pending from Phase 0: **ADR-001 (stack choice)** not yet written in `Doc/ADRs/` — write it when implementation starts (or next session).
- No app code yet (`services/` empty by design — Phase 1 is spec only).

## Next steps

1. Write ADR-001 (React Native + Expo) in `Doc/ADRs/`.
2. Start APP-001: review `docs/contracts/vita-api-v0.yaml` once backend publishes it — verify idempotency keys + `updatedAt` on every log entity (outbox depends on it), auth endpoints (magic link token exchange for `vita://auth`), parse endpoints.
3. On Phase 2 approval: APP-002 (Expo scaffold) → APP-003/004/005 in parallel-ish order.
4. Ticket the rest of wave 2 later: **photo capture (plate + whiteboard)** was deliberately left out of this batch — add it after APP-011/012 land.

## Blockers / open items

- `docs/contracts/vita-api-v0.yaml` not yet published (backend, in progress) — blocks APP-001/006 onward.
- **Open CEO question (keep alive): capture-bar chrome — v1 bar vs v2 pill.** Default recorded in APP-011: build v2 pill only, component kept cheap to swap. Also still open from kickoff §7: dark mode (assumed light-only), tablets (assumed phone-only), min OS versions (proposed iOS 16+/Android 10+), cycle chip in v1 (hidden pending answer, see APP-013), trends computation split (app-side vs backend aggregates).
- Apple Developer + Play Console accounts needed before APP-007 (CEO creates; devops guide if missing).

## Key references

- `app/Doc/foundations.md` — fixed technical decisions.
- `app/Doc/kickoff-proposal.md` — architecture, waves, QA strategy, dependency list.
- `docs/ceo-decisions.md` — Rounds 3+4 are the newest constraints (placeholder DNS, budgets, `com.llmagal.vita`).
- Asana board "Vita frontend" project GID `1216519867368576`, Backlog section GID `1216523313289549`.

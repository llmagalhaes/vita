# Vita — session bootstrap

You are opening the Vita project. Vita is a personal health assistant ("a quiet log of meals, water & movement"), built **100% by AI agents organized as a company**. Read this, then the pointers below, before doing anything.

## Read order for a fresh session

1. **`Next_session.md`** (repo root) — the orchestrator's state: what just happened, what to do next. Start here to continue work.
2. **`DEVELOPMENT_PROCESS.md`** — how the company works (roles, tools of record, the session cycle, DoD). Source of truth for process.
3. **`docs/ceo-decisions.md`** — the dated decision log. Newest first. What's decided vs open.
4. **`docs/roadmap.md`** — the milestone plan and current priorities (what makes the app testable next).
5. **`docs/product-brief.md`** — what Vita is (screens, data model, philosophy).
6. The team you're acting for: **`<team>/Next_session.md`** — exactly where that team stopped and what's next.

## The three teams

| Team | Folder | Agent | Asana board (tickets) | Notion page |
|---|---|---|---|---|
| Backend | `backend/` | `team-lead-backend` | Vita backend `1216519867368580` | Backend |
| App (mobile) | `app/` | `team-lead-app` | Vita frontend `1216519867368576` | Mobile |
| DevOps | `devops/` | `team-lead-devops` | Vita devops `1216519867368584` | DevOps |

## Non-negotiables

- **The repo is the memory.** If it isn't committed, it didn't happen. The orchestrator commits; subagents do not run git (index races).
- **Tools of record**: Asana = tickets (DoD = *in production*), Notion (Vita page `39c213f6-aff4-804e-a42c-eea4269556f7`) = living docs, Git = code + decisions. Keep all three current at session close.
- **Product philosophy**: no goals, no scores, no streaks, no advice. Estimates labeled as estimates. Dual input everywhere.
- **Data responsibility**: store strictly what's necessary; sensitive data encrypted (crypto-shredding — see `backend/Doc/ADRs/ADR-0003`).
- **Keep it simple** (ponytail): no speculative abstraction, no onion architecture, shortest working change.

## Current state (update this line at each major step)

**Session 5 (2026-07-14): CEO live-test bug-fix pass** — CEO drove the app on a physical Android phone and filed 11 bugs; 8 fixed + pushed (`163e8c4..8f04847`), incl. the **#1-priority swipe-nav worklet crash (device-verified)**, habit-add crash, keyboard-covers-input, vacation button. Remaining need on-device verification (CEO tests on phone; do NOT boot the emulator): #6 Trends scrub, #3 sheet-drag fluidity, #4 export PDF. **Full ledger: `app/Progress/APP-CEO-BUGS-Progress.md`.** Feature backlog below remains complete.

Phase 2 — **"Vita 100% local" backlog COMPLETE** (session 4, 2026-07-14, commits `0ae4310..5a35dfa`). Contract **v0.4.0**. Backend `./gradlew check` 122 green + 6 LocalStack adapter tests (BE-017–027, ADR-0012 layout); app Jest 158 green, walkable in store Expo Go SDK 56 (APP-017–035, slices 1–8: water → workout+BodyMap → plan/program editable → photo → habits/check-ins/notifications → trends → account/vacation/export/energy → offline+E2E+fidelity). Two Fable audits (`docs/reviews/2026-07-14-fable-audit*.md`), both audits' fixes re-verified + a CEO live-test bugfix (Home layout, sheet drag-dismiss) + the offline-capture review-banner (CEO R12) landed. AWS parked (~$6/mo idle); no GitHub CI/CD; LocalStack for adapters; Terraform ready. **PARKED (CEO-gated, do NOT start autonomously):** hygiene sweep (BE-028/APP-037) → F-LAST deploy (AWS → Android/iOS vs AWS → Play/App Store; needs CEO secrets + Apple/Play accounts). Sessions run on Opus. Details in `Next_session.md` (root).

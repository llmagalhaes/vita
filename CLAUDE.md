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

Phase 2 — contract v0.3.0 built & tested LOCALLY; app↔backend core loop proven E2E against real Postgres. Backend BE-005–016 done (84 tests, ADR-0012 layout); app walkable in store Expo Go SDK 56; AWS parked (~$6/mo idle). **NEW backlog commissioned 2026-07-14: "Vita 100% local" — `docs/backlog-local-100.md`** (slices 0–9: water, workout, plan/program persist, habits+notifications, photo, trends, settings/vacation/export, debt, deploy LAST; planned by the 3 team leads in 2 reconciliation rounds). Next: slice 0 (OPS-018 app CI) → slice 1 (F1 Water). Deploy + Apple/Play accounts still wait on the CEO. Details in `Next_session.md` (root).

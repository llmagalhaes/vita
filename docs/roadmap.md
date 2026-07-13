# Vita — Delivery Roadmap

> Manager-owned priority plan. The goal is **testable increments**: each milestone puts something more functional in the CEO's hands while the teams keep building. Mirrored in Notion (Milestones page). Ticket IDs reference the Asana boards.
>
> Principle: build **vertical slices**, not layers. The app becomes testable early (mocked), then gets wired to a real backend. Late, rarely-first features (account deletion, export, vacation) come last — regardless of which "wave" a team filed them under.

## Status legend

`▶ now` = in progress · `next` = pull next · `later` = backlog · `✅` = done

---

## M0 — Foundations ✅ (mostly done)

Repo, agent structure, product brief, OpenAPI contract v0, per-team scaffolds, Terraform written, 18 ADRs. **Not user-testable.**
Remaining: push repo to GitHub; apply nothing yet.

## M1 — Playable app, mocked  ▶ now  ← *first thing the CEO can test*

**Outcome:** CEO runs the app on his Mac (Expo dev / simulator — **no store, no backend, no AWS needed**) and walks the core screens against mock data. Proves the UX and design end to end.

| Ticket | What |
|---|---|
| APP-002/003/004 ✅▶ | Expo scaffold, design system, i18n |
| APP-005 | SQLite + offline outbox |
| APP-006 | API client + **MSW mocks** (this is what makes it runnable with no backend) |
| APP-009 / APP-010 | Onboarding flow (6 steps) |
| APP-011 | Capture bar (v2 pill) + text capture → confirm (mocked parse) |
| APP-013 | Home / Today screen |

**Test path:** `expo start` → Expo Go or dev client on the CEO's phone. No Apple/Google accounts required for local dev.

## M2 — It's real: sign in + log a meal by text  next

**Outcome:** infra live, backend deployed, the core loop works end-to-end against production. CEO signs in with a magic link and logs a meal by text — for real.

- **DevOps (apply chain):** OPS-002 state → OPS-003 budgets → OPS-005 VPC → OPS-006 KMS → OPS-007 audit → OPS-008 ECR → OPS-009 RDS → OPS-010 SSM → OPS-013 API GW → OPS-014 Fargate. *(Gated on IAM creds + CEO plan approval.)*
- **Backend:** BE-004 first deploy → BE-005 crypto/DEK → BE-006 magic-link auth → BE-008 sessions → BE-009 profile → BE-011 entries → BE-012 timeline → BE-013 parse/text → BE-014 AI guardrails.
- **App:** APP-008 auth wired to real API; APP-011 capture wired to real parse; APP-013/APP-014 real data + meal detail.

**Test path:** Expo dev pointing at the prod API URL. Store accounts still not needed.

## M3 — A full day  later

Water quick-add, workout entries (from Apple Health / Health Connect), full Home timeline, meal detail, macros card. Rounds out "Today".
*New tickets to be written (water, workout detail, home cards, health ingestion).*

## M4 — Voice & photo capture  later

APP-012 voice (hold-to-talk, live transcript); photo capture (plate + whiteboard); backend photo parse. The richer capture modes on top of the working text loop.

## M5 — Plans, habits & check-ins  later

Eating plan + portion sliders; habits; **local** notifications; check-in stack (habit + plan check-ins). Backend plan/habit domains.

## M6 — Movement & trends  later

Workout detail with interactive body map; trends charts (scrubbable); deeper health integration.

## M7 — Account, vacation & export  later

Settings, vacation mode, PDF export — and **account deletion (BE-010 / BE-004-grace)**. Deletion is filed in the backend's auth wave but is a *late* product priority; it lands here, not early.

## M8 — Store release & hardening  later

Apple Developer + Google Play accounts (CEO), store builds (APP-007), security review, production go-live.

---

## Notes on the re-prioritization (why this order)

- **The app leads, mocked.** The fastest testable artifact needs no infra — so M1 is pure app against MSW mocks. The CEO tests UX in days, not after the whole backend exists.
- **One core loop first.** M2 is deliberately narrow: auth + text meal capture + see it. Water/workouts/voice/photo/plans/habits/trends all wait — they're additive to a loop that must work first.
- **Late features stay late.** Account deletion, export, vacation mode are correct to build near the end. They were flagged as mis-prioritized in the backlog; this roadmap fixes the order (Asana "To do" holds M1/M2 only; everything else stays in Backlog).

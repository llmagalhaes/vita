# Vita V4 — Master implementation plan (reconciled)

**Session 22 (2026-08-18), orchestrator.** Status: **proposal — awaiting CEO review. No code, no tickets filed yet.**
Inputs: `docs/v4/README.md` (binding handoff) · the three team plans in this folder
(`app-plan.md` · `backend-plan.md` · `devops-plan.md`, all Opus leads) · this file reconciles them
(same role as `docs/v3/reconciliation.md` in the v3 round). Where this file and a team plan disagree,
**this file wins** — the deltas are listed explicitly in §1.

Baseline at planning time: `main` @ `0997bea` · app tsc 0 · Jest 314/314 · backend check 227 · prod task-def `vita:9` (V009).

---

## 1 · Reconciliation decisions

**R1 — The day record rides the existing entries. There is NO `/days` resource.**
The app plan asked for `GET /days?from&to` + `GET/PUT /days/{date}` (app-plan §4.1); the backend plan modeled
day status as additive fields on the existing `meal`/`workout` entries with day status *derived* (backend-plan
§1.1). The backend model wins — it is strictly less machinery (no new table, no new endpoints, one expand-only
migration) and follows the CEO's Round-10 #1 rule (outcomes are the log). Consequences for the app:
- Recording a meal/workout status = writing the entry with `planMealId`/`planStatus`/`planOptionIndex`
  (`planDay`/`planStatus` for workouts). Close-the-day = a batch of those entry writes with idempotency keys;
  retro-close = the same batch with `occurred_at` = that day. **APP-094's persistence section changes**: the
  local `day_record` SQLite table stays as a *derived cache/index*, but the outbox drains ordinary entry ops —
  no new `dayRecord` op shape on the wire.
- The three consumers of the app's proposed compact index (calendar dots, Trends record counter, week detail)
  **derive locally** from the app's SQLite entries via SQL `GROUP BY` on the date (app-plan risk R6 already
  mandates SQL aggregation). Historical ranges the device hasn't seen hydrate lazily through the existing
  `GET /entries?from&to` paging, cached per range. Ceiling: a fresh reinstall must fetch history before the
  year counter is exact — acceptable at this scale; a compact index endpoint is the flip path if it ever measures slow.
- "Unrecorded" = no meal/workout record for that day (water alone does not close a day). An empty-items skipped
  meal is still a record — the "unrecorded ≠ empty" distinction the app needs survives.

**R2 — No `closed {at, mode}` on the wire.** Retro-close is derivable: `logged_at` after the recorded day's end
⇒ "closed later, by you" (backend-plan §2.2). The prototype's `Reopen` is local UI state; it never deletes records.

**R3 — Retire the portions overlay (BE-053 + V011): orchestrator recommends YES.** The backend flagged it
CEO-gated (breaking). But the app plan *already* folds the day-scoped portion state into the day record
(app-plan §2, `src/db/plan.ts` row) — after this round nothing calls `PUT /plan/portions` either way. Keeping
a dead table + endpoint serves no one. Needs the CEO's word (Q2 below), then V011 rides the same deploy.

**R4 — Weight**: new `weight` entry type + `WeightDetail{kg}` (both plans agree). Manual → backend (encrypted
detail, `Idempotency-Key: weight:<date>`, PATCH corrects); Health Connect readings → device-local, ADR-0016 stands.

**R5 — Device-local set (no backend work, confirmed by both plans):** composition flags (`domains` kv) ·
habit definitions/weekday schedule/per-habit notification switch · trends aggregation · HC data · export.
Habit *answers* stay `checkin` entries (already shipped) — the app's proposed `habits` map inside a day record
is dropped; the habit detail sheet reads `GET /entries?type=checkin` (backend confirmed 12-month paging is fine).

**R6 — Capture: no `ParseResult.planDelta` object.** The parse returns the matched meal's **full resulting
composition** with `planMealId`/`planStatus`/`replacesItemId` per item (backend-plan §3.6); the app computes
the signed kcal delta from the two items it already holds (it has the plan). APP-104's `delta.ts` consumes the
enriched draft; the loose-draft fallback stays for off-plan meals.

**R7 — Day-close notification hour = the existing `recapStartHour` setting** (default 20:00). This also answers
the session-21 open question: the 20:30 recap notification is *replaced* by the single day-close notification at
the chosen hour.

**R8 — "13 pages" on the parse card: dropped.** The backend never opens the PDF; keep "6 meals · N swap options"
from the parse result (backend-plan §5).

**R9 — Privacy-policy hosting (devops OPS-026) adds one backend micro-ticket: BE-055** — static `GET /privacy`
HTML route (~15 lines, the BE-035 fallback pattern). Gated on CEO Q10; the policy *text* is a CEO/product deliverable.

**R10 — Two build-discipline rules from the backend review, binding on app builders:**
(a) close-the-day and retro-close are ONE representation (per-meal records; only `occurred_at` differs) — do not
port the prototype's two disjoint shapes; (b) every client path summing `items` must tolerate an empty array +
zero `totals` (skipped meals).

---

## 2 · Consolidated wave plan

```
Phase 0  CEO reviews this plan + answers §5 (blocks everything below)
Phase 1  BE-047 contract v0.8.0 + ADR-0019 (0.5d, runs FIRST and ALONE — reconciled per §1)
         ∥ app APP-093/094/095 pure-logic halves may start (types regen waits for the contract)
Phase 2  backend BE-048/049/050 (parallel) ──► BE-051 plan-aware capture
         ∥ app wave 1 (APP-096 shell) ──► wave 2 (APP-097/101/102/103/104/105, 6 parallel)
Phase 3  app wave 3 (APP-098/099/100) ──► wave 4 (APP-106/107/108)
         ∥ BE-053 (if Q2=yes) · BE-055 (if Q10=API-GW) · OPS-026/027 prep (no prod contact)
Phase 4  adversarial Fable reviews (backend + app) ──► fix passes ──► orchestrator gates
Phase 5  ship: BE-052 image ──► OPS-025 (Terraform vita:10, V010[+V011], probes incl. PDF money-path)
         ──► APP-109 QA + fresh prod APK ──► CEO device checklist (app-plan §6 D1–D10)
Post     CEO-gated: OPS-027 publishing actions (AAB→Play App Signing→SHA-1→OAuth client), OPS-028 SES, OPS-029
```

Estimated build effort: app ≈18 builder-sessions across 6 waves · backend ≈3–3.5 days across 4 waves ·
devops rides the end. Realistically **3–4 orchestrator build sessions + 1 deploy session**, same shape as v3
(parallel Opus builders on disjoint trees → Fable adversarial review → fix pass → gates → commit).

## 3 · Ticket roster (proposed — file in Asana only after CEO approval)

| Team | Tickets | Count |
|---|---|---|
| Backend | BE-047..052 core · BE-053 (Q2) · BE-054 (backlog) · BE-055 (Q10) | 6 + 3 |
| App | APP-093..109 (waves per app-plan §3; APP-094 amended per R1, APP-104 per R6) | 17 |
| DevOps | OPS-025..029 | 5 |

## 4 · Top risks (merged)

1. **Gesture arbitration** (app R1) — the class of bug that broke swipe twice and PortionPop once. Mitigation
   baked into APP-096 + device checklist D1.
2. **Parallax/blur perf on Android** (app R2/R3) — UI-thread scroll handler mandatory; blur fallback built first.
3. **Plan re-import invalidates `planMealId` back-pointers** (both plans) — records are self-describing
   (title/items/totals), so past days render regardless. CEO re-imports the plan once after deploy (Q6).
4. **Scope** — 17 app tickets touch nearly every screen with the PDF-import money-path in the blast radius;
   APP-109/OPS-025 both re-drive the real `meal-plan.pdf` end-to-end before the round is called done.
5. **Health Connect carry-over** (APP-107) — session-21 hypothesis disproven; new lead: missing Android-14+
   `<activity-alias>` (`VIEW_PERMISSION_USAGE` + `HEALTH_PERMISSIONS`). Diagnostic build → fix → device-only verify.

## 5 · CEO decisions (consolidated, with defaults)

**Product/build-shaping — answers change what gets built:**
1. Day records persist server-side as entries (per Round-10 #1)? *Default: yes — the whole plan assumes it.*
2. **Retire the portions overlay** (BE-053 + V011, breaking)? *Orchestrator recommends YES (R3). Backend default was keep — your word decides.*
3. iOS "Connected sources" section: hide entirely until HealthKit exists? *Recommend: hide (empty section = fake surface).*
4. Manual "spent energy" (Round-10 #4) has no home in v4 — delete, or relocate to Library? *Recommend: delete.*
5. "Delete my data": keep the server-side 7-day grace (`DELETE /account`), or pure device wipe? *Recommend: keep grace.*
6. One plan re-import after deploy (no `m-N` backfill, per A2)? *Default: yes.*
7. Vacation semantics: "This week" auto-expires after 7 days; "keep water" keeps the water card + its notifications live? *Needs your word — prototype is copy-only.*
8. Scenic home only (classic not built)? *Default: scenic only.*
9. Composition flags device-local (reinstall re-asks onboarding step 2)? *Default: device-local.*

**Infra/publishing — defaults proceed unless you object:**
10. Privacy policy served from the existing API Gateway (`…execute-api…/privacy`, $0, ugly URL) vs buy a domain now? *Default: API-GW; domain later swaps the URL.*
11. S3 meal-photo 30-day expiry — v4's browsable past days make it sharper: photos older than a month are gone. *Devops recommends keep 30d.*
12. SES production access — devops drafts the justification, you submit? *Default: yes (free).*
13. Upload keystore: you generate + hold it yourself (devops never touches signing credentials). *Confirm.*
14. Plan-aware capture adds ~1.5–3k input tokens per capture (a few cents per hundred) — budget OK? *Default: proceed.*
15. Budget alarm: RDS free-tier lapse will take ~$19→~$34/mo vs the $40 alarm. Raise it now or let it fire? *Default: let it fire.*

**Housekeeping:** `docs/v4/meal-plan.pdf` is **NOT committed** — the handoff itself says anonymize first.
Decide: anonymize + commit, or keep it out of git (note: `docs/v3/.../meal-plan.pdf` is already committed as-is
from session 18c — same question applies retroactively). BE-054 (`units` cleanup) → backlog.

## 6 · Next steps

1. CEO answers §5 (or accepts the defaults wholesale).
2. Orchestrator files the tickets (Asana) with the amended texts (R1/R6 folded into APP-094/APP-104, §1 folded into BE-047).
3. Build rounds per §2 — BE-047 first and alone, then the parallel waves.

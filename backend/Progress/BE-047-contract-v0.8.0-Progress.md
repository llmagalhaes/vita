# BE-047 — Contract v0.8.0 + ADR-0019 (v4 day record, weight, /me/settings, plan-aware capture)

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1217618691422522
Status: **executed 2026-08-18** (session 22, backend lead). Orchestrator commits; I ran no git.

## What landed

**`docs/contracts/vita-api-v0.yaml` — 0.7.0 → 0.8.0, ALL ADDITIVE.** No field removed, no type
narrowed, no status code changed. `PUT /plan/portions` untouched (CEO Round 13 #2 keeps the portions
overlay — BE-053/V011 do NOT run), which is what keeps 0.8.0 non-breaking: the app can adopt it with
no coordinated cutover.

| # | Section | Change |
|---|---|---|
| 1 | `info.version` + `info.description` | 0.8.0 + the round's summary paragraph |
| 2 | `tags` | + `public` (for `/privacy`) |
| 3 | `MealDetail` | + `planMealId` / `planStatus` (`done`\|`adjusted`\|`skipped`) / `planOptionIndex`; `items` minItems 1 → 0 |
| 4 | `MealItem` | + `replacesItemId` |
| 5 | `WorkoutDetail` | + `planDay` / `planStatus` |
| 6 | `NewEntry.type`, `EntryDetail.oneOf`, `GET /entries` `type` filter | + `weight` |
| 7 | new `WeightDetail` | `{kg}` 20..500, metric-only |
| 8 | `PlanMeal` | + `id` (`m-1`…`m-N`) |
| 9 | `/parse/text`, `/parse/photo` | prose only — plan-aware capture |
| 10 | new `GET/PUT /me/settings` | opaque encrypted blob, LWW, ~64 KB cap, hydrate-before-push rule |
| 11 | new public `GET /privacy` | no auth, `text/html` |
| 12 | `GET /entries` description | its second role: the reinstall restore read (docs only) |

**`backend/Doc/ADRs/ADR-0019-contract-v0.8.0-v4-day-record-weight-settings-blob.md`** — 11 decisions
(day status derived not stored; close/retro-close are one representation differing only in
`occurred_at`; plan linkage rides the encrypted detail; records self-describing so stale
`planMealId` back-pointers are accepted; `PlanMeal.id`; weight manual→backend / HC→device-local with
ADR-0016 standing; `user_settings` C3 blob reversing the device-local default; `GET /entries` as the
restore read; plan-aware capture reuses the parse endpoints; portions overlay retained by CEO
decision; public `/privacy`).

Note: the orchestrator brief pointed at `backend/services/vita-api/Doc/ADRs/`; the repo's actual (and
`CLAUDE.md`-documented) location is `backend/Doc/ADRs/` — ADR-0019 sits with ADR-0001..0018.

## Validation

- `npx @redocly/cli@2 lint docs/contracts/vita-api-v0.yaml` → **valid, exit 0**. 45 warnings vs **40**
  on the `HEAD` baseline; the +5 are the same pre-existing cosmetic classes (3 × `operation-operationId`
  for the three new operations, 1 × `tag-description` for the new `public` tag, 1 × `operation-4xx-response`
  on `/privacy`, which has no 4xx by design). **Zero errors.**
- `npm run api:check` in `app/services/vita-app` → generates cleanly (openapi-typescript 7.13.0 parsed
  the file without error — a second, independent structural check) then reports drift vs the committed
  `src/api/types.gen.ts`. **Expected**: type regen is app-team work in the next wave. Temp file removed.

## Decisions taken here that were NOT pre-specified

1. **`/privacy` lives under `/v1`** (`<PUBLIC_BASE_URL>/v1/privacy`), not at the gateway root. Reason:
   `/v1/auth/link` (BE-035) is already a public browser-facing route under `/v1` and works; a root-level
   route would need a second API-GW route + a Spring context-path exception for one static page.
   `ponytail:` if a domain is ever bought the URL changes and this route stays as the origin.
2. **New `public` tag** rather than filing `/privacy` under `account`/`auth` — it is neither.
3. **`WeightDetail` documents the two-source Trends line explicitly** (typed readings survive a
   reinstall, HC ones re-sync) so nobody later "fixes" the deliberate partiality by backfilling HC
   weights into `/entries`.

## Follow-ups / flags

- Migration numbers claimed this round: **V010** (weight type), **V011 burnt/unused** (portions overlay
  stays), **V012** (`user_settings`). BE-049 takes V010, BE-056 takes V012.
- App team must honour two rules that are easy to miss: any path summing `MealDetail.items` must
  tolerate an empty array + all-zero `totals`; close-the-day and retro-close are the same write.

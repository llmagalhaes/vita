# APP-037 — Mobile app hygiene sweep

Asana: Vita frontend board (`1216519867368576`). CEO un-gated the sweep (was PARKED
alongside BE-028). Ponytail mode active repo-wide.

## Goal
Delete dead code, fix comments, fix code smells, add the missing app README with
Mermaid diagrams. **Zero regression** — motion/gesture work from sessions 5–6 is
device-verified and fragile; keep the idiomatic RN structure (CEO: do NOT impose the
backend's layer-first layout). Keep load-bearing seams (voice/OIDC/notifier stubs).

## Finding: the codebase was already clean
Sessions 4–6 kept it tidy, so this was a **surgical** sweep, not a demolition.
Verified with scripted scans (kept in scratchpad during the session):
- **No dead files** — the only "never-imported" hits are Jest auto-mocks
  (`__mocks__/*`) and the `integration:smoke` script entrypoint, all load-bearing.
- **No dead i18n keys** (433 keys; dynamic-prefix lookups make deletion unsafe anyway).
- **No empty/swallowed catches** — all 14 `catch {}` carry a rationale comment.
- **No stray `console.*`, no commented-out code.**
- **No genuinely-dead exports.** The cross-file scan's hits were all
  used-internally or test-seams; the only fully-unreferenced export is
  `setRecognizer` — a **deliberate seam** (real STT swaps in at APP-007), kept.
- **Comments are load-bearing** (poison-pill taxonomy, worklet px-vs-% rule,
  Rules-of-Hooks, D1/D8 product decisions, Expo Go constraints). No narration to cut.

## Changes made (all real, all small)
1. **`src/api/client.ts`** — dropped the stale `(v0.3.0)` header pin (contract is
   v0.4.0; a pinned version rots). Now points at the generated file instead.
2. **`src/db/vacation.ts`** — `isVacationActive` reused the range-membership
   predicate that already exists as `vacationExcluder` in `trends/aggregate.ts`
   (vacation.ts already imported from there). Removed the duplicated inline predicate.
3. **`src/tabs/Home.tsx`** — the check-ins banner and the offline-review banner were
   ~35 lines of identical JSX differing only in count/title/sub/onPress. Extracted a
   local `CountBanner` component; net ~40 lines removed. The fragile two-column
   water/macros `flex:1` row and all mount-anim/worklet code were **not touched**.
4. **Unused imports removed** — `WaterDetail` in `src/export/pdf.ts`, `EstimateTag`
   in `app/onboarding.tsx` (tsc has `noUnusedLocals` off, so these slipped through).
5. **`src/tabs/Habits.tsx`** — removed dead const `WEEKDAYS` (never referenced;
   `EVERY_DAY` is the one actually used).

## Deliberately NOT done
- **No structural moves / file renames** — the RN feature-folder + `src/ui` layout is
  already idiomatic; moving files for cosmetics is not hygiene (CEO directive).
- **No gesture/worklet refactors** — TabsPager pan, SheetOverlay/useSheetDrag,
  mount-anim (`useStartOnLayout`), scrub-vs-pager, PDF export path all left exactly as
  device-verified in session 6.
- **Did not drop `export` on internally-used symbols** — 20+ trivial keyword edits,
  no reader benefit, pure churn risk near tested code.
- **Did not delete i18n keys** — dynamic-key lookups make static deletion unsafe.
- **Kept all stubs** (voice/OIDC/notifier) — load-bearing seams for APP-007.

## New: `src/services/vita-app/README.md`
First README for the app. Covers what Vita is, the stack + why, how to run
(mock mode / real backend via `VITA_API_BASE_URL` / the `vita` launcher / Expo Go
SDK 56 constraints + magic-link caveat / release builds), the test commands, project
layout, load-bearing seams, and the gesture/motion invariants. **Three Mermaid
diagrams**: high-level architecture (screens → useLogVersion → SQLite/outbox → API
client → backend), the offline/outbox sync flow (op types + needsReview banner +
poison-pill taxonomy table + decision flowchart), and the navigation/screen map.

## Gates
- `npx tsc --noEmit` → **0 errors**
- `npx jest` → **168 passed / 34 suites** (unchanged; none deleted to pass)
- `npx expo export` → **OK** (production bundle builds)
- No new dependencies. No behavior change visible to the user. Product philosophy
  (no goals/scores/streaks/advice) intact.

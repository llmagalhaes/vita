# Vita v4.3 — Reconciled plan (edit screens) + R19 native modals

> Orchestrator reconciliation of `HANDOFF_v4.3_edit_screens.md` (binding on behavior/copy)
> against the real app (binding on mechanism). Session 24 post-close, 2026-08-28.

## Headline

Two dedicated full-screen editors — `app/(main)/edit-plan.tsx` and `app/(main)/edit-program.tsx` —
that draft FROM the cached doc and save via the existing **PUT** chokepoints
(`db/plan.updatePlan` / `updateProgram`), preserving server ids, swaps, options and bounds.
They SUPERSEDE R18-F's builder-as-editor (its entry rows and `?edit=1` modes are removed).
Separately, R19: the centered pops (Macros, PortionPop) move to OS-native modal presentation.

## Reconciliation decisions (binding)

| # | Topic | Decision |
|---|---|---|
| R1 | Screens | Routes, not z-index overlays: `edit-plan.tsx` / `edit-program.tsx` under `(main)`, default `fade_from_bottom`, BuilderShell-style header chrome (back 42px per house override, eyebrow, right label `Editing`). PickExerciseSheet portals above the route naturally (PopHost) — no z-index work. |
| R2 | Save path | **PUT, not POST.** `updatePlan(doc)` / `updateProgram(doc)` (already in `db/plan.ts`) — BE-058 guarantees PUT round-trips ids, so day decisions keyed by `it-N` (swaps chosen, skips) survive. POST would re-stamp ids and orphan them. Draft carries `src` refs to the ORIGINAL doc objects (meals/items); save spreads `{...src, ...edits}` exactly like handoff §2.6 so `options`, `swaps`, `nutritionPerUnit`, `portion` bounds, `id` ride through untouched. Server is authoritative on `portion` — but §2.6's max-raise rule maps to: DON'T send a client-fabricated portion; the server recomputes bounds on PUT from qty/unit (verify — if PUT preserves stored bounds verbatim, keep `src.portion` and let the server's heuristic handle the ceiling; builder reads PlanService to confirm and documents which). |
| R3 | Pricing lens | `effectivePerUnit` from `src/plan/compute.ts` is the ONE pricing function (covers nutritionPerUnit, kcal-only hand-built items, swapped items). `epIK = round(per × q)` per item, sums per §2.2 order. No `~` marks in the editor (handoff §2.3 rule) — Day surfaces keep their own conventions. |
| R4 | Add-food estimate | Via the existing `estimateKcal` seam (server hybrid table→cache→Claude; estK table offline/mock) — NOT prototype estK-first-word. Store the result as `kcal` total + `kcalEstimated: true` (hand-built convention; Day renders `~` per APP-134, the editor renders plain per handoff). Re-pricing on qty change uses `effectivePerUnit` fallback kcal/q — same proportional behavior as §2.4's `per`. Criteria 12/13's exact 120/220 numbers are prototype-only (first-word bug is superseded by real lookup); the acceptance is: added item gets a sane estimate, form stays open, unit sticks. |
| R5 | Day-override hygiene on save | §2.6's `qtyOv:{}` maps to: clear the LOCAL day portion overrides (kv qty overlay) after a successful save; server portions overlay — call the existing portions reset/clear client path if one exists, else PUT an empty portions map (verify client.putPlanPortions semantics). Day decisions keyed by preserved ids (skips/swap choices/opts) are NOT cleared (§2.6 table). `mealOpen`-equivalent: close any expanded timeline card state if the app keeps one. |
| R6 | Program save | ONE doc PUT — the app derives everything (`WKS`/`MUS`/`EXMU` are prototype structures; the app's Day/Trends/muscle views read the doc via muscleData). Proportional kcal per §3.6 onto `ProgramDay.kcalEstimate`: load = Σsets×reps + Σmin×15 per day; new = round(old × load1/load0) when both >0; fallback round(load×1.85) only when the day had no kcal; load 0 → omit kcalEstimate. `exOv:{}` maps to clearing the local day exercise check-offs (getDaySkips/clearDaySkips family — keyed by day+exercise name; clear only for edited days, or all — builder picks the simplest correct and documents). |
| R7 | exLook | Port §3.2's two-pass exact→word-subset (catalog tokens ⊆ name tokens, longest-catalog-name-first) into `src/workout/exerciseCatalog.ts` as `lookup(name)`. Editor uses it for muscles/soft; free/unmatched → `{mus:{}, soft:true}` `not mapped`. Contract `muscleRoles` on the SAVED doc: preserved verbatim from `src` for untouched exercises; ADDED exercises get roles from EXCAT weights at the `.7` cut (same as builder). |
| R8 | Entry points | Library cards become the §1 two-button rows (`Edit this plan` primary flex 1.25 / `Import or build` outline; `Edit these sessions` / `Import or type`). Edit buttons render ONLY when a doc exists. **R18-F removal:** the Edit rows in both sheets, `PencilGlyph` usage there, the `?edit=1` builder modes and the reverse converters (`fromPlanDoc`/`fromProgramDoc`) are deleted — builders return to pure builders. (Keep `wireTime`/shared bits still used elsewhere.) |
| R9 | Time field | Native TimeField (R18-D component) instead of free text, 24h HH:MM — handoff §8 says exactly this for production. |
| R10 | Shared picker | Same `PickExerciseSheet` component rendered by the editor route with its own `onAdd` (adds to the open session, expands the new row per §3.5). `dayName` prop = session name. No `pkTgt` global needed — per-route instance IS the sharing. |
| R11 | Sessions immutable | Rename/add/remove session out of scope (§3.7) — matches the app: program days are name-keyed. Footer note copy included. |
| R12 | Dirty check | Structural compare over a src-free projection (`JSON.stringify` of a mapped draft WITHOUT the `src` refs) captured at open. Same footer states (`Save the changes` / inert `Nothing changed yet`, equal heights). |
| R13 | Mock | Both editors fully walkable in mock (`updatePlan`/`updateProgram` must exist in mock.ts — add if missing; mock estimate path already exists). |

## R19 (separate ticket) — OS-native modal presentation

The centered pops the CEO flags (Macros "recorded" pop, PortionPop / meal unit adjust) still stutter
after two custom rounds. Decision: stop fighting — move them to **native transparent-modal screens**
(expo-router `Stack.Screen` with `presentation: "transparentModal"`, native `animation: "fade"`,
rendered by react-native-screens = the OS animates). Session-21 lesson stands: RN `Modal` is
FORBIDDEN (Reanimated+RNGH deadlock/ANR); react-native-screens modals are real native screens where
RNGH works. Backdrop = the same SheetBackdrop recipes. If a pop's gesture (PortionPop slider) or the
blur-target interplay breaks under native presentation, fall back per-surface and report honestly.

## Tickets

APP-139 edit-plan screen (L) · APP-140 edit-program screen (L) · APP-141 entry points + R18-F removal + mock PUTs (M) · APP-142 native modal presentation for pops (M). No backend change (PUT paths shipped in v0.8/0.9).

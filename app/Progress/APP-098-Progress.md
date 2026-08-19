# APP-098 — Day timeline ("Your day")

Session 22, v4 wave 3. Builder: Opus. Sources: `docs/v4/README.md` §3 *Timeline* + §4 screen 2,
prototype `Vita Prototype v4.dc.html` lines 520–712 and its data builder 1388–1460 / 1600–1670.
Consumes APP-094 (day record), APP-095 (domains), APP-097 (DayPanel), APP-101 (muscle map),
APP-093 (`mixOklab`), the session-21 PopOverlay/popHost rule.

## Files

**New — `src/day/timeline/`**
- `Timeline.tsx` — the pure node list (`timelineNodes`), the rail dot map (`dotColor`), the row
  chrome (`TimelineRow`), the day-closed flag, and the screen component that mounts the four cards.
- `MealNode.tsx` — the meal card + the expanded editor + the portion modal wiring (`itemRows` pure).
- `WorkoutNode.tsx` — the 18:00 card, Exercises|Muscles segmented view (`workoutState`,
  `buildWorkoutRecord` pure/exported — Timeline's close path reuses the builder).
- `CloseDayCard.tsx` · `RecapNode.tsx` — presentational; Timeline owns the writes and the undos.
- `__tests__/timeline.test.tsx` — **14 tests**.

**Changed**
- `src/day/DayPanel.tsx` — mounted `<Timeline />` at the marked APP-098 point (one added line + a
  comment). APP-099 landed in the same file concurrently; their dock/PastDay block was left alone.
- `src/plan/PortionPop.tsx` — adapted (below).
- `src/ui/tokens.ts` — **one additive line**: `colors.recap.textSoft` (`rgba(247,240,228,.65)`), the
  recap footer ink the token file was missing. Nothing existing touched.
- `src/i18n/locales/en.json` — the whole `timeline.*` region (my region only).

## The one decision that isn't in APP-094

**A day needs a `closed` flag and no record can carry it.** APP-094 deliberately kept `closed`
off the wire (R2: "closed later, by you" is *derived* from `loggedAt`), and that is right for
the wire — but "I closed this day" and "every meal happens to be confirmed" are different
statements, and `Reopen` has to be expressible. So `Timeline.tsx` keeps a **device-local
date-keyed kv flag** (`day.closed.<date>`), exactly the shape of APP-094's overlay: no timers, no
rollover reset, yesterday's key is simply a different key. `isDayClosed` / `setDayClosed` are
exported for APP-099's retro-close and for the day-close notification.

"Leave open" is session state (`useState`), not a record — same as the prototype's `closeHide`.

## Fidelity notes (values are the prototype's, not approximations)

- **Rail**: 40px column, time 10/800 ls .2 `#B7AB9C`, dot 9px, connector 2px `rgba(120,100,75,.10)`,
  gap 11, rail `paddingTop 12`, card `paddingBottom 12` — all from `dayState` tokens. The **last**
  node drops the connector so the line doesn't dangle past the day (the prototype's last row has
  nothing under it either).
- **Dots**: done `#8CA58A` · adjusted `#C98A3F` · skipped `#D9CFBD` · **due-now accent** · future
  `#E4DCCB`; "now" is accent on the close card and `#453E35` on the recap.
- **Due card**: `1.5px mixOklab(accent, 32, #FFFDF7)`; everything else `1px` hairline. Only a
  **planned AND due** meal shows the inline "As planned" (accent CTA, flex 1.4, h42/r21, check icon,
  accent-tinted shadow) / "Adjust" (outline, flex 1) row.
- **Future meals**: sub-line gains "· later today"; **no confirm row, no skip link** — Vita never
  offers to record something that hasn't happened.
- **Stagger**: meals `i × 45ms` **in plan order**, workout a flat 160ms, then merged by slot time —
  so the fade-in order is the plan's, not the render order's (asserted in the tests). `vtFade` =
  8px rise + fade, 350ms, via `FadeInDown.withInitialValues`.
- **Expanded meal**: dashed top hairline, option chips under "Options — any of these is on plan"
  (10/800 ls 1), item rows (7px `#E8B48C` dot · name 13.5/600 · `swapped` badge · qty 11.5/700 ·
  kcal 11 right, `—` when skipped), then "Didn't have this meal" (underlined, `#B7AB9C`, due only).
- **Workout**: 34px `#E7EDE1` well + dumbbell, green kcal badge, program chips, segmented control
  (track `#F0EDE2` r14 pad 3, active `#453E35`/`#F7F0E4`), 22px checkbox rows, BodyMap at
  `maxWidth 250` + tier chips → `MuscleSheet`, footer "Programs live in the Library — this only
  records today."
- **Close card**: accent label 10.5/800 ls 1.2, line 15/700, sub 11.5 `#8A7E70`, buttons 46/r23
  (1.35 / 1), border `mixOklab(accent, 35, card)`, `vtPop` entrance.
- **Recap**: `colors.recap` gradient 135°, moon + "Day closed" + Reopen pill, line 14.5/600, footer
  12 on the new `textSoft` token, `0 12px 30px rgba(60,45,30,.18)`.
- **Footer** under the whole zone: "Counters, not scores — Vita only shows what you recorded."

## Writes — all through the APP-094 model, all undoable

| Action | Write | Undo |
|---|---|---|
| As planned | `recordMeals([buildMealRecord(date, meal, "done", overlay)])` | previous record, or `deleteEntry` |
| Didn't have this meal | same, state `skipped` (zero items, zero totals — R10) | same |
| Option pick / portion / item skip | `setOverlay(date, …)` — **day-scoped**, never `PUT /plan/portions` | previous overlay + previous record |
| Exercise tick | `recordWorkout` with exactly the ticked exercises; all ⇒ `done`, else `adjusted` | previous record, or `deleteEntry` |
| Close the day | `closeDay()` (**due meals only**) + the due training day | deletes every entry it wrote, reopens |

**The rule that keeps the record honest:** changing the composition of a meal that is *already
recorded* re-records it as `adjusted`. Without it the card and its entry drift apart the moment a
portion moves, and APP-094's self-describing guarantee (R7) is silently broken.

## Bug avoided at the root

`optionIndexFor` reads `ov.option[id] ?? meal.usualOptionIndex`, so an absent key means "use the
persisted usual" — there was no way to say "today I want the BASE composition" on a meal whose
usual is an option. Fix without touching APP-094: the base chip stores **`-1`**, and
`meal.options[-1]` is `undefined`, which `optionIndexFor` already reads as base. No sentinel type,
no new field (`MealNode.BASE_OPTION`).

## Gates

- `npx tsc --noEmit` — **clean, whole repo** (APP-099's `dayTravel.test.tsx` errors seen mid-build
  were fixed by them concurrently).
- `npx jest src/day src/plan` — **8 suites, 84/84 green** (this ticket adds 14).
- `npx jest src/__tests__/today` — 5/5, the other `PortionPop` consumer still passes.

## PortionPop adaptation (one optional prop, v3 untouched)

`onSkip?: () => void`. Present ⇒ v4 day mode: caption becomes "Only counts for today — tomorrow
starts from the plan again." and a centered underlined "Didn't have it today" appears under Done.
Absent ⇒ the v3 Today screen renders exactly as before (`today.forTodayOnly`), which is why the
i18n rule ("your `timeline.*` region only") could be honoured without rewriting `today.*`.
The amber `+` / green `−` / neutral `0` delta badge already existed (APP-079) and is unchanged.

## Deviations from the ticket text

| Ticket / prototype | Built | Why |
|---|---|---|
| separate `mealOpen` + `wkOpen` | ONE `open` key | less state, identical on a phone-width column |
| "closes only DUE meals" | due meals **+ the due training day** | the prototype's `doCloseDay` closes `pendWk` too; read as "only the ones that are due" |
| option items are fixed text rows | tappable like base items | our contract's `options[].items` are real `PlanItem`s with ids — the prototype's read-only rows were a data limitation, not a design one |
| — | timeline mounted **today only** | a past day is APP-099's status card; the prototype's `todayOn` gates the whole timeline block, and two surfaces for one day would be worse |
| swap picking | badge only, no picker | the searchable swap sheet is another ticket; the overlay `swap` half renders and prices correctly already |

## Not done / handed on

- **`src/tabs/home/{Timeline,DaySection,timelineData}` NOT deleted.** v3 `src/tabs/Home.tsx` still
  imports `DaySection` *and* `Timeline` (lines 38–39), so tsc proves them referenced → **APP-108**.
- `recapLine()` and `closeLine()` still hold English fragments in `src/day/state.ts` (APP-094's own
  ponytail note). The recap node uses `recapLine`; the close card builds its sentence from
  `pendingMeals` + `timeline.close.*` so the card itself is fully i18n'd. APP-108 owns `state.ts`.
- The timeline computes `nowMin` once per render — a meal does not flip to "due" while the screen
  sits open. The prototype is static too; APP-099's day travel re-renders it. Add a minute tick only
  if a device pass flags it.
- `dailyTotals` for the portion modal's live card is `planDailyTotals(plan, overlay.qty)` — the v3
  semantics; it does not fold item skips/swaps/option picks into the *daily* number (the per-item
  numbers are exact). Cheap to upgrade to `sumTotals(composeItems(...))` per meal if the CEO reads
  the pop's top card as "today's real total".

## Device-verify list (CEO)

1. Meal stagger: the cards should fade in **top-down in plan order**, not all at once.
2. The accent 1.5px border appears on exactly the meal that is due now — and moves through the day.
3. "As planned" → toast with **Undo**; tap Undo and the card must return to `planned`.
4. Portion modal must open **centered on the screen** (popHost), not sunk into the scroll content.
5. Workout card: switch to **Muscles**, tap a chip → the muscle sheet opens over the Day panel.
6. Evening (or set the recap hour low): the Close card is the last node; one tap → the dark recap;
   `Reopen` puts the day back **without erasing anything**.
7. The rail line must stop at the last node, not run past the recap card.

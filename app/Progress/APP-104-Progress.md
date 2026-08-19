# APP-104 — Capture as a plan delta + frosted pill

Session 22, v4 wave 2. Builder: Opus. Ticket text: `docs/v4/app-plan.md` APP-104,
amended by `docs/v4/PLAN.md` **R6** (no `ParseResult.planDelta` — the app subtracts).
Fidelity source: `docs/v4/README.md` §3 "Capture pill" + prototype lines 866–878
(`pillOn`) and 983–1022 (`capListenOn` / `capTextOn` / `capParsedOn` / `capPhotoOn`).

## The shape of it

The parse hands back the matched meal's **full resulting composition**
(`planMealId` / `planStatus` / `planOptionIndex` + `replacesItemId` per item). The
delta is computed app-side against `composeItems(meal, todaysOverlay)` — the two
compositions the app already holds. Recording writes **one self-describing meal
record** (APP-094) with the parse's own items, byte for byte, so the card's
"~679 kcal" and the day's number can never disagree.

**The day overlay is deliberately NOT written.** It is the *pre-record* tweak
surface (portion/skip/swap "only counts for today"); once a meal is recorded the
record is what renders. Writing both would be two truths for one meal — and the
overlay's swap-equivalence math would re-price the item and contradict the parse.

## Files

**New**
- `src/capture/delta.ts` — pure. `planDelta(draft, meals, overlay)` → `PlanDelta | null`
  (title/state/totals/`kcalDelta`/`lines`), `applyDelta(day, delta, at)` → `{day, record, undo}`,
  `revertDelta(day, undo)` → `{day, restore?, remove?}`.
- `src/capture/__tests__/delta.test.ts` (7) — swap / as-planned / skipped / overlay-aware /
  null fallbacks / both round trips.
- `src/capture/__tests__/capture-delta.test.tsx` (3) — pill → sheet → Record it → one
  deterministic day-record entry; Undo removes it; off-plan keeps the loose card.
- `src/day/selection.ts` — which day the Day panel shows (module store, defaults to
  today). **APP-099 is the writer** (`setSelectedDate` from the dock/calendar); APP-104
  is the first reader: the pill exists only on today. 30 lines, no persistence.

**Changed**
- `src/capture/CapturePill.tsx` — rebuilt as the frosted pill. The v3 three-shortcut
  nav row and the inline text field are **gone** (panel tabs own navigation; text
  capture moved into the sheet, per the prototype).
- `src/capture/CaptureSheet.tsx` — `+PlanDeltaCard`, `+PhotoConfirmCard`, `+DeltaActions`,
  `+TextCapture`, `+SectionLabel/StateTag/DeltaRow`; the v3 `DraftCard` branch stays for
  everything the plan doesn't match.
- `src/capture/CaptureContext.tsx` — `"text"` status; `deltas[]` parallel to `drafts`;
  `recordDelta` (day record + toast/Undo + expand signal); `requestTextEntry(prefill?)`
  replaces the `prefill`/`textEntryNonce` pair; `+signalExpandMeal/useExpandedMeal`.
- `src/capture/VoiceOverlay.tsx` — listening restyled to the prototype: **5** `vtWave`
  bars (6×30 r3, accent, delay i×130ms), cream sheet, "Listening…" 15.5/700, the italic
  example phrase, "release the mic to finish".
- `src/api/mock.ts` — `// ─── APP-104 region ───` `mockPlanPhoto()` (uncaptioned plate →
  the nearest plan meal as a **confirmation**, `planStatus:"done"`), wired into
  `parsePhoto`; the seeded `storedPlan` is now `stampPlanIds(handoffPlanV3())` — without
  "m-N" meal ids nothing can point at a plan meal and the whole plan-aware path was
  unreachable in mock mode. **The `deleteEntry` region (APP-112) was not touched.**
- `src/i18n/locales/en.json` — `capture.textTitle/matchIt/textEntry`, `capture.delta.*`,
  `capture.photo.{fromPhoto,looksLike,confirmSub,recordIt}`, `capture.voice.{releaseHint,example}`,
  and `capture.placeholder` → the prototype's example line.
- `src/__tests__/{capture,workout,voice-capture}.test.tsx` — updated for the moved field
  (`openField()` presses "Aa" first) and the new listening copy. Same assertions otherwise.

## Fidelity notes (values, not vibes)

| Prototype | Built |
|---|---|
| container `rgba(255,253,247,.55)` blur 20 sat 1.5, border `rgba(255,253,247,.72)`, r32, pad 7×9 | `tokens.capturePill` + `shadowPill` (`0 12px 34px rgba(50,38,26,.25)`) |
| `vtPillX` max-width 54→280, .5s `cubic-bezier(.22,.9,.32,1)` | `motion.vtPillX`, animated `maxWidth` + opacity .5→1 |
| `vtPillBtn` scale .4 pop, delays .3s/.38s | `motion.vtPillBtn`, `withDelay` per side button |
| Aa / camera 40px `rgba(69,62,53,.08)` ink `#453E35`; mic 52px accent + `0 8px 20px accent@40%` | exact; mic + camera SVG paths lifted from the prototype 1:1 |
| bottom 26, z 55, visible only on today's Day with no sheet | `pathname === "/day"` + `useSelectedDate() === dayKey()`; a sheet slides it away (translate 120 + fade, pointer-events off) |
| delta card: label 11/800 ls1.2 · name 15.5/700 · state tag 9/800 `#F7E7D4`/`#A66A3F` · `~N kcal` 12/700 · strike-through row + signed badge (green `#E7EDE1`/`#5F7A61`) · closing 11 faint | exact, from `colors.green/amber/sandChip` |
| Discard h46 r23 border 1.5 ink `#6E6355` \| Record it flex 1.3 accent + `0 10px 22px accent@30%` | inline `PressScale` pair (the shared `Button` renders a ghost in accent ink — wrong here) |
| photo → "Looks like your plan's Lunch" / "~702 kcal — you confirm, Vita never guesses alone" / "It's that — record it" | exact |
| Android frosted | same `ANDROID_BLUR` ladder as `PanelTabs` (APP-096 D1): translucent fill ships, one boolean flips the real blur for the device pass |

## Deviations (deliberate, 4)

1. **No overlay write on Record it** — see above. `setOverlay` stays the pre-record
   surface; the record supersedes it. (APP-094's handoff mentioned both; only the
   record can carry the parse's own numbers.)
2. **A quick tap on the mic opens the text field** (shipped behaviour) instead of the
   prototype's pointer-down/up, which would start-and-stop a recording on a stray tap.
   Hold-to-talk + slide-to-cancel are unchanged.
3. **Slide-to-cancel kept.** The prototype's listening state only says "release the mic
   to finish"; that copy is now the hint, and "Release to cancel" replaces it once the
   drag arms. Losing the affordance would be a regression, not fidelity.
4. **No camera-preview strip in the photo card.** The prototype's is a placeholder
   (`repeating-linear-gradient`, "camera preview") and the context does not retain the
   image after `/parse/photo`. Add it when the photo path keeps the URI.

## Gates

- `npx tsc --noEmit` — **clean** (whole app).
- `npx jest src/capture src/api` — **8 suites, 59/59 green**.
- Full suite: **64/66 suites, 434/437**. The 3 failures are NOT this ticket:
  `src/day/__tests__/overview.test.tsx` and `src/nav/__tests__/panelShell.test.tsx`
  (APP-097's in-flight `DayPanel` rename — `panelShell` expects the "Today" heading twice).

## Handoff

- **APP-098 (timeline):** `useExpandedMeal()` from `src/capture/CaptureContext` is the
  "open this meal" signal — recording a delta sets it to the touched `planMealId`; the
  Undo sets it again. Nothing consumes it yet.
- **APP-099 (dock/calendar):** call `setSelectedDate(date)` from `src/day/selection.ts`
  — that single call is what hides the capture pill on a past day.
- **APP-108 (strings):** `capture.voice.slideToCancel` is now unused; `capture.log` is
  only the mic's a11y label.
- The pill still accepts `pathname === "/home"` while the v3 route redirects; drop that
  clause when `/home` goes.

## Ponytail notes / ceilings

- `planDelta` returns `null` for a stale `planMealId` (plan re-imported) → the loose card
  records the meal anyway. Matching by name instead would be guessing; the record is
  self-describing either way.
- `diffItems` pairs by `replacesItemId` only — an item with no id can only be reported as
  an addition. Positional matching would invent pairings the contract does not promise.
- The delta is computed once, at review time, from `getOverlay()` (today). A capture
  anchored to an earlier hour of the same day is still measured against today's overlay —
  correct, since the overlay is day-scoped.

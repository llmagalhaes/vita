# APP-097 — Day panel: scenic header + parallax + Overview zone

Status: **built**, gates green (`tsc --noEmit` 0 · `jest src/day` 26/26, 2 suites).
Implements `docs/v4/app-plan.md` APP-097 · README §2 "Scenic scenes" + §4 screen 2 ·
prototype `Vita Prototype v4.dc.html` lines 295–520 (`daySc` / `scPar`).

## Files

| File | What |
|---|---|
| `src/ui/scene.ts` | **owned now** — real daytime resolution from the clock; `msUntilNextScene` + a `useSceneName` that re-arms at noon / 18:00 / midnight so an open app rolls over. Scenic-only (no `classic` switch — CEO). |
| `src/day/ScenicHeader.tsx` | new — gradient, sun/moon + halo, the two hill paths, 8 stars, the sheet cap; consumes `tokens.scenes` / `tokens.scenic` verbatim. |
| `src/day/DayPanel.tsx` | rewritten (ownership) — `Animated.ScrollView` + `useAnimatedScrollHandler`, zone labels, the four gated cards, the APP-098/099 mount points. |
| `src/day/overview/parts.tsx` | new — shared card surface + micro/big-value type. |
| `src/day/overview/WaterCard.tsx` | new — vessel, `+250 ml`, unfoldable drink log, exact-amount pop. |
| `src/day/overview/MacrosCard.tsx` | new — recorded vs plan bars; opens the existing `MacrosSheet` pop. |
| `src/day/overview/HabitsCard.tsx` | new — ✓/— per habit, one tap, undo toast. |
| `src/day/overview/WeightCard.tsx` | new — value + source line, manual modal (slider + typed). |
| `src/day/water.ts` | new — vessel scale (2 500 ml), quick/slider/typed bands, `addWater`. |
| `src/day/weight.ts` | new — `weight:<date>` idempotent write + undo, `latestWeight`, clamps. |
| `src/i18n/locales/en.json` | **`day.*` namespace only** — nothing else touched. |
| `src/day/__tests__/overview.test.tsx` | new — 6 tests (pure maths, gating, recording). |

`src/tabs/MacrosSheet.tsx` needed **no adaptation**: it is already a `PopOverlay` pop
with a generic `{macros, meals}` contract, so the Day card feeds it from the day
record. Left untouched rather than forked.

## Fidelity notes

Honoured verbatim: gradient `180deg A 0% → B 55% → C 100%`; sun `r30 @ (196,46)`
opacity .92 + halo `r48` .22; both hill paths and their .85 / 1 opacities; the 8 star
positions/radii/opacities with the .3s fade; scene text sizes (20/800 greeting,
12.5/600 date @ .8, hero 72/200 ls −2.2, sub 13/600 @ .92 with the `0 1px 8px
rgba(30,22,16,.35)` shadow, glass chip 11.5/700 r15 6×13); sheet cap 38 px `#F7F2E9`
r30 margins −34/−20/−13 with the negative `0 -12px 26px -8px` shadow; header padding
`88/24/96`; zone labels 11.5/800 ls 1.4 `#B7AB9C`; card geometry, the 1.05 / 1.35 flex
split, vessel 54×82 r19, `.6s` fill, `+250 ml` chip, habit 38 px circles, weight well
34 r12; both modals (r22, 17 pad, 44 px buttons, 64 / 74 px inputs).

Could **not** be honoured as drawn:

1. **Glass-chip backdrop blur.** The counts chip keeps its `rgba(30,24,18,.22)` fill +
   `rgba(255,253,247,.14)` border but has no `backdrop-filter: blur(8px)`. Android
   `BlurView` has been unreliable since APP-063 (the app's own `SheetBackdrop` already
   drops it on Android); a 30 px pill over a soft gradient gains nothing from it.
2. **Weight source line.** The prototype offers "via Health Connect · 07:12". There is
   no Health-Connect **weight** reader in the app (`src/health/healthConnect.ts` reads
   energy/steps/sessions only), so the card is honest instead: `logged by you · HH:MM`
   or `no reading yet — log it yourself`. Wiring an HC weight source is a separate
   ticket; nothing here has to change when it lands.
3. **Classic header** (`homeStyle:"classic"`, prototype lines 428–440) not built —
   scenic-only per the CEO directive.

## Parallax

`useAnimatedScrollHandler` writes one shared value; `ScenicHeader` reads it in a
worklet (`translateY = min(340, y) × 0.38`) on the star and sun/hill layers. **Zero**
per-frame `setState` — the prototype's 1 px-threshold `setState` is deliberately not
ported (plan risk R2).

## Test delta

`src/day/__tests__/overview.test.tsx` (+6): vessel scale, both typed clamps, the
macro bar's no-plan case, scene resolution + boundary re-arm, habit sub-line, all
cards on, per-flag hiding, the whole-zone hide, and one recording test that drives
`+250 ml` **and** the weight modal's typed field end to end (asserting the
`weight:<date>` entry). Suite total for `src/day`: 26 (was 20).

**One file outside my scope was touched**: `src/nav/__tests__/panelShell.test.tsx`
(APP-096) asserted the Day panel renders a "Today" *heading*. The real panel opens on
the scenic greeting instead, so that assertion is wrong by design now — swapped for
"the tab says Today, the panel shows Overview". Three lines, no production change.

Two harness quirks found and worked around (documented in the file): a bare
`act()` flush leaves this renderer unusable for a *later* `render()` in the same
file — assert with `findBy*` instead; and jest's fake timers stop a `popHost` pop from
ever reaching the tree inside `waitFor`, so this suite runs on real timers.

## Device-verify

- Scene bleed under the status bar: the header cancels the panel's 88 px top padding,
  so confirm the gradient really reaches the top edge inside `PanelShell` (safe-area).
- Parallax feel on the Samsung while flinging, and the cap's negative shadow over the
  scene.
- Evening scene: star fade, moon tone, and the panel tabs / status bar flipping to
  light ink (already wired through `isDarkScene`).
- Both modals on device: slider drag AND typed entry, and the keyboard not covering
  the Save row.
- Water vessel `.6s` fill after a quick-add; habit undo toast within its 3.6 s window.

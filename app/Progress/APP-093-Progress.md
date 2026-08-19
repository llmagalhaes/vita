# APP-093 · v4 design tokens + oklab mix + motion

Ticket: `docs/v4/app-plan.md` §3 APP-093 · Spec source: `docs/v4/README.md` §2, cross-checked against
`docs/v4/Vita Prototype v4.dc.html`.

## Files touched

| File | Change |
|---|---|
| `src/ui/oklab.ts` | **new** — real `color-mix(in oklab, …)`, ~55 lines, no dependency |
| `src/ui/tokens.ts` | rewritten to the full v4 palette + scenes + radii/shadows + motion |
| `src/ui/__tests__/oklab.test.ts` | **new** — 7 tests, 3 hand-computed reference mixes + endpoints/clamp/alias |
| `src/ui/accent.ts` | **untouched** — already the single `--accent` switch v4 describes (app-plan verdict: "keep") |

## Token coverage (README §2)

- **Surfaces**: `canvas`/`panel` `#F7F2E9` · `sheet` `#FBF6EC` · `card` `#FFFDF7` · `input` `#FBF6EC` ·
  `desk` `#EDE5D6` · `bezel` `#332D26`.
- **Ink ramp** (complete): `inkHeading #453E35` · `ink #4A4238` · `inkMuted #6E6355` · `muted #8A7E70` ·
  `faint #B7AB9C` · `disabled #CFC5B4` · `sand #D9CFBD` · `sandLight #E4DCCB`.
- **Accent**: `#C4704E` + `accentHover #A85A3B` + full `vacation` set (accent/bg/banner from→to/ink/inkSoft).
- **Green / amber / peach / sand / danger**: `green{bg,ink,fill,fillSoft,track}`, `amber{bg,ink,fill}`,
  `peach`/`peachSoft`, `sandChip`/`well`/`chartEmpty`/`muscleEmpty(+Alt)`/`barIdle`, `danger`+`dangerBorder`.
- **Dark**: `dark{bg #453E35, ink #F7F0E4, undo #F2C08C}` + `recap` gradient `135deg #3E3A46→#5C4A4A` w/ label
  `#D8C9B4`.
- **Hairlines**: card `.06`/`.10`, control `.14`/`.16`, dashed divider `.16`, rail `.10`, no-record ring `.35`.
- **Scenes** (`scenes`): morning / afternoon / evening — A/B/C + sun + hill1/hill2 + ink + `dark` flag, values
  lifted verbatim from prototype `SCN` (line 1444). Plus `scenic`: gradient stops `0/.55/1`, sun geometry
  (r30 @.92, halo r48 @.22, cx196 cy46), both hill SVG paths, stars (8, r1–1.5, opacity .5–1, fade 300ms),
  glass chip, sheet cap (38px, r30, margins −34/−20/−13), parallax (×0.38, cap 340, threshold 1px).
- **Panel tabs** (`panelTabs`): light **and** dark-scene variants (bg/blur 14/saturate 1.4/border/activeBg/inks),
  radius 20, padding 3, chip r16 6×13.
- **Capture pill**, **dayState** (done/adjusted/skipped/future + rail geometry) also tokenised.
- **Radii**: card 24/26 · sheet `30 30 42 42` · modal 22 · inner 16/20 · chip 7/17 · bezel 56/46.
- **Shadows**: `shadowCard` (v4 card), `shadowWaterCard` (16/34 .11), `shadowSheet`, `shadowModal`,
  `shadowToast`, `shadowTab`, `shadowPill`, `shadowCap`, `shadowCta(color)` (30–32%), `shadowMic(color)` (40%),
  plus every v3 shadow kept.
- **Motion**: `vtIn / vtFade / vtPop / vtBreath / vtTip / vtSheetUp / vtWave / vtPillX / vtPillBtn` with exact
  durations + beziers, plus `panelSnap` (.45s `.22,.9,.32,1`), `dockRelease` (.55s `.34,1.56,.64,1`),
  `waterFill` (.6s), `ease`. Durations verified by grepping **every** `animation:` in the prototype, not
  just the README range.
- **Typography**: `typeScale` (21/82/72/64/44/11.5/10/9) + `letterSpacing` (−2.5/−2.2/1.2/1.4) + `hit`
  (34/42/52).
- `panelGesture`: edge 34 · minDx 8 · vertical veto 12 & 1.1× · commit 90 · rubber-band ÷3.5.

## `mixOklab`

sRGB → linear → LMS → cbrt → oklab, per-coordinate lerp, and back (Ottosson matrices). Matches CSS
`color-mix(in oklab, A p%, B)` exactly for opaque colours. Percentages clamped 0–100.

References were computed **independently in Python** straight from the oklab definition, then hardcoded into
the test — so the test is a genuine cross-check, not a snapshot of the implementation:

| Mix | Expected | Result |
|---|---|---|
| `accent 16%, #F0EDE2` (muscle-map floor) | `#EBD9CA` | pass |
| `accent 50%, #FFFDF7` | `#E4B6A1` | pass |
| `accent 86%, #F0EDE2` (muscle-map ceiling, `16+1*70`) | `#CC8263` | pass |
| `vacationAccent 45%, #FFFDF7` | `#ABCBD1` | pass |

`tint` is now a deprecated **alias** of `mixOklab` (same signature), so all ~existing callers silently gain
true oklab instead of the old sRGB lerp — which is the ticket's intent ("replaces `tint()`'s sRGB lerp").

## Gates

- `npx jest src/ui` — **5 suites / 26 tests, all pass** (7 new oklab tests).
- `npx tsc --noEmit` — **0 errors in `src/ui/`**. 10 errors remain, all owned by the concurrent `src/db/*`
  builder: `Property 'keepTrack' does not exist on type 'Settings'` in `app/onboarding.tsx`,
  `src/__tests__/account.test.tsx`, `src/__tests__/onboarding.test.tsx`,
  `src/health/__tests__/healthConnect.test.ts`, plus `onboarding.tsx` symbol-key errors. Not this ticket's files.

## Deviations / notes

1. **`colors.bg` kept at `#EDE5D6`** (the desk colour) and marked `@deprecated`, rather than repointed to the
   v4 canvas. Repointing would silently restyle every v3 screen still standing mid-wave; `canvas`/`surface`
   (`#F7F2E9`) and `desk` are the v4 names to use. The v3 screens are deleted by APP-094+, at which point `bg`
   can go.
2. **`fontSizes` left at its original 5 keys.** It is the `Text.tsx` variant set (`Record<keyof typeof
   fontSizes, string>`), so extending it broke `Text.tsx`. v4 one-off screen sizes live in the new `typeScale`.
   Avoided editing `Text.tsx`, which is outside this ticket's file scope.
3. **v4 card shadow flattened to one layer.** RN takes a single shadow; the spec's
   `0 1px 2px ….05, 0 14px 30px ….10` keeps the 14/30 .10 layer (`shadowCard`). Marked `ponytail:` in-file.
4. **`accent.ts` unchanged** — no edit was needed; it already models the prototype's `--accent` CSS var.
5. `panelSnap` / `dockRelease` / `waterFill` / `panelGesture` come from README §1 and §3 rather than §2, added
   so APP-094/095 have no reason to write a literal duration.

# Home v2 — Design Tokens Table

Cross-reference of every hex/px/weight/easing value in `docs/home-v2/handoff/README.md` against `app/services/vita-app/src/ui/tokens.ts`. One row per distinct value; repeated README mentions of the same value are collapsed into one row's "Where used" column.

## Surfaces

| Token (proposed constant name) | Value | Where used in Home v2 | Status |
|---|---|---|---|
| `colors.surface` | `#F7F2E9` | Screen background | exists (`colors.surface`) |
| `colors.card` | `#FFFDF7` | Water/Macros/Energy card bg, header icon-button bg, timeline meal/workout row bg | exists (`colors.card`) |
| `colors.waterVesselBg` | `#EDF1E7` | Water card liquid-vessel background | NEW |
| `colors.track` | `#F0E9DA` | Macro bar track, Energy in/out bar track | exists (`colors.track`) |
| `colors.dotIdle` | `#D9CFBD` | Dock date picker idle (unmagnified) dot | NEW |
| `colors.waterFillGradient` | `linear-gradient(180deg, #A9BC9B → #8CA58A)` | Water vessel fill | NEW as a gradient — stops individually exist (`entryPalette.water.c2` = `#A9BC9B`, `colors.macro.protein` = `#8CA58A`) but no combined gradient token |

RN note: CSS `linear-gradient` has no RN style equivalent — use `expo-linear-gradient` (`<LinearGradient colors={[c2, macro.protein]} start={{x:0,y:0}} end={{x:0,y:1}}>`) sized to the vessel, animate `locations`/height via Reanimated instead of the CSS `transition: height`.

## Ink

| Token (proposed constant name) | Value | Where used in Home v2 | Status |
|---|---|---|---|
| `colors.ink` | `#4A4238` | Design-tokens summary "primary" ink (general body/UI text) | exists (`colors.ink`) |
| `colors.inkHero` | `#453E35` | Big kcal hero number | NEW — README lists this as a second "primary" value distinct from `colors.ink` |
| `colors.muted` | `#8A7E70` | Header date caption; Design-tokens summary "secondary" ink | exists (`colors.muted`) |
| `colors.inkSecondaryAlt` | `#6E6355` | Design-tokens summary "secondary" alt — no specific component cites it | NEW |
| `colors.labelMuted` | `#B7AB9C` | "WATER" label text, timeline time-gutter text | exists (`colors.labelMuted`) |
| `colors.mutedAlt` | `#CFC5B4` | Design-tokens summary "muted" alt — no specific component cites it | NEW |
| `colors.border` | `rgba(120,100,75,.10)` | Timeline spine rail | exists (`colors.border`), exact match |
| `colors.borderIconBtn` | `rgba(120,100,75,.12)` | Header icon-button border | exists-differs — `colors.border` is `.10`, README uses `.12` here |
| `colors.borderCard` | `rgba(120,100,75,.06)` | Water card border | exists-differs — `colors.border` is `.10`, README uses `.06` here |

Note: README/`tokens.ts` share one base rgb triplet `(120,100,75)` across three opacities (`.06`/`.10`/`.12`) — worth collapsing into `colors.border(opacity)` helper rather than 3 constants.

## Accent & per-kind colors

| Token (proposed constant name) | Value | Where used in Home v2 | Status |
|---|---|---|---|
| `colors.accent` | `#C4704E` | Default `--accent`: dock selected dot, tooltip pill, dock color-mix target | exists (`colors.accent`) |
| `colors.accentOptions` | `#8CA58A`, `#C98A3F`, `#D6926B` | Tweaks accent-picker options | exists (`colors.accentOptions`), exact match |
| `colors.estimateBg` / `colors.estimateInk` | `#F7E7D4` / `#A66A3F` | Timeline meal icon tile; "estimates" chip; Design-tokens "meal accent" | exists (`colors.estimateBg`, `colors.estimateInk`) |
| `entryPalette.water.badgeBg` / `badgeInk` | `#E7EDE1` / `#5F7A61` | Water quick-add button bg/ink; Design-tokens "movement" accent | exists (`entryPalette.water.badgeBg`/`badgeInk`) — see conflict below |
| `entryPalette.workout.badgeBg` / `badgeInk` (as used by Home v2) | `#E7EDE1` / `#5F7A61` | Timeline workout icon tile | **exists-differs / CONFLICT** — `tokens.ts` `entryPalette.workout` is `#F7E9DF`/`#C4704E`. Home v2's workout tile actually matches `entryPalette.water`, not `entryPalette.workout` |
| `colors.macro.protein` / `.carbs` / `.fat` | `#8CA58A` / `#C98A3F` / `#E0A375` | Macro bar fills; Energy "out" (protein) / "in" (fat) bars | exists (`colors.macro`), exact match |
| `entryPalette.water.c2` (water dot) | `#A9BC9B` | Timeline water dot | exists (`entryPalette.water.c2`) |
| timeline meal dot | `#E0A375` | Timeline meal dot | **exists-differs / CONFLICT** — equals `colors.macro.fat`, but `entryPalette.meal.line` is `#C98A3F` (carbs color); no `entryPalette` field matches the stated meal-dot color |
| timeline workout dot | `#8CA58A` | Timeline workout dot | **exists-differs / CONFLICT** — equals `colors.macro.protein`, but `entryPalette.workout.line` is `#C4704E` (accent); no `entryPalette` field matches |

## Radii

| Token (proposed constant name) | Value | Where used in Home v2 | Status |
|---|---|---|---|
| `radii.cardHome` | `24px` | Water/Macros/Energy card corner | exists-differs (`radii.lg` = `22px`) |
| `radii.row` | `20px` | Timeline meal/workout row corner | exists-differs (closest is `radii.lg` = `22px`) |
| `radii.tile` (range) | `12–19px` | Icon tiles, water vessel (`19px`) | exists-differs (`radii.md` = `16px` sits inside the range but isn't a named boundary) |
| `radii.chip` (range) | `9–17px` | Quick-add button (`17px`), chips | exists-differs (`radii.sm` = `10px` sits inside the range) |
| screen radius (device chrome) | `46px` | Phone frame corner | NEW — N/A in RN; device screens have no corner-radius prop, relevant only for a design-preview frame |

RN note: `boxShadow`/border-radius ranges above are prototype authoring ranges, not single values — pick one concrete px per component when porting (e.g. `radii.cardHome = 24`, not a range).

## Shadows

| Token (proposed constant name) | Value | Where used in Home v2 | Status |
|---|---|---|---|
| `shadow.card` | `0 10px 26px rgba(105,84,60,.08)` | Water/Macros/Energy card | exists-differs — `tokens.ts` `shadow`: `shadowColor:"#69543C"` is the *same* rgb (105,84,60), but `shadowOpacity:0.09` (vs `.08`) and `shadowRadius:16` (vs `26px` blur) differ |
| `shadow.row` | `0 8px 20px rgba(105,84,60,.07)` | Timeline meal/workout row | NEW — same base color as `shadow.card` but distinct opacity/radius/offset; no dedicated token |
| `shadow.tooltip` | `0 6px 16px rgba(120,80,50,.28)` | Dock tooltip pill | NEW — different rgb entirely (120,80,50 vs 105,84,60) |

RN note: CSS `box-shadow: x y blur rgba(...)` → RN `{ shadowColor: '#rrggbb', shadowOpacity, shadowRadius: blur, shadowOffset: {width:x, height:y} }` (iOS) + `elevation` (Android, no direct blur/offset control — approximate). Suggested `shadow.row`: `{ shadowColor: "#69543C", shadowOpacity: 0.07, shadowRadius: 20, shadowOffset: {width:0, height:8}, elevation: 2 }`. Suggested `shadow.tooltip`: `{ shadowColor: "#785032", shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: {width:0, height:6}, elevation: 6 }`.

## Type

| Token (proposed constant name) | Value | Where used in Home v2 | Status |
|---|---|---|---|
| `fonts.*` (Nunito family) | Nunito, weights 200–800 | All Home v2 text | exists (`fonts.extraLight`…`fonts.extraBold`) |
| `fontSizes.greeting` | `21px` / weight 700 | Greeting header | exists-differs (closest `fontSizes.title` = `20px`) |
| `fontSizes.dateCaption` | `13px` | Header date caption | exists-differs (closest `fontSizes.caption` = `12px`) |
| `fontSizes.kcalHero` | `82px` / weight 200 | Big kcal total | NEW (no equivalent; `fontSizes.display` = `28px`) |
| kcal hero letter-spacing | `-2.5px` | Big kcal total tracking | NEW |
| `fontSizes.sectionLabel` | `11.5px` / weight 800 | "WATER" label | NEW (smaller than `fontSizes.caption` = `12px`) |
| section label letter-spacing | `1px` | "WATER" label uppercase tracking | NEW |
| `fontSizes.numeralValue` | `21px` / weight 300 | Water value; Energy consumed/spent/balance columns | exists-differs (closest `fontSizes.title` = `20px`) |
| `fontSizes.entryTitle` | `15px` / weight 700 | Timeline entry title | exists-differs (between `fontSizes.caption`=12 and `fontSizes.body`=16) |
| `fontSizes.entryTime` | `10.5px` / weight 700 | Timeline time gutter | NEW (smaller than `fontSizes.caption` = `12px`) |

RN note: `letter-spacing` in CSS px maps 1:1 to RN `Text` style `letterSpacing` (also a number, same unit) — no conversion needed for the `-2.5` and `1` values above.

## Spacing / Layout

| Token (proposed constant name) | Value | Where used in Home v2 | Status |
|---|---|---|---|
| `spacing.screenPadding` | `64px 20px 150px` (top/sides/bottom) | Home v2 scroll column padding | NEW |
| `spacing.screenGap` | `13px` | Vertical gap between Home v2 sections | exists-differs (closest `spacing.md` = `12px`) |
| `spacing.md` | `12px` | Water/Macros card row gap | exists (`spacing.md`), exact match |
| `spacing.cardPadding` | `15px` | Water/Macros card inner padding | exists-differs (between `spacing.sm`=8 and `spacing.lg`=16) |
| `spacing.quickAddPadding` | `8px 13px` | Quick-add button padding | exists-differs (`8` matches `spacing.sm`; `13` has no equivalent) |
| phone frame (device) | `390×844` | Reference device frame | NEW — N/A in RN, actual screen dims come from device |
| `spacing.waterVesselSize` | `54×82px` | Water card liquid vessel | NEW |
| `spacing.trackHeight` | `7px` | Macro/Energy bar track thickness | NEW |
| `spacing.dockRow` | height `44px`, padding `0 6px`, `10` slots | Dock date picker container | NEW |
| `spacing.dockDotSize` | `7px` | Dock date picker dot diameter | NEW |
| `spacing.headerIconButton` | `36px` | Greeting header icon buttons | NEW |
| `spacing.entryIconTile` | `34px` | Timeline meal/workout icon tile | NEW |
| `spacing.entryGutterWidth` | `38px` | Timeline left time gutter | NEW |
| `spacing.spineRailWidth` | `2px` | Timeline spine rail thickness (color = `colors.border`, see Ink) | NEW |
| card flex ratios | Water `flex:1.05`, Macros `flex:1.35` | Water/Macros row proportions | NEW |
| swipe thresholds | `dx>70` older / `dx<-70` newer, elastic `1/3.5`, `12px` drag-suppresses-tap | Timeline swipe gesture | NEW |

## Motion

| Token (proposed constant name) | Value | Where used in Home v2 | Status |
|---|---|---|---|
| `motion.fillTransition` | `600ms`, `ease` | Water vessel height fill, macro bar width fill, energy bar width fill | NEW — no existing 600ms/`ease` token (`motion.unfold` is 450ms with a different bezier) |
| `motion.screenSlide` (≈ `motion.pop`) | `320–450ms` | Timeline day-change slide (`vtDayL`/`vtDayR`) | exists (`motion.pop.durationMs` = `350ms` sits inside this range) |
| `motion.dockSpring` | `cubic-bezier(.34,1.56,.64,1)`, `550ms` | Dock dot release-and-settle (`transition: transform .55s`) | NEW — bezier and duration both absent from `tokens.ts` (`motion.pop`/`unfold` use non-overshoot beziers) |
| `motion.tooltipSpring` | `cubic-bezier(.34,1.56,.64,1)`, `320ms`; keyframes `0%{opacity:0,translateY(7px),scale(.5)} 55%{translateY(-3px),scale(1.08)} 100%{scale(1)}` | Dock tooltip pop-in (`vtTip`) | NEW |
| `motion.magnifierAmplitude` | `1.15` in `scale = 1 + 1.15·e^-(d/spread)²` | Dock dot Gaussian magnification | NEW |
| `motion.magnifierSpread` | `spread = slot × 1.25` | Dock dot magnification falloff | NEW |
| `motion.magnifierPeakScale` | `≈2.15×` | Dock dot peak scale under finger | NEW |
| `motion.magnifierTranslateY` | `translateY(-13px × mag)` | Dock dot lift while magnified | NEW |
| `motion.dockIdleSelectedScale` | `1.85` | Selected dot at rest (not mid-drag) | NEW |
| `motion.colorMixAccent` | `color-mix(... mag×60% ...)` toward `colors.accent` | Dock dot color/opacity ramp toward accent while magnified | NEW |
| `motion.hapticStrength` | `navigator.vibrate(7)`, once per dot crossing | Dock drag haptic feedback | NEW |
| `motion.pressScaleCard` | `0.985` | Water card active/press scale | NEW |
| `motion.pressScaleQuickAdd` | `0.94` | Quick-add button active/press scale | NEW |
| `motion.chevronRotate` | `0deg → 180deg` | Water/Energy card expand chevron | NEW |

RN translation notes for Motion:
- **`cubic-bezier(.34,1.56,.64,1)` → `withSpring`**: this is a classic overshoot bezier (peaks past 1 then settles), which is what a lightly underdamped spring produces natively — prefer `withSpring` over `withTiming(Easing.bezier(...))` for feel. Ballpark: `withSpring(target, { damping: 14, stiffness: 180, mass: 1 })` for `motion.dockSpring`; `withSpring(1, { damping: 12, stiffness: 220, mass: 0.9 })` for `motion.tooltipSpring` (snappier, matches the tighter 320ms window). **Both configs are a starting guess — tune damping/stiffness against `screens/04-dock-magnifier-mid-drag.png` and `screens/05-past-day-loaded.png` until overshoot/settle timing visually matches.**
- **`color-mix()` → `interpolateColor`**: no RN equivalent for CSS `color-mix()`. Precompute: `interpolateColor(mag, [0, 1], [colors.dotIdle, colors.accent])` (Reanimated), driving both dot fill and any border/opacity ramp.
- **`transform-origin: center bottom` → RN `transformOrigin` or translateY compensation**: RN's `transform` scale defaults to origin at the view's center. Either set `transformOrigin: 'center bottom'` directly (RN 0.74+ / New Architecture), or on older RN compensate by translating the view by `+ (height/2) * (1 - scale)` on Y so the dot visually grows upward from its bottom edge instead of from its center.
- **haptics**: `navigator.vibrate(7)` → `expo-haptics` `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` (or `Vibration.vibrate(7)` for a literal ms match); must be gated on dot-index crossing (track last-index in a shared value), not fired continuously per frame.

## Delta summary

- **exists**: 16
- **exists-differs**: 17
- **NEW**: 39
- **Total distinct values**: 72

**Conflicts worth a CEO/design question:**
1. **`entryPalette.workout` badge colors don't match Home v2.** `tokens.ts` has `entryPalette.workout = { badgeBg: "#F7E9DF", badgeInk: "#C4704E" }`, but the Home v2 handoff's workout icon tile is `#E7EDE1`/`#5F7A61` — which is exactly `entryPalette.water`'s badge pair. Either `entryPalette.workout` needs updating to match Home v2, or Home v2 intentionally borrows the "water" visual style for workout tiles (in which case the existing workout palette is simply unused here and diverges from the rest of the app).
2. **Timeline dot colors don't match `entryPalette.*.line`.** Home v2 specifies dot colors `water #A9BC9B` / `meal #E0A375` / `workout #8CA58A` — but `entryPalette` already has a `line` field seemingly meant for exactly this (`water.line=#5F7A61`, `meal.line=#C98A3F`, `workout.line=#C4704E`), and none of the three match. Home v2's dots instead reuse `colors.macro.fat`/`colors.macro.protein`. Two different "per-kind dot color" systems exist in parallel — pick one.
3. **Three border opacities on one base rgb** (`rgba(120,100,75,` at `.06`/`.10`/`.12`) where `tokens.ts` only defines `.10`. Worth a single parameterized `colors.border(opacity)` rather than 3 near-duplicate constants.
4. **Card shadow: same color, different opacity/blur than `tokens.ts` `shadow`.** `shadowColor:"#69543C"` already matches Home v2's rgb exactly; only `shadowOpacity` (.09 vs .08) and `shadowRadius` (16 vs 26) drift. Cheap to reconcile — decide whether `tokens.ts` `shadow` should be nudged to `.08`/`26` to match the newer spec, or Home v2 gets its own `shadow.card` override.

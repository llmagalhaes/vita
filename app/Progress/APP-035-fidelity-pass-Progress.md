# APP-035 — Fidelity pass vs prototype (slice 8) — Progress

**Asana:** APP-035 (Vita frontend `1216519867368576`) — "Fidelity pass vs prototype (wave draw-on, entrance animations, check-ins banner motion, vacation transitions)."
**Constraint:** reanimated only, no new deps; do NOT disturb the Home two-column `flex:1` layout (CEO bug).

## What was built

### Wave draw-on — `src/ui/WaveIllustration.tsx`
- The crest stroke now **draws on** from `stroke-dashoffset 420→0` over 1.1s (`Easing.out(ease)`), matching the prototype's `vtDraw`. Implemented with `Animated.createAnimatedComponent(Path)` + `useSharedValue`/`useAnimatedProps`/`withDelay` — reanimated + react-native-svg, both already deps.
- New optional `delay` prop staggers the draw per card. Reused everywhere the wave appears (home timeline + water/meal detail) at zero call-site cost (default 0).

### Timeline stagger — `app/(main)/home.tsx`
- Timeline cards pass `delay={100 + index * 90}` to the wave so crests draw on in sequence, echoing the prototype's per-entry delay (the card container already fades/rises via the existing `FadeIn`).

### Check-ins banner + vacation transitions — `app/(main)/home.tsx`
- Both the vacation (sea-tone) banner and the "N waiting" check-ins banner are now wrapped in `Animated.View` with `entering={FadeInDown}` (opacity + rise, the prototype's `vtIn`) and `exiting={FadeOut}` — so starting/ending vacation and check-ins appearing/clearing ease in and out instead of popping.

## Home layout — untouched
- Only the banners above and the wave were touched. The water+macros row (`flexDirection:row`, `flex:1.05` / `flex:1`, **no `height:"100%"`**) and its comment are byte-for-byte intact (verified).

## Gates
- `tsc` exit 0 · `jest` **144/144 (31 suites)** · `api:check` clean · `expo export` iOS OK · no new deps.

## ponytail
- One-time entrance/draw motion only — no loops, no gratuitous animation (calm philosophy). Skipped the prototype's decorative `vtBreath`/`vtBlob` idles; add per screen if the CEO wants more life.

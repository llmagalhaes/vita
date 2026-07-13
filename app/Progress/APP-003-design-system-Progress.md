# APP-003 — Design system (@vita/ui) — Progress

- **Asana**: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216514543253416
- **Status**: first slice implemented 2026-07-13 (tokens + 4 primitives, tests green). Stays In progress — more primitives (Bar, Donut, WaveIllustration, EstimateTag, CapturePill) come with the screens that need them.

## 2026-07-13

- `src/ui/` inside vita-app (a folder, not a monorepo package — ponytail): `tokens.ts` with the full brief palette (bg/surface/card/ink/muted, accent + 3 options, vacation sea-tone `#3E8FA3`, greens, sun, macro colors), Nunito family names (loaded in the root layout via @expo-google-fonts/nunito), font-size/spacing/radius scales.
- Primitives: `Text` (variant → Nunito weight/size), `Card`, `Button` (accent pill, primary/ghost), `Chip` (selected state). All light-only per CEO Round 5.
- Component tests in `src/ui/__tests__/primitives.test.tsx` — 4 tests, green.
- Deferred: accent-theming provider (vacation swap) — one context, added when vacation mode or accent picker lands; motion/spring tokens — added with Reanimated in APP-011.

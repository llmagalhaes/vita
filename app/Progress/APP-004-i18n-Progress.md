# APP-004 — i18n — Progress

- **Asana**: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216517968982705
- **Status**: implemented 2026-07-13; green. Done pending production build. Ongoing rule: every new string goes through `t()`.

## 2026-07-13

- react-i18next + i18next wired in `src/i18n/index.ts`, imported once in the root layout. `en.json` is the sole locale; adding a language = new locale file + one resources line.
- All user-facing strings in the scaffold go through `t()` (`app/index.tsx`); test `src/__tests__/home.test.tsx` asserts translated copy renders.
- Skipped device-locale detection (expo-localization) — English-only launch makes it dead code; add with the second language.

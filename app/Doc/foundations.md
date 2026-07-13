# App Foundations — fixed decisions (Phase 1)

> Dated 2026-07-13, updated same day with CEO Round 5. These are settled by CEO decision (Rounds 3–5) or team choice. Decisions only.

- **Bundle ID / package name: `com.llmagal.vita`** — identical on the App Store and Play Store. Immutable once published. Does not depend on any future domain.
- **Display name is NOT final** (CEO Round 5): "Vita" is the internal codename; the store-facing name stays open. Keep the display name a single easily-changed config value (`app.config.ts` `name`) and never bake "Vita" into store assets prematurely. Internal identifiers keep "vita".
- **Capture bar: v2 pill only** (CEO Round 5) — hold-to-talk pill with Today/Trends/Habits shortcuts. The v1 bar variant is not built.
- **Light mode only** in v1 (CEO Round 5). No dark palette exists in the prototype; do not ship `userInterfaceStyle: automatic`.
- **Phone-only, iOS 16+ / Android 10+ (API 29+)** (CEO Round 5). No tablet layouts.
- **Cycle chip ships in v1**, sourced exclusively from Apple Health / Health Connect (CEO Round 5). Flo stays v2. Latest derived phase only, no history, excluded from exports by default (Round 3).
- **Deep-link scheme: `vita://`.** Magic-link auth callback is `vita://auth` — the emailed link points at an https redirect page that opens the custom scheme (no domain / universal links in v1).
- **API base URL comes from build config** (Expo env / `app.config.ts` extra), pointing at the API Gateway execute-api URL. Never hardcoded in source. Single environment: production.
- **i18n: react-i18next from day one.** One locale file (`en`). Every user-facing string goes through `t()` — no literals in components. Adding a language = adding a translation file, nothing else.
- **Release flow is manual on the CEO's Mac.** No EAS subscription, no macOS CI. We maintain a documented **one-command build** (`npm run build:ios` / `build:android` wrapping `expo prebuild` + local `eas build --local` or xcodebuild/gradle) that is reproducible from a clean checkout. "In production" for app tickets = released build in testers' hands (TestFlight / Play internal track).
- **Notifications are local on device** in v1 — no push infra, no device-token endpoints.

# Maestro E2E smoke (APP-034)

Two flows cover the core path end to end, against the app running in **Expo Go
(mock mode, no backend)**:

| Flow | File | Covers |
|---|---|---|
| Core happy path | `services/vita-app/.maestro/onboarding-capture.yaml` | sign in → 6-step onboarding → capture (type) → confirm → timeline |
| Auth deep link | `services/vita-app/.maestro/auth-deeplink.yaml` | passwordless magic-link `vita://auth?token=…` sign-in |

These are **test artifacts** — plain YAML, not imported by any code, so they never
reach the JS bundle (`expo export` ignores them) and don't affect `tsc` / `jest`.
Maestro is **not** an npm dependency; nothing in the app requires it to be installed.

## Install Maestro (once, on the machine running the tests)

```
curl -fsSL "https://get.maestro.mobile.dev" | bash
```

Needs a running iOS Simulator or Android emulator (or a USB device). See
https://maestro.mobile.dev for details.

## Run

1. Start Metro and load the project in Expo Go on the simulator/emulator:
   ```
   cd app/services/vita-app
   npx expo start        # press i (iOS) or a (Android) to open it in Expo Go
   ```
   Leave it running. No `VITA_API_BASE_URL` → the app is fully mocked.

2. In another terminal, run a flow (or the whole `.maestro/` dir):
   ```
   cd app/services/vita-app
   maestro test .maestro/onboarding-capture.yaml
   maestro test .maestro/auth-deeplink.yaml
   # or the whole suite:
   maestro test .maestro
   ```

## appId per platform / build

The flows target **Expo Go**, whose bundle id differs by platform:

- iOS Expo Go: `host.exp.Exponent` (the value checked in)
- Android Expo Go: `host.exp.exponent` (lowercase) — change the `appId:` line, or keep
  a platform copy.
- Dev-client / standalone build (APP-007): `com.llmagal.vita`. There the raw deep
  link works directly — swap the demo-button tap for `- openLink: "vita://auth?token=demo-ok"`
  (commented in `auth-deeplink.yaml`).

## Notes

- Flows are text/accessibility-label driven (no testIDs) to stay resilient to styling.
- `clearState: true` gives a fresh sign-in each run, so onboarding always shows.
- Mock `verifyMagicLink` accepts any token except `expired`/`invalid`; the demo button
  uses `demo-ok`.

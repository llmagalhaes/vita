# APP-034 — Maestro E2E smoke (slice 8) — Progress

**Asana:** APP-034 (Vita frontend `1216519867368576`) — "Maestro E2E smoke (onboarding→capture→confirm→timeline + auth deep link)."

## What was built

Two flows under `app/services/vita-app/.maestro/`, driven by visible text / accessibility labels (no testIDs — resilient to styling):

- **`onboarding-capture.yaml`** — the core happy path: passwordless sign-in → 6-step onboarding (name + 5×Next + Start) → open the capture pill → type "Had a banana around 4" → Confirm → assert the meal in the timeline.
- **`auth-deeplink.yaml`** — passwordless magic-link deep-link sign-in: email → Send link → the "Open the link · demo" button fires the real `vita://auth?token=demo-ok` deep link (handled by `useMagicLink`) → onboarding visible = signed in. A `- openLink: vita://auth?token=demo-ok` variant is documented for dev/standalone builds.

Runner doc: **`app/Doc/e2e-maestro.md`** — install Maestro, start `expo start`, load in Expo Go (mock mode), `maestro test .maestro`. Documents the per-platform Expo Go appId (`host.exp.Exponent` iOS / `host.exp.exponent` Android) and the standalone id `com.llmagal.vita`.

## Bundle / gate safety
- Flows are plain YAML, imported by nothing → **not in the JS bundle** (`grep` over `dist/` after `expo export` = empty). Maestro is **not** an npm dependency; `jest`/`tsc`/`expo export` don't need it installed.

## Gates
- Unchanged by this ticket: `tsc` exit 0 · `jest` 144/144 · `api:check` clean · `expo export` iOS OK (Maestro excluded).

## ponytail / notes
- Not executed here (no device/emulator + Maestro binary in this env) — flows are the checked-in artifact; run per the doc against Expo Go.
- Demo button is the reliable deep-link trigger in Expo Go (Expo rewrites `vita://` → `exp://`); the raw `openLink` is the dev-build path.

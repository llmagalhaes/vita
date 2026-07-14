# APP-DEV-PASTE-TOKEN — Dev-only paste magic-link token sign-in

Ad-hoc CEO task (no Asana ticket). Unblock real-backend magic-link sign-in in Expo Go.

## Why

Against the real backend, sign-in is a magic link emitted as `vita://auth?token=…`. The
custom `vita://` scheme only routes in a dev build (APP-007), NOT in Expo Go, and typing an
`exp://…/--/auth?token=…` URL in a phone browser doesn't fire the app. So there was no easy
way to finish magic-link sign-in in Expo Go against the real backend. Fix: paste the token
straight into the app.

## What changed

- **`src/auth/useMagicLink.ts`** — new pure helper `tokenFromPaste(input)`, colocated with the
  existing `tokenFromUrl`. Extraction: trim; if the string contains `token=`, take everything
  after the **last** `token=` (and trim) — handles the whole `vita://auth?token=X` link, an
  `exp://…?token=X` URL, and a raw `token=X` log line; otherwise the trimmed string is the bare
  token. All three shapes reduce to `X`.
- **`app/auth.tsx`** — dev-only paste block, guarded by `__DEV__` so it is compiled out of any
  production/release bundle (confirmed: `expo export` runs in prod mode → block absent). Rendered
  at the bottom of `IdleCard`: a `TextInput` (placeholder = the new i18n label) + a submit pill.
  `pasteSignIn()` runs `tokenFromPaste` then the **same** `signInWithMagicLink(token)` →
  `api.verifyMagicLink` → session-establish path the deep link uses (no second auth path). On
  failure it reuses the calm `auth.invalidLink` notice; empty input is a no-op. Styling reuses the
  email-row tokens (card bg, pill radius, accent button).
- **`src/i18n/locales/en.json`** — one new key `auth.pasteTokenDev` = "Paste magic-link token (dev)"
  (label + input placeholder + a11y label). Submit control is a `→` glyph (no copy to translate).
- **`src/__tests__/auth.test.tsx`** — `test.each` over the three paste shapes (raw / full `vita://`
  link / `token=` line): types it, presses the button, asserts `api.verifyMagicLink` is called with
  the extracted `abc123`.

Untouched: normal email magic-link flow, OIDC buttons, mock demo path, everything outside the
auth screen.

## Gates (all green)

- `tsc --noEmit` — 0 errors
- `jest` — 161/161 (32 suites), +3 new
- `api:check` — no drift
- `expo export --platform android` — OK (dev block absent from the prod bundle, as expected)

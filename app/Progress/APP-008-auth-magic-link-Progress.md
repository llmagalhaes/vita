# APP-008 — Auth screens + magic link

Asana: https://app.asana.com/0/1216519867368576/1216523338591682 (In progress)
Contract: `docs/contracts/vita-api-v0.yaml` §auth (v0.3.0) — `/auth/magic-link`,
`/auth/magic-link/verify`, `/auth/oidc`, `/auth/refresh`, `/auth/sign-out`.

## What shipped

Passwordless sign-in, faithful to the prototype "Sign in" screen.

- **Sign-in screen** `app/auth.tsx`: wordmark + tagline + blob, "Continue with
  Google/Apple", email magic-link input ("No passwords — ever"). Three states:
  idle → provider **consent card** ("Vita receives your name and email — nothing
  else") → OIDC exchange; email → **"Check your inbox"**. Calm error copy for a
  failed send and for an invalid/expired deep link. All strings via i18n `auth.*`.
- **Magic-link deep link** `src/auth/useMagicLink.ts`: handles
  `vita://auth?token=…` on **cold start** (`Linking.getInitialURL`) and **warm
  start** (`Linking.addEventListener`), parses the token, exchanges it via the
  session. Invalid/expired → `error` status → calm banner on the sign-in screen.
- **Session** `src/auth/session.ts`: single source of truth for the token pair.
  Tokens stored in **expo-secure-store** (Keychain/Keystore) so the session
  **survives app restart** (`load()` re-reads on boot). `signInWithMagicLink`,
  `signInWithOidc`, **single-flight `refresh`** (concurrent 401s share one
  rotation; a 401 family-revoke clears the session), `signOut` (local clear is
  immediate + best-effort server revoke). React via `useSyncExternalStore`
  (`useAuth`, `useAuthReady`) — no context/provider.
- **API client** `src/api/client.ts`: added the five auth methods to `Api` +
  http + mock. The http client now attaches `Authorization: Bearer` to
  authenticated calls and does a **silent refresh** — one 401 → rotate once →
  retry. Auth endpoints are public (no bearer). Hooks injected in
  `src/api/index.ts` via lazy thunks (avoids the session⇄api import cycle).
- **Auth gate**: `app/index.tsx` → signed out to `/auth`, else onboarding-once
  then `/home`. `app/(main)/_layout.tsx` redirects to `/auth` if the session
  clears (covers sign-out from anywhere). Root `_layout.tsx` reads the stored
  session before gating (holds render until `useAuthReady`).

## Real vs stubbed (for the dev build)

- **Magic link is fully real** against the contract — only the transport is
  mocked locally (no deployed API yet). In Expo Go the mock issues fake token
  pairs so the whole flow is walkable; against a real API base URL the same code
  hits `/auth/*` unchanged.
- **Google/Apple native sign-in is stubbed** (`src/auth/oidc.ts`,
  `getOidcIdToken`). Native OIDC (@react-native-google-signin /
  expo-apple-authentication) needs a **dev build** — not in Expo Go under SDK 56
  (**APP-007**, blocked on the CEO's store accounts). The button, consent card
  and `/auth/oidc` exchange are wired; only the id-token acquisition is stubbed:
  returns a fake token in mock mode (so the consent→session demo flows in Expo
  Go) and throws `OidcUnavailable` against a real API → the screen shows "use
  email for now". Swap that one function at APP-007; zero UI change (same pattern
  as APP-012's speech recognizer).

## Tests

- `src/auth/__tests__/session.test.ts` (7): magic-link exchange, invalid/expired
  → signed out, refresh rotation, **single-flight**, 401 family-revoke clears
  session, sign-out clears + revokes, **survives restart** (persist → `load`).
- `src/__tests__/auth.test.tsx` (5, RNTL + mock): idle render, provider→consent,
  email→check-inbox, **documented deep-link injection** (`vita://auth?token=ok`
  cold start → gate redirects to `/onboarding`), expired token → calm error copy.
  Deep-link source mocked via `expo-linking`; secure-store via
  `__mocks__/expo-secure-store.ts` (in-memory).

Results: `tsc --noEmit` clean · **Jest 51/51 (10 suites)**, +12 · `expo install
--check` up to date (SDK 56 preserved; only new dep **expo-secure-store
~56.0.4**) · `expo export` iOS OK · `api:check` green (regenerated types.gen.ts
to contract 0.3.0 — the drift predated this ticket, additive plan/program types).

## How to see it in Expo Go

`cd app/services/vita-app && npx expo start` → Expo Go. First screen is **Sign
in**. Two demo paths, no email/accounts needed:
1. **Email**: type any address → "Send link" → "Check your inbox" → tap
   **"Open the link · demo"** (mock-only) → re-enters via the real `vita://auth`
   deep link → session → onboarding → Home.
2. **Google/Apple**: tap → consent card → "Accept & continue" → session →
   onboarding (mock issues a fake pair). Real native sign-in awaits APP-007.

Sign-out clears the session (session module); onboarding/Home reachable after
sign-in and the session persists across a Metro reload.

## Deep-link test on a simulator (documented, not automated here)

Jest covers cold+warm via the `expo-linking` mock. On an iOS simulator:
`xcrun simctl openurl booted "vita://auth?token=<t>"`; Android:
`adb shell am start -a android.intent.action.VIEW -d "vita://auth?token=<t>"`.
A Maestro flow lands with the dev/tester builds (APP-007), same as APP-012.

## Questions for the CEO

None new. Real Google/Apple sign-in remains blocked on APP-007 (store accounts).

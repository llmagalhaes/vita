# ADR-0004 — One health integration: Android Health Connect (Google Fit is a dead end)

Status: Accepted · 2026-07-15 · APP-038 / APP-039

## Context

The CEO named the milestone as "Samsung Health + Google Fit". We verified the
current state of both Android health APIs before writing any client:

- **Google Fit APIs are deprecated.** Google stopped accepting new API sign-ups
  on **2024-05-01**; the Fit Android + REST APIs are supported only until the
  **end of 2026**, then shut down. Google's own migration guidance points
  Android / mobile-first apps to **Health Connect**. A brand-new Google Fit
  client cannot even be registered — building one is a dead end.
- **Samsung Health syncs into Health Connect.** Since Samsung Health v6.22.5
  (Oct 2022), the user can enable sync in Samsung Health → Settings → Health
  Connect, which shares Steps, Distance, Active/Total Calories, Exercise
  Sessions, Heart Rate, Sleep, etc. into Health Connect.
- **Health Connect is the Android aggregator.** It is the common on-device health
  data layer for Android; reading it gets Samsung + Google + other providers'
  fitness data through one API. It is Android-only (iOS uses Apple HealthKit; the
  Apple Health side is a separate future ticket).

## Decision

Ship **one** health integration: **Android Health Connect** (`react-native-health-connect`),
read-only, behind the existing stub seam (ADR-0003 pattern). It covers both
Samsung Health and Google fitness data. **Do NOT build a Google Fit client** —
it is deprecated and unregisterable.

In the app this means: the Integrations screen "Health Connect" toggle is the one
real switch; "Google Fit" is **not** a separate source (a Google Fit row would
imply a capability that no longer exists). Samsung data reaches Vita by the user
enabling Samsung Health → Health Connect sync on their phone, then connecting
Health Connect in Vita.

## Consequences

- Zero effort wasted on a sunsetting API; one native module, one permission flow.
- Health data is **device-local** (kv snapshot, no outbox) per backend ADR-0016 —
  Health Connect data never syncs to the Vita backend in v0 (EntrySource is
  server-set to `user`; health ingestion is a separate, not-yet-live contract).
- Real reads require the CEO's Samsung phone (or a Health-Connect-equipped
  emulator) — Health Connect cannot run in Expo Go, so the seam stubs it there.
- If the CEO ever wants Google-account cloud fitness (not on-device), that would
  be the **Google Health** cloud API — a different, server-side integration, out
  of scope here.

## Sources

- Google Fit → Health Connect migration & deprecation: https://developer.android.com/health-and-fitness/health-connect/migration/fit
- Samsung Health via Health Connect: https://developer.samsung.com/health/health-connect-faq.html

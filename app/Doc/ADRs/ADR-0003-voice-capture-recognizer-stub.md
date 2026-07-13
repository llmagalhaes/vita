# ADR-0003 — Voice capture: recognition behind a stubbed interface (no dev-client dependency in M1)

Status: Accepted · 2026-07-13 · APP-012

## Context

APP-012 adds hold-to-talk voice capture: press-and-hold the mic on the capture
pill → live on-device transcription → the final text runs through the **same**
APP-011 parse→confirmation flow. Requirement: audio never leaves the device;
only text does.

We are pinned to **Expo SDK 56** and must stay runnable in **plain store Expo
Go** (ADR-0002, `npx expo install --check` is the guard). No dev-client build is
possible yet — it needs the CEO's Apple/Play accounts (APP-007 blocker).

On-device speech-to-text options were evaluated:

- **`expo-speech-recognition@56.0.1`** — the only maintained Expo-flavored lib.
  Verified from its tarball: ships native iOS Swift + Android Kotlin modules, a
  `.podspec`, `expo-module.config.json`, and an `app.plugin.js` config plugin.
  It is a **prebuild / dev-client native module** — not part of the Expo Go
  binary, so it is `undefined` (crashes) in plain store Expo Go.
- `@react-native/voice`, `expo-av` recording + a cloud STT — either native
  (same Expo Go problem) or send audio off device (violates the privacy rule).
- `expo-speech` — text-to-**speech**, not recognition. Irrelevant.

Conclusion: **no on-device recognition engine runs in plain store Expo Go under
SDK 56.** Installing `expo-speech-recognition` would force a dev-client build and
break the ADR-0002 constraint.

## Decision

Ship the **entire** voice capture UX — hold-to-talk gesture, live-transcript
surface, release-to-send, slide-up-to-cancel, permission/denied/unavailable/
error states, graceful fallback to text — with recognition **behind a
`SpeechRecognizer` interface** (`src/capture/speech.ts`). The shipped default is
`stubRecognizer`: it streams a demo phrase as partials and returns it as the
final on release, so every UI state is reachable and demonstrable in Expo Go.

Do **not** add `expo-speech-recognition` (or any native STT) now. The real
engine drops in behind the same interface via `setRecognizer()` the moment a
dev-client build exists (APP-007), with **zero UI changes**.

The final transcript is handed to `capture.submit()` — the existing APP-011
path. There is no parallel capture stack.

Mic/speech permission usage strings (calm, factual, "audio never leaves your
device") are pre-declared in `app.config.ts` (`ios.infoPlist` +
android `RECORD_AUDIO`) so the native manifest is ready when APP-007 lands. They
are inert in Expo Go (no native code requests them).

## Consequences

- M1 stays on plain store Expo Go; SDK 56 guard stays green; no new deps.
- Voice UX, copy, i18n, gesture, and the parse handoff are fully built and
  tested now (component + state-machine tests). Only the recognition backend is
  deferred.
- Real on-device recognition is **blocked on APP-007** (dev build). When
  unblocked: `npm i expo-speech-recognition`, add its config plugin, implement
  the interface, `setRecognizer(realRecognizer)`. No UI rework.
- Mic is not CI-testable; real recognition is covered by a manual QA script
  (`Progress/APP-012-voice-capture-Progress.md`), not Maestro.

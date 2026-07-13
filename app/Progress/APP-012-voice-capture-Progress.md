# APP-012 — Voice capture (hold-to-talk, live transcript)

Asana: Vita frontend board `1216519867368576` (moved to In progress).
Status: built in Expo Go with recognition **stubbed** (see ADR-0003). Real
on-device recognition blocked on APP-007 (dev build).

## What shipped

Hold-to-talk on the capture pill's mic, over a small state layer that reuses the
APP-011 parse→confirm path — no parallel capture stack.

- `src/capture/speech.ts` — `SpeechRecognizer` interface + `stubRecognizer`
  (streams a demo phrase as partials, returns it as the final on stop) +
  `getRecognizer()`/`setRecognizer()`. Audio never leaves the device; only the
  final text is passed on.
- `src/capture/useVoiceCapture.ts` — hold-to-talk state machine:
  `idle → listening → transcribing → idle`, plus `denied`, `unavailable`,
  `error`. `holdStart` (permission → start), `holdMove(y)` (arm cancel when
  dragged up past `CANCEL_THRESHOLD`), `holdEnd` (release: send or abort),
  `dismiss`. Final transcript → the callback the pill wires to `capture.submit`.
- `src/capture/VoiceOverlay.tsx` — pure full-screen surface: pulsing mic + live
  transcript + "Slide up to cancel" / "Release to cancel"; a calm fallback card
  for denied/unavailable/error with **Type instead** (→ opens the text field).
- `CapturePill.tsx` — mic wrapped in a gesture-handler `Pan` (runOnJS): a quick
  tap (< `HOLD_MS`) toggles the text field as before; a hold starts voice;
  drag-up-then-release cancels; release sends. `onAccessibilityTap` keeps the
  tap-to-type affordance for screen readers.
- `en.json` — all copy under `capture.voice.*` (i18n-ready; English only).
- `app.config.ts` — pre-declared `NSMicrophoneUsageDescription`,
  `NSSpeechRecognitionUsageDescription`, android `RECORD_AUDIO` for the future
  dev build. Inert in Expo Go.

## Does real recognition work in Expo Go SDK 56?

**No — and by design it can't.** `expo-speech-recognition@56.0.1` is a native
module + config plugin (verified from its tarball: iOS Swift, Android Kotlin,
`.podspec`, `app.plugin.js`). It requires a prebuild/dev-client and is absent
from the Expo Go binary. No on-device STT engine runs in plain store Expo Go
under SDK 56. Per the ticket's stop-condition, we did not pull it in. The stub
makes every state reachable and demonstrable in Expo Go; the real engine drops
in behind the same interface at APP-007 with zero UI changes (ADR-0003).

## Tests

`src/__tests__/voice-capture.test.tsx` (14 tests):
- State machine via a host component + a controllable fake recognizer:
  listening→partial→release→transcribing→final submits; slide-up cancel (no
  submit); permission denied; engine unavailable; recognizer error; dismiss.
- `VoiceOverlay` rendering for idle/listening/listening+cancel/transcribing/
  denied/unavailable/error.
- Stub recognizer streaming (fake timers).

Gates: `tsc --noEmit` clean · **Jest 39/39 (8 suites)**, +14 new · `expo install
--check` up to date (no new deps, SDK 56 preserved) · `expo export` iOS Hermes
bundle OK.

## Manual QA script (mic isn't CI-testable; run on a device once a dev build exists)

1. Home → press-and-hold the mic. Expect a listening overlay with a live
   transcript growing word by word (stub streams a demo phrase).
2. Release over the mic → the transcript flows into "Making sense of it…" →
   confirmation card (APP-011). Confirm → it lands in the timeline.
3. Hold again, drag your finger up until it reads "Release to cancel", release →
   nothing is logged, overlay dismisses.
4. Quick tap the mic (don't hold) → the text field expands as before.
5. Real engine only (post-APP-007): first hold shows the OS mic/speech
   permission dialog with the calm copy; deny → the denied card with "Type
   instead"; tapping it opens the text field.
6. Airplane-mode / engine-off device → "Voice input isn't available" card.

## Follow-ups

- APP-007 (dev build, CEO Apple/Play accounts) unblocks real recognition:
  `npm i expo-speech-recognition`, add its plugin, implement `SpeechRecognizer`,
  `setRecognizer(real)`. Then add a Maestro flow where the simulator permits.
- Consider a haptic tick on hold-start / cancel-arm once on a device.

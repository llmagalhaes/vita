# APP-069 — Real on-device voice STT (session 15, 2026-07-20)

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216730553659158
CEO decision 2026-07-20 (option A): build real voice via ON-DEVICE STT. Claude accepts no
audio; interpretation stays Claude via `/parse/text`. Device STT only does sound→text; audio
never leaves the device. Left In progress (DoD = in production / store).

## Library chosen
**`expo-speech-recognition@56.0.1`** (pinned exact; the SDK-56 line — its npm dist-tags map
`sdk-54/55 → 3.1.3`, `56.0.x` = SDK 56, so 56.0.1 is the SDK-56 build). One-line justification
(ponytail ladder rung 5, no native code we write): it's the maintained Expo **config-plugin
module** wrapping Android `SpeechRecognizer` / iOS `SFSpeechRecognizer` — gives partial results,
device locale, on-device recognition, and CNG-safe permission/`<queries>` wiring, exactly the
`SpeechRecognizer` seam this repo already has. No cloud STT, no audio upload.

## What changed (behind the existing seam — no new capture path)
- **`src/capture/speech.ts`** — new `nativeRecognizer(mod?)` implements the existing
  `SpeechRecognizer` interface over `ExpoSpeechRecognitionModule`:
  - `result` event → partial (`onPartial`) / final (`onFinal`, once — late duplicates ignored)
  - `error` event → `onError` (except user `aborted`, which is a cancel not a failure)
  - `end` event → safety-net empty final so a no-result stop resets calmly
  - `isRecognitionAvailable()` gates the honest unavailable state; `requestPermissionsAsync()`
    → granted / denied (never fabricates on not-granted)
  - `start({ lang: deviceLocale(), interimResults:true, continuous:false })`.
  - New pure `deviceLocale()` = `Intl.DateTimeFormat().resolvedOptions().locale` (Hermes ships
    Intl on RN 0.85 → device locale, e.g. `pt-BR`) → **zero-dep**, no expo-localization.
  - `defaultRecognizer()`: StoreClient (Expo Go / jest) → `stubRecognizer`; any real build →
    `nativeRecognizer`, falling back to `unavailableRecognizer` if the module can't load. So
    **tests need no native module and stay green**; the fabricating canned-phrase stub never
    runs on a real device again (the APP-058 root cause).
- **`app.config.ts`** — added the `expo-speech-recognition` config plugin (mic + speech usage
  strings, `androidSpeechServicePackages`). It injects RECORD_AUDIO + iOS usage strings +
  `<queries><intent><action android:name="android.speech.RecognitionService"/>`.
- **`package.json` / lock** — `expo-speech-recognition` pinned `56.0.1`.
- **`src/capture/__tests__/speech.test.ts`** (new, +5) — drives the native event mapping via a
  fake module: partial/final ordering + dedupe, error→onError (honest, not silent), abort
  suppresses late events, end→empty-final reset, denied permission never fabricates.

Partial transcripts flow into the same `useVoiceCapture` state machine → the existing
equalizer/`VoiceOverlay` UI; the final transcript flows into the existing capture→`/parse/text`
path (unchanged). Denied / unavailable / error / no-speech all route to the calm "Type instead"
fallback (`capture.voice.*` copy already present) — no silent failures.

## Gates
- **tsc 0** · **Jest 221/221 (44 suites, +5)** · **expo export iOS OK** · `expo install --check`:
  no warning for expo-speech-recognition (the listed drifts are pre-existing, out of scope).
- Prebuild regen (android/ gitignored, CNG) → merged AndroidManifest verified to contain
  `RECORD_AUDIO` + the `RecognitionService` `<queries>`. (⚠ prebuild rewrites package.json
  `android`/`ios` scripts to `expo run:*` — reverted, per the standing CNG note.)
- **Release APK rebuilt** with prod URL baked: `VITA_API_BASE_URL=…/v1 ./gradlew
  :app:assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`.
  Verified the native module (`libexpo-speech*` / `expo.modules.speechrecognition`) and
  RECORD_AUDIO are in the built APK's merged manifest (see session log).

## Verified vs CEO-device-only
- **Emulator/CI-verified:** unit event-mapping (5 tests) + the full state machine; tsc/jest/export;
  merged-manifest RECORD_AUDIO + RecognitionService queries; APK contains the native module.
- **CEO-device-only (emulator STT is unreliable — no recognition service / no speech input):**
  actual sound→text transcription, pt-BR locale resolution, partial-result streaming into the
  equalizer, permission dialog grant, and the end-to-end parse.

## CEO device-test recipe (real STT)
1. Reinstall the fresh APK clean: `adb uninstall com.llmagal.vita` then
   `adb install -r android/app/build/outputs/apk/release/app-release.apk`.
   (Real device preferred; Google app / "Speech Recognition & Synthesis" must be present —
   it is on any stock Samsung/Pixel. Emulators usually have no recognition service → expect the
   "Voice input isn't available… type instead" state, which is the honest path, not a bug.)
2. Ensure the phone language/region is Portuguese (Brazil) so the recognizer picks pt-BR
   (locale comes from the device; English also works, it just recognizes English).
3. On Home, **press and hold** the mic on the capture pill → grant the microphone/speech
   permission on first use → speak clearly: **"comi um pão de queijo e café com leite"** →
   release.
4. Expect: partial words animate the equalizer while holding → on release a parsed **meal draft**
   (pão de queijo, café com leite) appears in the confirmation card → confirm → it lands on the
   timeline with real kcal (APP-061 fix).
5. Negatives to sanity-check (all should be calm, never a fabricated log):
   - Say nothing → "Vita didn't catch that. Try again, or type instead."
   - Deny the mic permission → "Vita needs the microphone… or type instead."
   - Slide up while holding → cancels, nothing logged.
6. If anything stalls, capture `adb logcat -s ReactNativeJS` during the attempt and report.

## Dependencies on other teams
- None new. (APP-061 kcal fix already shipped; parse path unchanged.)

## Questions for the CEO
- None blocking. Confirm on-device transcription + pt-BR on your phone; if you want a fixed
  recognizer language regardless of device locale, say so (one-line change to `deviceLocale()`).

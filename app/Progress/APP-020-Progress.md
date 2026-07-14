# APP-020 — F3 Photo capture (app half)

Asana: Vita frontend `1216519867368576` · slice 5 of `docs/backlog-local-100.md`.
Standing decision **D3**: photo = multipart direct to `POST /parse/photo`; app downscales to 1568px JPEG q0.8; no `/uploads`.

## What was built (mock mode — BE-018 not live yet)

Pill camera button → `expo-image-picker` (library) → downscale to 1568px longest side / JPEG q0.8 → multipart `POST /parse/photo` → draft with **quantity steppers** → existing confirm/outbox path adds a meal (plate) or workout (whiteboard). Calm decline/error states with a **"type instead"** fallback throughout.

The whole flow reuses the existing CaptureContext state machine (parsing → review → confirm) — no parallel stack. In mock mode `parsePhoto` returns a canned draft; the transport/shape is real, so pointing `VITA_API_BASE_URL` at a live BE-018 just works.

## Files

New:
- `src/capture/photo.ts` — `pickPhoto()` (permission → library pick → downscale, every branch mapped to a calm outcome: `picked | denied | cancelled | error`), pure `downscaleSize()` + `downscale()` (deprecated `manipulateAsync`, ponytail-noted). `MAX_EDGE=1568`, `JPEG_QUALITY=0.8`.
- `src/capture/quantity.ts` — pure `stepItem()` (linear macro scaling, raw values kept so stepping is exactly reversible; display rounds) + `mealTotals()`.
- `src/capture/__tests__/photo.test.ts` — downscaleSize/downscale + all four pickPhoto branches (expo modules mocked).
- `src/capture/__tests__/quantity.test.ts` — stepper scaling + reversibility.
- `src/api/__tests__/parse-photo.test.ts` — mockPhotoParse (meal + workout), photo→confirm→outbox (addLocalEntry + drainOutbox synced), and the **multipart transport shape** (FormData body, no JSON content-type) BE-018 must match.

Changed:
- `src/api/client.ts` — `Api.parsePhoto(...)`; `request()` now leaves FormData bodies un-encoded and drops the JSON Content-Type so fetch sets the multipart boundary; http impl builds the `image`/`caption`/`capturedAt` form.
- `src/api/mock.ts` — `mockPhotoParse()` (canned plate meal; gym-caption → whiteboard workout) + `parsePhoto` on the mock.
- `src/capture/CaptureContext.tsx` — `submitPhoto()`, `updateDraft()` (steppers), `requestTextEntry()` (+ `textEntryNonce`), error payload (`errorKey`/`canRetry`) so photo failures show "type instead" vs text's "try again". 422→`unrecognized`, 413→`tooLarge`, else→`error`.
- `src/capture/CaptureSheet.tsx` — `Stepper` control; photo-meal drafts render an editable per-item list; error block branches on `canRetry`; empty phrase (photo, no caption) hides the quote.
- `src/capture/CapturePill.tsx` — camera button → `onCameraPress`; calm decline/error notice card with "type instead"; effect opens the field on `textEntryNonce`. Removed the old `photoNotYet` toast.
- `src/i18n/locales/en.json` — `capture.photo.*`; removed stale `capture.photoNotYet`.
- `app.config.ts` — `NSPhotoLibraryUsageDescription` + `expo-image-picker` plugin (dev-build ready; inert in Expo Go).

New deps (Expo Go SDK 56 compatible): `expo-image-picker@56.0.20`, `expo-image-manipulator@56.0.21`.

## Gates

- `tsc --noEmit` — clean.
- `jest` — **80/80 (17 suites)**, +16 (photo 8, quantity 4, parse-photo 4). Pre-existing auth.tsx `act()` warning unrelated.
- `api:check` — **clean, no drift** (contract untouched; the warned plan/program drift did not appear).
- `expo export --platform ios` — OK (4.2 MB Hermes bundle).
- `expo install --check` — up to date, SDK 56 preserved.

## Backend follow-up for BE-018 (multipart handshake)

The app sends `multipart/form-data` to `POST /parse/photo` with:
- `image` — file part, filename `photo.jpg`, `Content-Type: image/jpeg` (downscaled ≤1568px longest side, JPEG q0.8; ~well under the 5 MB backstop).
- `caption` — optional text part (the typed/spoken hint).
- `capturedAt` — optional text part, ISO-8601.

No JSON body, no `Content-Type` header set by the app (fetch writes the multipart boundary). Response consumed as `ParseResult` (v0.3.0). BE-018 should read the file part under field name **`image`**. 413 (>5 MB) and 422 (nothing recognizable) are handled with calm copy + "type instead".

## Notes / deferrals

- ponytail: **library pick, not live camera** — works on simulator AND device, calmest demo. Swap `launchImageLibraryAsync` → `launchCameraAsync` (+ camera permission) if live capture is wanted later; one line, no UI change.
- `manipulateAsync` is deprecated-but-present in SDK 56; ponytail-noted with the `ImageManipulator.manipulate(...)` upgrade path.
- Quantity steppers are meal-only (plate). Workout whiteboards show the existing exercise list (sets/reps aren't a single "quantity").

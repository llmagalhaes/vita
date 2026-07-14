# APP-031 — Export PDF, on-device (slice 7, F11) — Progress

**Asana:** APP-031 (Vita frontend `1216519867368576`) — "export sheet with per-audience content chips → HTML from local SQLite → expo-print → expo-sharing. Estimates labeled in the PDF; nothing leaves the device until shared."
**Backend gate:** none — D2, fully on-device.

## What was built

### Pure HTML builder — `src/export/pdf.ts`
- `buildExportHtml(entries, opts)` — pure (entries in → HTML string out), unit-tested. Sections: meals (dated list, kcal), workouts, water (daily), macros (daily P/C/F), energy (daily in/out). Reuses `aggregateDays` for the daily rollups.
- **Estimates labeled in the PDF**: every number carries an `estimate` marker, plus a header line "Every number is an estimate from what you told Vita — Vita sets no goals and gives no advice."
- **Trust boundary**: user free-text (meal/workout titles) is HTML-escaped before it enters the document.
- `AUDIENCES` — per-reader defaults (doctor: meals/water/energy · trainer: workouts/energy · nutritionist: meals/macros/water · myself: everything).

### On-device IO — `exportPdf(opts)`
Reads the **last 30 days from local SQLite** (`entriesInRange` × meal/water/workout) → `buildExportHtml` → `expo-print` `printToFileAsync` → `expo-sharing` `shareAsync`. **Nothing leaves the device until the user picks a share target** in the OS sheet. Native modules are lazy-required so Jest and the pure builder never load them.

### Export sheet — `src/export/ExportSheet.tsx`
Modal: pick a reader → **per-audience content chips** (start from the audience default, tap to include/exclude) → "Prepare PDF" → `exportPdf`. Footer: "Nothing is shared until you send the file."

## Confirmation: nothing leaves the device until shared
The only network-capable path in export is `Sharing.shareAsync`, invoked *after* the PDF is rendered locally from SQLite and *only* when the user taps Prepare and then chooses a target in the OS share sheet. No backend call, no upload — verified by the module structure (builder is pure; `exportPdf`'s sole outputs are `printToFileAsync` (local file) then the OS share sheet).

## New deps (Expo Go SDK 56, pinned via `expo install`)
`expo-print@~56.0.4`, `expo-sharing@~56.0.21`. `app.config.ts` plugins += `expo-sharing` (inert in Expo Go).

## Tests — `src/export/__tests__/pdf.test.ts`
Builds HTML **from SQLite entries** (seed → `entriesInRange` → builder) with selected sections; **estimates labeled**; only chosen sections appear; **free-text HTML-escaped**. 4 tests.

## Gates
`tsc` clean · `jest` green · `api:check` no drift · `expo export` iOS OK · `expo install --check` up to date, SDK 56, +2 deps.

## ponytail
- Content chips are toggleable over the audience default (one shared section set) rather than four bespoke chip lists.
- One HTML template, inline CSS — no PDF layout library.

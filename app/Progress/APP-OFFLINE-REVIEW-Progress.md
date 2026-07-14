# APP-OFFLINE-REVIEW — offline-capture review banner

CEO Round 12 #2 (`docs/ceo-decisions.md`) / Fable audit-2 §5 + finding 1.8. Scope: app
only (`app/services/vita-app/`). No backend/contract change. No git (orchestrator commits).

Problem: offline captures that can't reach `/parse` are parked and, on reconnect,
`interpretPending` parses + **auto-adds** the drafts to the log — skipping the online
confirm/adjust/discard sheet. The discard affordance vanished exactly when parse
confidence is lowest. CEO call: keep the auto-add (durability), but mark those entries
`needsReview` and surface a banner so the affordance comes back.

## What changed

### 1. `needsReview` flag (durable, per-entry)
- `src/db/db.ts` — `entries.needsReview INTEGER NOT NULL DEFAULT 0`, plus a guarded
  `ALTER TABLE … ADD COLUMN` (PRAGMA-checked) for dbs created before this column.
- `src/db/entries.ts` — `LocalEntry.needsReview?: boolean`; `addLocalEntry(entry, needsReview=false)`
  writes the column. Set **only** by `interpretPending`; the online confirm path
  (`CaptureContext.confirm` → `addLocalEntry(draft)`) leaves it false.
- `src/db/outbox.ts` — `interpretPending` now calls `addLocalEntry(draft, true)`.

### 2. Home banner
- `app/(main)/home.tsx` — `reviewCount = countNeedsReview()` (memo on `version`); banner
  rendered between the check-in banner and the hero, hidden when `reviewCount === 0`.
  Same Card/accent/`FadeInDown` style as the APP-025 check-in banner. Tapping calls
  `openReview()`. Home's water+macros two-column `flex:1` row is untouched.
- Copy: `home.offlineReviewOne/Many` = "N offline captures added — tap to review",
  `home.offlineReviewSub` = "Added while offline · check they look right".

### 3. Review stack sheet — reuses the check-in + capture UX
- `src/review/ReviewSheet.tsx` (new) — mirror of `CheckinSheet`: same overlay,
  drag-to-dismiss, and step-through-a-queue. Snapshots `entriesNeedingReview()` on open.
  Entry summary reuses the capture **`DraftCard`** (now exported from `CaptureSheet.tsx`;
  `LocalEntry` is a `NewEntry` + extras, so it renders as-is). Per entry:
  - **Keep** → `clearReview(id)` (drops the flag, entry stays in the log).
  - **Adjust** → `deleteEntry(id)` + `capture.promptAdjust(sourcePhrase)` — reopens the
    capture pill prefilled, mirroring the online adjust (the draft is redone, not kept
    alongside).
  - **Discard** → `deleteEntry(id)` (gone from the log + outbox).
  - When the last is cleared the sheet closes and the banner disappears.
- `src/db/entries.ts` — `entriesNeedingReview()`, `countNeedsReview()`, `clearReview(id)`,
  `deleteEntry(id)` (removes the entry + cancels its queued outbox op).
- `src/capture/CaptureContext.tsx` — added `promptAdjust(phrase)` (setPrefill + bump
  textEntryNonce so the field opens even when the phrase is empty, e.g. a photo capture).
- `app/(main)/_layout.tsx` — mounts `<ReviewSheet />` alongside `<CheckinSheet />`.

### 4. `failed`-card discard (audit Q2, minimal)
- `app/(main)/home.tsx` — the terminal `failed` timeline card (poison-dropped op,
  "couldn't be saved") now shows a **Dismiss** action → `deleteEntry(id)` + `logChanged()`.
  No retry infra (out of scope); a delete is the affordance.

## Deliberate simplifications (ponytail)
- `deleteEntry` is **local only** — there is no delete endpoint in the contract and the
  local SQLite is the display source (entries are never re-fetched), so a removed entry
  stays gone on-device. Server-side delete would need a new contract op (see Questions).
- Guarded `ALTER` over a migration framework — one late column, ~5 dev users.

## Gates
- `tsc --noEmit`: exit 0
- `jest`: **158/158 (32 suites), +4** — 3 in `entries.test.ts` (flag set only on auto-add;
  Keep clears flag/keeps entry; Discard deletes entry — both empty the banner) + 1 in
  `outbox.test.ts` (`interpretPending` drafts are `needsReview`, and a plain online add is not).
- `api:check`: exit 0, no drift.
- `expo export --platform ios`: OK (dist bundle produced; artifacts cleaned).
- Walkable in Expo Go SDK 56, mock mode.

## Questions for the CEO
- **Server-side delete on Discard.** Discard removes the entry locally only; if the parked
  capture already synced before the user discards it, the server copy remains (it still
  counts in server-aggregated trends). Making Discard authoritative needs a delete/void
  contract op from the backend. Ship local-only for now, or request the endpoint?

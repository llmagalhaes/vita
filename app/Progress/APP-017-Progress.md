# APP-017 — Water, complete (slice 1) — Progress

**Asana:** APP-017 (Vita frontend `1216519867368576`) — "Home Water card expands to the day's log list; timeline water cards navigate to a new `water/[id]` detail screen; quick-add unchanged."
**Backend gate:** none. Pure app work against existing local SQLite + mock.

## What was built

1. **Units-aware volume formatting** — new `src/lib/units.ts` `formatVolume(ml, units, t)`:
   metric → `250 ml` / `1.25 L` (≥1 L); imperial → whole `oz` (ml / 29.5735, the same US-fl-oz constant the prototype's trends use). `t` keeps the unit words i18n-ready (`common.ml` / `common.l` / `common.oz`). Replaces the ad-hoc `>= 1000 ? L : ml` inline in Home.

2. **Home Water card** (`app/(main)/home.tsx`):
   - Main figure now units-aware via `formatVolume`.
   - Expanded log rows now show **amount · method · time** (were amount · time only) and each row is a `Pressable` that navigates to `/water/<id>`.
   - Quick-add untouched — still `addLocalEntry` + `drainOutbox` (existing outbox path).

3. **Timeline water cards navigate** (`home.tsx` `TimelineCard`): the openable rule changed from "meal only" to a per-kind href — meal → `/meal/<id>`, water → `/water/<id>`, workout still inert (its detail is APP-018/019). The water badge is units-aware too. **Clears the "water card doesn't navigate" debt.**

4. **New `water/[id]` detail screen** (`app/(main)/water/[id].tsx`): mirrors the meal-detail layout/pattern — back button, "Water" eyebrow, hero (amount + `day · time · method` subtitle) with the `water` wave illustration, and a **"That day's water"** card listing every water entry of that calendar day (amount · method · time), the current entry highlighted (accent dot + bold), with the day total. Read-only over SQLite via `getEntry` + `entriesForDay`. Calm footer, `notFound` fallback like meal detail.

5. **i18n** (`src/i18n/locales/en.json`): added `common.l`, `common.oz`, and a `waterDetail.*` block (eyebrow/back/today/dayLog/footer/by*/notFound). English-only per the i18n-ready convention — adding a language stays "add a locale file".

## Files changed
- `src/lib/units.ts` (new)
- `app/(main)/water/[id].tsx` (new)
- `app/(main)/home.tsx` (water card figure + expanded rows + navigation; `useRouter`, `units`, `Units` import, `formatVolume`)
- `src/i18n/locales/en.json` (`common.l`, `common.oz`, `waterDetail.*`)
- `src/__tests__/water-detail.test.tsx` (new — formatVolume branches + detail render + not-found)

No new deps. No contract change. No backend change. SDK 56 preserved.

## Tests / gates (all green)
- `tsc --noEmit` → exit 0, clean.
- `jest` → **54 passed / 54 (11 suites)** (+1 suite, +3 tests vs 51/10). Pre-existing act() warning in `auth.test.tsx` unchanged (not from this work).
- `api:check` → exit 0, no contract drift.
- `expo export --platform ios` → OK, iOS Hermes bundle built (water route bundled, no route errors).

## How to test in Expo Go (SDK 56, mock mode)
1. `cd app/services/vita-app && npm install && npx expo start` → open in store Expo Go.
2. Complete onboarding to Home. The seed has one 250 ml water entry at 08:15.
3. Tap **+ 250 ml** a couple of times → water card figure updates; tap the **Water card** to expand → see the day's rows (amount · method · time); tap a row → water detail.
4. Scroll to the timeline → tap the **Water** card → same detail screen (back returns).
5. Set units to Imperial in onboarding to see `oz` everywhere the figure/rows/badge/detail render.

## Notes / follow-ups
- `WaterDetail` in the contract is just `{ amountMl }` — "method" in the ticket = the entry's `inputMethod` (voice/text/photo/tap), already on every entry. **No contract or backend follow-up needed.**
- Nested `Pressable` (row inside the expand-toggle card) relies on RN's responder system so the row navigates without toggling the card — same proven pattern the quick-add button already uses inside that card.

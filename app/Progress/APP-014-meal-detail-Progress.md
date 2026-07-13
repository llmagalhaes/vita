# APP-014 · Meal detail screen — Progress

Asana: https://app.asana.com/0/1216519867368576/1216517968878031
Status: **In progress** (DoD = production/tester build; screen built + tested locally).

## What shipped (session 3, 2026-07-13)

Read-only meal detail over existing SQLite data — fully offline, no backend.

- **Route** `app/(main)/meal/[id].tsx` — reads the entry via `getEntry(id)` from SQLite. Renders, faithful to the prototype "Meal detail" screen:
  - back button + "Meal" eyebrow;
  - hero card: title, `Today · HH:MM · logged by voice/text/photo/quick add`, **estimate** tag, big kcal number, meal wave illustration;
  - source-phrase card (dashed, italic quote) — shown only when `sourcePhrase` present;
  - **"In this meal"** item breakdown ("how the estimate was built"), per-item quantity/unit + kcal;
  - **macro donut** (`@vita/ui` `Donut`) with legend: protein/carbs/fat grams + calorie-share %;
  - **micronutrients** vs daily reference — micros aggregated by name across items, `Bar` + `% of daily reference` (FDA Daily Values, ADR-0009 / CEO default);
  - footer "Estimated by Vita from your description."
  - Fallback copy when the id is missing or the entry isn't a meal.
- **New primitive** `src/ui/Donut.tsx` (genuinely missing — task named it) — proportional SVG ring, `children` overlays the centre kcal label. Exported from `src/ui`.
- **Navigation**: timeline **meal** cards in `app/(main)/home.tsx` are now `Pressable` → `router.push('/meal/<id>')`. Water/workout cards stay non-navigating (their detail screens are separate tickets).
- **Types**: exported `MealItem` and `Micro` from `src/api/client.ts` (were internal).
- **Seed**: added realistic `micros` to the demo yogurt+granola meal so the screen is full in Expo Go.
- **i18n**: all strings under `mealDetail.*` in `en.json` (macro names reuse `home.protein/carbs/fat`). English-only, add-a-language = add-a-file.

## Design decisions (kept simple)

- Macro **share %** computed from calorie contribution (protein/carbs 4 kcal/g, fat 9), not gram share — matches how the donut reads.
- Micros live at `MealItem.micros` in the contract; meal-level view **aggregates by name** (sum amount + percentDaily). No new data plumbing.
- Estimate tag on the hero + "kcal · estimate" in the donut centre — every derived number carries the tag, per philosophy.

## Verification

- `tsc --noEmit` clean.
- Jest **25/25 (7 suites)** — new `src/__tests__/meal-detail.test.tsx` (renders phrase/items/macros/aggregated micros/estimate/footer; missing-entry fallback) + router mock updated in `home.test.tsx`.
- `npx expo install --check` up to date (SDK 56 guard green).
- `npx expo export --platform ios` bundles OK (route compiles into Metro bundle).

## How to see it in Expo Go

`cd app/services/vita-app && npm install && npx expo start` → Expo Go → onboarding → Home. Tap the seeded **"Yogurt & granola"** meal card in today's timeline → meal detail opens with donut + micros. Back button returns Home.

## Not in this ticket

- Workout detail (muscle map) and water detail — separate tickets; their cards intentionally don't navigate yet.
- Micronutrient values are backend estimates; the app renders names/units verbatim (contract review pt 7).

# R18-D — two inputs the CEO could not use (habit time · weight)

Round 18, CEO device feedback. Two input upgrades, no behaviour change beyond the
input itself: the habit wire format and the weight entry are byte-identical to before.

## Item 1 — new-habit reminder time

**Was:** a free-text `FormInput` — the CEO had to type the colon
("preciso digitar até os dois pontos"), and nothing validated what he typed.

**Is:** the OS time picker. `@react-native-community/datetimepicker` (the RN
standard, Expo-aligned version) behind a new `src/habits/timeField.tsx`:

- `TimeField` = the whole "Reminder time" row (tappable value + hint + the picker
  below it — Android puts up a dialog, iOS renders a wheel inline, so the picker
  cannot sit *inside* the row's flex).
- `hhmm(Date)` / `atTime("HH:MM")` are the format seam. **The wire format is
  unchanged** — `Habit.time` still stores 24h `"HH:MM"`, which is what the notifier,
  the habit rows and `library.habits.notifOn` already read.
- `is24Hour` comes from the device locale (`toLocaleTimeString` has no AM/PM →
  24h), not from a hardcoded country.
- Android's dialog is one-shot (closes on set/dismiss); iOS' wheel stays and streams
  changes. A dismissed picker writes nothing.

**⚠ NATIVE DEPENDENCY — PREBUILD REQUIRED.** `@react-native-community/datetimepicker`
`9.1.0` (exactly the version `expo/bundledNativeModules.json` pins for SDK 56) is a
native module: `npx expo prebuild` + a fresh APK/iOS build before this ships. Expo Go
and the current APKs will NOT have it. No config plugin needed — it autolinks.

Jest: `__mocks__/@react-native-community/datetimepicker.tsx` (auto-applied manual
mock, a plain `View` that keeps its props so a test can fire `change` on it).

## Item 2 — weight

**Was:** a slider 60–100 kg **plus** a typed field. Two bugs in one card: the slider's
ceiling excluded anyone above 100 kg (the CEO's report — "pessoas acima disso ficariam
exclusas"), and the typed field clamped **per keystroke** through `clampTypedKg`, so
typing "1" of "104" snapped to the 30 kg floor and `value={String(kg)}` wrote it back —
the field was effectively untypeable, which is presumably why nobody noticed the ceiling
was the only way in.

**Is:** one typed field, no slider. CEO said free numeric text or a wheel; the slider was
the thing at fault, so it is gone rather than re-scaled (a wheel would have been a second
widget for the same job).

- `parsedKg(text)` in `src/day/weight.ts` is the single seam: comma or dot via the
  existing `numOf` (imported from `src/build/parts.tsx`, not duplicated), rounded to
  0.1 kg, `null` for anything outside **20–300 kg** or not a number.
- `null` disables Save and marks the field border — a half-typed "8" is not silently a
  20 kg reading.
- Raw text is the state, so the field is typeable; the seed still prefills today's/last
  reading.
- `WEIGHT_SLIDER` and `clampTypedKg` deleted (`parsedKg` replaces both).

## Files

- `src/habits/timeField.tsx` (new), `src/habits/__tests__/timeField.test.tsx` (new)
- `__mocks__/@react-native-community/datetimepicker.tsx` (new)
- `src/library/sections/Habits.tsx` (the time row → `<TimeField />`)
- `src/day/weight.ts`, `src/day/overview/WeightCard.tsx`
- `src/day/__tests__/overview.test.tsx` (typed-weight test now drives "104,6" — comma
  decimal AND over the old ceiling, the exact thing the CEO could not do)
- `src/i18n/locales/en.json`: `overview.weight.dualHint` → `hint` (the slider it
  described is gone), `library.habits.timeHint` reworded to "tap to pick".
- `package.json` / `package-lock.json`: the new native dep.

## Gates

- `npx tsc --noEmit` → **0**
- `npx jest` → **614 passed, 1 skipped, 2 failed** — both failures are in files other
  builders had open mid-flight this same round (`src/build/food/__tests__/draft.test.ts`,
  `src/nav/__tests__/panelShell.test.tsx`), neither touched here. Every suite in this
  ticket's areas is green: `src/day src/library src/habits` → 13 suites, 118 passed.

## Not done (deliberate)

- No wheel picker for weight — the text field is the whole fix and needs no widget.
- Weight still isn't read from Health Connect; every reading is still one the user typed,
  which is what the card's source line says.

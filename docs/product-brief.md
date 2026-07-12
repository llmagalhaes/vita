# Vita — Product Brief

> Source of truth for what Vita is. Derived from the hi-fi prototype (`docs/prototype/vita-prototype.dc.html`, 20+ screens, sample persona "Ana"). Read this before designing or building anything user-facing.

## One-liner

**A quiet log of meals, water & movement.** Vita is a personal health assistant that records what the user tells it — by voice, text, tap or photo — and shows it back as clearly labeled estimates.

## Philosophy (non-negotiable)

- **No goals, no scores, no streaks, no advice.** Vita never sets targets, grades a day, or tells the user what to do. Copy stays factual.
- **Estimates are labeled as estimates.** Every AI-derived number carries an "estimate" tag.
- **Dual input everywhere.** Every tappable answer can be spoken or typed, and vice versa.
- **Privacy first.** Vita reads only what the user approves. The log belongs to the user; exports are files the user chooses to share. Sign-in consent screen states: "Vita receives your name and email — nothing else."
- **Calm.** Earthy/cream palette, soft animations, quiet tone. Vacation mode makes the whole app calmer, not louder.

## Core interaction: capture

An always-present capture bar (text field + camera + mic). Two chrome variants exist in the prototype (v1 bar, v2 pill with hold-to-talk and Today/Trends/Habits shortcuts).

Flow: user speaks/types "Had a banana and a handful of peanuts around 4" → live transcription → "Making sense of it…" (AI parse) → a confirmation card with title, time, kcal estimate, macros, micros → **Confirm** or **Adjust**. Nothing enters the log without user confirmation.

Photo capture: a photo of a plate or a gym whiteboard → recognized items with quantity steppers (remove item / discard all) → confirm adds a meal or a workout routine.

## Screen inventory (from the prototype)

1. **Sign in** — passwordless: Continue with Google/Apple (with a consent step), or email magic link ("No passwords — ever").
2. **Onboarding (6 steps)** — name & units (metric/imperial); what to keep an eye on (meals, water, workouts, habits, cycle — "just your own reference"); eating plan (describe it / paste or import a nutritionist PDF / not now → AI reads back a plan summary for confirmation); training program (describe / import from gym app / none → summary confirmation); connect apps; all set (recap + first capture prompt). Every step answerable by voice.
3. **Home / Today** — greeting, kcal logged today (estimates), expandable Water card (log list + quick add), Macros card (protein/carbs/fat bars), expandable Energy card (consumed vs spent via health source, 7-day in/out pairs), Eating plan row, cycle chip (via integration), check-ins banner ("2 waiting"), timeline of the day (meal/water/workout cards with organic wave illustrations).
4. **Meal detail** — the original phrase quoted ("logged by voice"), item breakdown ("how the estimate was built"), macro donut, micronutrients vs daily reference, "Estimated by Vita from your description."
5. **Workout detail** — source badge ("Imported from Garmin"), interactive front/back body map with highlighted muscles (tap muscle or chip → related exercises), exercises as imported, 30-day history (tap → preview bottom sheet).
6. **Habits** — Today tab: yes/no check-in cards (habit check-in, plan check-in "Did lunch follow your plan?" — Yes logs the plan's lunch automatically, "Not quite" opens capture to tell what changed), plan digest card (12:30 notification preview). Manage tab: habit list with 14-day dots, day-of-week chips, time, enable toggle, remove; new habit form (simple / linked-to-plan types). "A single yes or no per check-in — no streaks, no scores."
7. **Lock screen** — check-in notification answerable directly (Yes/No).
8. **Integrations** — Strava, Garmin, Flo, Apple Health, Google Fit, gym app; per-source toggle, "Vita reads only what you approve."
9. **Account** — expandable profile (name, units — "changes apply everywhere, right away"), Your setup (eating plan, training program, integrations, habits), notification toggles, Vacation mode, "Share your log" → Export, sign out.
10. **Eating plan** — imported plan ("via nutritionist PDF"), daily kcal + macro bars + micro chips, meal cards (breakfast/lunch/snack/dinner) with per-item portions; tap item → portion slider popup, totals update live.
11. **Trends** — periods W/F/M; Food tab: calories (bars ↔ 30-day curve), consumed vs spent, macro balance (stacked), water, meal times (dot plot). Activity tab: muscles-worked heatmap on body silhouettes with ranked chips, aerobic minutes, workout squares (tap → session list → preview sheet). All charts scrubbable by drag ("drag the chart to read each day"). Vacation days can be hidden from trends.
12. **Sheets/popups** — muscle exercises sheet, workout preview sheet, photo capture, vacation mode setup (dates, which notifications to keep, add a trip-only habit by voice), export sheet, macros popup, portion adjust, check-in stack (swipe down to dismiss, cards advance).
13. **Vacation mode** — date range; unticked notifications pause; optional trip habits; the whole app shifts to a calmer sea-tone accent; banner on Home; trends can hide those days.
14. **Export** — "a PDF shaped for whoever reads it": per-audience options (e.g. nutritionist, doctor) with included-content chips, "last 30 days · estimates marked as estimates", "nothing is shared until you send the file."

## Data model (as evidenced by the prototype)

- **Log entries**: meals (items with kcal each, macros P/C/F, micros with % daily reference, source phrase, input method), water (amount, method), workouts (title, duration, kcal estimate, muscles, exercises with sets/reps/load, source).
- **Eating plan**: meals with items, per-item quantity/unit/nutrition-per-unit, plan kcal/macros; imported from PDF/text with AI summary.
- **Training program**: split description, source.
- **Habits**: name, schedule (days + time), enabled, 14-day history dots, optional link to a plan meal; check-ins are single yes/no.
- **Integrations**: per-source connection state + last sync.
- **User**: name, units, connected sources, notification prefs, vacation state.

## Product AI responsibilities (backend)

- Natural-language meal/water/workout parsing → structured entries with nutritional estimates.
- Photo recognition: plate → food items; whiteboard → workout routine.
- Eating plan / training program import: PDF or free text → structured plan + human-readable summary for user confirmation.
- Everything returned as estimates, never advice.

## Founding scope decisions (CEO)

- Ship the **complete product** to production (teams slice into waves internally).
- **v1 integrations**: Apple Health + Health Connect only. Garmin, Strava, Flo, gym apps: v2.
- Backend: Kotlin. Infra: AWS + Terraform. App stack: proposed by the app team (criteria: fluidity, animation fidelity, future-proof).

## Design tokens (from the prototype)

- Background `#EDE5D6` / surface `#F7F2E9` / card `#FFFDF7`; ink `#4A4238`; muted `#8A7E70`.
- Accent (theme-able): `#C4704E` default; options `#8CA58A`, `#C98A3F`, `#D6926B`; vacation mode accent `#3E8FA3`.
- Greens `#7A9377 #8CA58A #AABB9B`; sun `#F2B45C`; macro colors: protein `#8CA58A`, carbs `#C98A3F`, fat `#E0A375`.
- Typeface: Nunito (200–800). Rounded corners throughout, organic blob/wave SVG illustrations, soft entrance animations.

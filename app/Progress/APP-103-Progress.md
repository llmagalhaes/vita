# APP-103 — Library panel

**Implements** `docs/v4/README.md` §4 screen 5 + prototype lines 716–866 · `docs/v4/app-plan.md` APP-103.
**Binding CEO decisions honoured:** Q3 (iOS Connected-sources hidden entirely) · Q5 (delete keeps the
server 7-day grace) · Q7 (vacation semantics made real).

## What shipped

Seven sections composed by `src/library/LibraryPanel.tsx`, in the ticket's order:

| # | Section | File | Notes |
|---|---|---|---|
| 1 | What Vita keeps | `sections/Keeps.tsx` | 5 toggles → `db/domains.ts` (APP-095), green/sand switch, "Off hides it everywhere — history stays, nothing is deleted." |
| 2 | Eating plan | `sections/EatingPlan.tsx` | expandable meal list, `+ Add a meal` (name/time/~kcal → 1-item meal in the plan doc, **with Undo**), `Replace — new PDF` → the existing `/plan-setup?mode=parse` flow |
| 3 | Training programs | `sections/Programs.tsx` | program days + the existing `ImportProgramSheet` (no second importer) |
| 4 | Habits | `sections/Habits.tsx` | add form (name · time · **7 Mon-first weekday circles**), per-habit notification switch, remove **with Undo** — `"{name}" removed — history stays` |
| 5 | Connected sources | `sections/Sources.tsx` | the ONE Health Connect row (`Connected · weight & workouts flow in` / `Off — nothing is read`); **returns null on iOS** |
| 6 | Away & sharing | `sections/AwaySharing.tsx` | vacation row (Set up / End-with-confirm) + export row |
| 7 | Account | `sections/Account.tsx` | avatar `linear-gradient(135deg,#E8B48C,accent)` + initial, name, email, Sign out, danger Delete my data |

Panel footer: `Your log stays on this device — exports are files you choose to share.`
Sections 2–4 gate on the composition flags, exactly like the Day.

## Vacation semantics are now real (CEO Q7)

`src/db/vacation.ts` rewritten around a **duration**, not two typed dates:

- `startVacation("thisWeek")` writes a 7-day range → **expiry is structural**. No timer, no sweep job,
  no stale "on" flag: day 7 is still the trip, day 8 is not, because `isVacationActive` only ever asks
  whether today is inside a stored range.
- `startVacation("untilEnded")` writes `end: "9999-12-31"`; only `endVacation()` closes it.
- `keepCheckins` → **`keepWater`**, and it means something now. `vacationKeepsWater()` is exported for
  the Day's water card (APP-097 consumes it), and the notifier keeps the water reminder alive while
  every other reminder pauses.
- `tripHabitIds` and the trip-habit UI are **gone** — the v4 prototype sheet has no such control.

`src/habits/notifier.ts` (one surgical edit, forced by the rename): `notificationsPaused()` is now
`!enabled || onVacation` ("everything else pauses"), and a new `scheduledHabits()` filters to the water
habit on a keep-water trip. The water habit is matched by name (`/water|hydrat/i`) — marked
`ponytail:` with the upgrade path (give `Habit` a `kind: "water"`) since a name is the only water signal
a Habit carries today.

## Delete my data (CEO Q5)

`DELETE /account` (added to the api client + mock — the contract had it, the app never called it) starts
the server's 7-day grace; signing in inside the window cancels it. Then the device is wiped
(`entries · outbox · pending_parse · day_record · habits · kv` — kv last, because it holds `onboarded`,
so the app lands back on onboarding) and the session is cleared. The server call is best-effort: a failed
call must not strand the user with data they asked to be gone. Confirm is the CEO's 3-button
**Keep it / Export first / Delete**.

## Files

**New**
- `src/library/parts.tsx` — SectionLabel · ListCard · ListRow · CardNote · IconWell · PillButton · FormInput · `tinted()`
- `src/library/sections/{Keeps,EatingPlan,Programs,Habits,Sources,AwaySharing,Account}.tsx`
- `src/library/__tests__/library-panel.test.tsx`

**Rewritten**
- `src/library/LibraryPanel.tsx` (was the APP-096 placeholder — ownership taken)
- `src/db/vacation.ts` · `src/vacation/VacationSheet.tsx` (duration chips + keep-water)
- `src/export/ExportSheet.tsx` (3 recipient chips + the v4 notes; **the real `expo-print` PDF stays** —
  the prototype only toasts)

**Touched**
- `src/habits/notifier.ts` — the `keepWater` rename + `scheduledHabits()`
- `src/api/client.ts` + `src/api/mock.ts` — `deleteAccount()`
- `src/ui/Toggle.tsx` — optional `offColor` + `size: "sm"` (the prototype's 38×23 habit-row switch)
- `src/ui/ConfirmSheet.tsx` — optional third action (`altLabel`/`onAlt`) for "Export first"
- `src/i18n/locales/en.json` — new `library.*` region; `vacation.*` reshaped to the v4 copy
- `src/db/__tests__/vacation.test.ts`, `src/__tests__/account.test.tsx` — call sites + 4 new tests

**Deleted**
- `src/vacation/__tests__/vacation-sheet.test.ts` — its only subject was `isValidDate`, and v4 has no
  date fields left to validate.

**Deferred to APP-108 (still referenced — deleting them would break the build)**
- `src/tabs/Integrations.tsx`, `app/(main)/integrations.tsx` — still reached from `src/tabs/Home.tsx:653`
  and `app/(main)/account.tsx:170`
- `src/tabs/Habits.tsx`, `app/(main)/habits.tsx` — still reached from `app/(main)/account.tsx:171`
- `app/(main)/account.tsx` itself — the v3 account screen the Library now supersedes
- `export.audience.doctor` / `export.audienceSub.doctor` in en.json and the `doctor` entry in
  `src/export/pdf.ts` `AUDIENCES` — unused by the v4 sheet, left rather than churn `pdf.test.ts`

## Gates

- `npx tsc --noEmit` — **clean for every APP-103 file**. One pre-existing error remains in another
  builder's in-flight file: `src/day/__tests__/overview.test.tsx(133,9): Cannot find name 'waitFor'`.
- `npx jest src/library src/vacation src/export src/db/__tests__ src/habits src/ui src/__tests__/account.test.tsx`
  → **23 suites / 146 tests, all green** (+7 new library tests, +4 new vacation tests, −2 deleted
  date-validation tests).
- Full suite: 63/66 suites green. The 3 failures are all outside this ticket and untouched by it —
  `src/day/__tests__/overview.test.tsx` (weight modal, APP-097), `src/__tests__/voice-capture.test.tsx`
  (APP-104), `src/nav/__tests__/panelShell.test.tsx` (the Day panel's title, not the Library's).

## Deviations from the ticket

1. **One extra file**, `src/library/parts.tsx` — seven sections sharing one eyebrow/card/row/pill
   vocabulary instead of seven copies of it.
2. **Export sheet drops the per-section chips.** The v4 prototype has recipient → note → button and
   nothing else; the recipient IS the shape, so the audience's own section set is used. `AUDIENCES`
   in `pdf.ts` is untouched, so `pdf.test.ts` keeps passing.
3. **Vacation sheet drops the trip-habit list and the date fields** — neither exists in the v4 prototype.
4. **The plan card shows an honest empty state** when no plan exists (the prototype always has one):
   the sub-line says so and the second button reads "Import a PDF" instead of "Replace — new PDF".

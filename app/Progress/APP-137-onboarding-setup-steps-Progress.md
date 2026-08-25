# APP-137 — Onboarding: eating-plan + training setup steps (PDF / build / skip)

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1217825362197618
Model: Opus · session 25

## Ask (CEO)

Onboarding gains two steps right after the existing ones: (1) eating-plan setup,
(2) training setup — each offering the same three-way choice the Library entry
points offer, plus an explicit skip. *"Será possível subir manualmente ou por PDF
também, por isso, escreva e desenha essas telas reaproveitando as que acabamos de
fazer"* — reuse the v4.2 pieces, do not invent chrome.

## Shipped

### Flow

    name  →  what Vita keeps  →  [your eating plan]  →  [your training]  →  Open Vita →

The two setup steps are **derived, not constant**: the eating step only appears if
`domains.meals` is on, the training step only if `domains.move` is on. Turn both
off on step 2 and the flow is exactly the old two-step one. The progress bar and
`last` follow the derived list, so nothing about steps 1–2 or the `setOnboarded()`
write changed.

### Each setup step

- eyebrow (accent 13/700, same as "Welcome to Vita") + the 27/600 `Title` + a calm sub
- **two `SheetRow`s** — the exported row chrome from `src/library/EatingPlanSheet.tsx`
  (icon well 38×38, r20, hairline border; CEO Round 17 made it the canonical route row):
  - *Import a PDF* — `common.importPdf`, green well + `DownloadGlyph`
  - *Build it here* — `build.eatingSheet.here` / `build.trainingSheet.here`, amber well + `GlyphText "Aa"`
- **no "Add a single meal" row** — there is no plan to add it on top of yet (per the ask)
- a `faint` caption: *"You can do this anytime from the Library — nothing here has to happen today."*
- the CTA is the skip: quiet `variant="ghost"` **Skip for now**. The last step keeps
  **Open Vita →** either way — that IS its skip.

### Where each row goes (all EXISTING flows, none duplicated)

| row | goes to |
|---|---|
| eating · PDF | `importPdf()` → `router.push("/plan-setup?mode=parse&ob=1&fileRef=…")` — same call the Library's Eating Plan section makes, plus `ob=1` |
| eating · build | `router.push("/build-plan")` |
| training · PDF | `<ImportProgramSheet autoPdf />` — the sheet's own `runPdf` → `api.parseTrainingProgram` → confirm card → Save |
| training · build | `router.push("/build-program")` |

### Coming back

Both builders already end with `router.canGoBack() ? router.back() : router.replace("/day")`,
so pushed from onboarding they **pop back to it** — onboarding stays mounted underneath
and keeps the typed name and the domain flags. Untouched.

`plan-setup` did **not**: its finish and both error exits called `router.replace("/day")`,
which would have stranded the user mid-onboarding. It now takes `ob=1` and routes every
exit through one `exit()` (passed into `Review` as `onExit`), popping back when the flag
is set and replacing to the Day otherwise. One chokepoint, three call sites.

### Done state

`getCachedPlan()` / `getCachedProgram()` — no new tracking flag. When the thing exists the
rows collapse to a single green-dot line (`3 meals · saved`, `Upper / Lower · 2 days`, the
dot style the confirm cards already use), the skip caption disappears and the CTA becomes a
solid **Continue**. Cancelled instead? The choices are exactly as they were. Onboarding
subscribes to `useLogVersion()`, which every `savePlan`/`saveProgram`/`updatePlan` bumps, so
the step re-reads the moment a pushed flow writes.

### Copy

All new strings under `onboarding.plan.*`, `onboarding.program.*`, `onboarding.setup.*` in
`src/i18n/locales/en.json`, plural pairs (`done_one`/`done_other`) like the builders'.
`onboarding.welcome.note` was rewritten — it promised "Two steps" and that plans "come
later". Row subs are onboarding-specific ("from your nutritionist", "meal by meal, at your
own pace") rather than the Library's "replaces the plan you have now", which would be a
lie here.

## Files

| file | change |
|---|---|
| `src/onboarding/SetupSteps.tsx` | **new** — `EatingStep`, `TrainingStep`, `planDone`, `programDone`, `DoneLine` |
| `app/onboarding.tsx` | derived step list, the two setup bodies, skip/continue CTA, `ToastHost` |
| `src/workout/ImportProgramSheet.tsx` | `autoPdf` prop — opens on the PDF leg, cancel/failure closes instead of showing a chooser the caller already showed |
| `app/(main)/plan-setup.tsx` | `ob=1` → `exit()` / `onExit` on finish + both error exits + step-0 back |
| `src/i18n/locales/en.json` | `onboarding.setup/plan/program.*`, `welcome.note` rewritten |
| `src/__tests__/onboarding.test.tsx` | rewritten for the 4-step flow (+7 tests) |
| `src/workout/__tests__/import-program-sheet.test.tsx` | `autoPdf` cancel-closes (+1) |

## Gates

- `npx tsc --noEmit` → **0**
- `npx jest` → **608 passed / 1 skipped / 609 total** (baseline 600/1/601 → **+8**), green on 4 consecutive full runs
- the "worker process failed to exit gracefully" notice is **pre-existing** — it reproduces with both new suites excluded

## Notes / ceilings

- `// ponytail:` the onboarding pushes cross into the `(main)` group, so returning relies on
  `router.canGoBack()`. Verified by unit test at the call site (the push args) but **not on a
  device** — the emulator drive should confirm back from `/build-plan` lands on onboarding and
  not on the Day. `(main)/_layout` declares no `unstable_settings.initialRouteName`, so no
  anchor route should be inserted underneath.
- `ToastHost` is mounted on onboarding: the `(main)` shell's host is not up here, so a PDF
  import error would otherwise fail silently (the APP-061 / session-20 class of bug).
- Toasts fired by a builder's `finish()` are lost when it pops back to onboarding (the
  `(main)` host unmounts with it). The step's done line is the confirmation instead.
- Deviation from the ask: the row **subtitles** are onboarding-specific rather than verbatim
  ("replaces the plan you have now" is wrong when there is no plan). Titles are verbatim.
- No new deps, no native change, no prebuild.

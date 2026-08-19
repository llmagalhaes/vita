# APP-105 — Onboarding, 5 steps → 2

*Spec: `docs/v4/app-plan.md` APP-105 · `docs/v4/README.md` §4 screen 1 · prototype `Vita Prototype v4.dc.html` lines 55–92 (`obProg`/`ob0On`/`ob1On`/`obRows`/`obNext`), row copy from `domRows` line 1526.*

## What shipped

`app/onboarding.tsx` rebuilt from scratch: **name → what Vita keeps**, nothing else.

- **Step 1** — accent eyebrow `Welcome to Vita`, heading `What should we call you?`, one name field
  (placeholder + a11y label `Your name`), footnote `Two steps — that's the whole setup. Plans, programs
  and habits come later, when you need them.` CTA `Continue`, disabled until the name is non-blank.
- **Step 2** — `What should Vita keep?` / `Your day is built from exactly this — anything you skip won't
  appear anywhere.`, the five real composition rows (meals · water · move · habits · weight, every one
  default ON), footnote `Change this anytime in the Library — turning something off hides it, it never
  deletes history.` CTA `Open Vita →` + a back button.
- **`Open Vita →`** writes `{ name, domains }` in one `saveSettings`, `setOnboarded()`, fire-and-forget
  `api.patchMe({ name })`, then `router.replace("/day")` (the shell moved from `/home` to the Day panel).

Deleted with the rebuild: the plan step, the program step, the all-set recap, the PDF-import composition
helper (`runPdfImport`), the blob illustration, the "Step N of M" label, the v3 `keepTrack` chips and the
transitional `keepTrack → domains` shim in `finish()`.

## Fidelity notes (values lifted from the prototype)

| Element | Value |
|---|---|
| Screen padding | `70px 26px 30px` |
| Progress | 2 segments, gap 5, h 4, r 2 — done `#8CA58A` · current accent · upcoming `rgba(74,66,56,.13)` (`colors.progressUpcoming`) |
| Headings | 27 / semiBold, line-height 1.22 (33), letter-spacing −0.2; step 1 `marginTop:-8` |
| Name input | border 1px `rgba(120,100,75,.16)`, bg `#FFFDF7`, r 18, pad 16×18, 17 / semiBold |
| Domain row | pad 13×15, r 20, border 1.5px — on `mixOklab(accent, 45%)`, off `rgba(120,100,75,.14)`; bg `#FFFDF7` |
| Checkbox | 24 px circle, 1.5px border, accent fill when on, 12×12 tick `M2.5 6.2 l2.6 2.6 L9.5 3.4` |
| Row type | name 15/700 `#453E35`, description 11.5 `#8A7E70` lh 1.4, `marginTop:1` |
| Motion | step `vtIn` = `FadeInUp` 350 ms; rows `vtFade` = `FadeIn` 400 ms, stagger `i × 70 ms` |

Row names come from `DOMAIN_NAMES` (`src/db/domains.ts`) — one source shared with the Library's
"What Vita keeps" rows. Only the onboarding-specific descriptions are new i18n strings.

## Files

- `app/onboarding.tsx` — rebuilt (302 → 215 lines).
- `src/i18n/locales/en.json` — `onboarding.*` restructured: added `continue`/`openVita`/`back`,
  `welcome.note`, `keep.{title,subtitle,note,desc.*}`; removed `stepLabel`, `keepTrack.*`, `allSet.*`.
  `plan` / `program` / `planShared` untouched — Today, `ImportProgramSheet` and `PlanStep` still read them.
- `src/__tests__/onboarding.test.tsx` — rewritten for the 2-step flow.
- `src/onboarding/PlanStep.tsx` — **unchanged**, just no longer mounted here (kept for the Library /
  empty-state plan entry).

## Gates

- `npx tsc --noEmit` → 0 errors.
- `npx jest src/__tests__/onboarding src/__tests__/account` → 2 suites, 4 tests, all green.
  (`account.test.tsx` needed no edit — it already asserts the v4 `domains` shape and never read the
  onboarding copy.)

## Deviations

1. **Back button** — reused `src/ui/BackButton` (42 px, card bg, SVG chevron) instead of the prototype's
   52 px transparent `←`; it is the app's single round back control.
2. **CTA height** — reused `src/ui/Button` (≈44 px, accent-tinted shadow) rather than a one-off 52 px CTA.
3. **`saveSettings` over `setDomains`** — `setDomains` goes through `patch()`, which no-ops when no
   settings row exists yet (fresh install), so the profile is written once with the flags inline.
4. **`runPdfImport` removed** — whoever wires `PlanStep` into the Library re-composes those ~7 lines
   (`importPdf()` → `parse({ fileRef })`); keeping it here as dead code would have been speculative.

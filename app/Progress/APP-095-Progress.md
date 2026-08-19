# APP-095 — Composition flags ("what Vita keeps")

Session 22 (v4 round, wave 0). Builder: Opus. Spec: `docs/v4/app-plan.md` §3 APP-095,
`docs/v4/README.md` §1/§4, prototype `Vita Prototype v4.dc.html` lines 1526 (`domRows`),
1612–1614 (`dom` gating), 1738–1739 (toggle + toast).

## What shipped

**`src/db/settings.ts`** — `keepTrack{meals,water,workouts,habits,cycle}` → `domains?: Domains`
with `Domains = {meals,water,move,habits,weight}`. `cycle` is gone (Flo row removed).
Old persisted profiles have no `domains` field, so they read back as all-on — the same
safe-ignore path APP-071 used for the dropped `units` pref; nothing migrates, nothing throws.
`patch()` is now exported (`patchSettings` equivalent) so `domains.ts` writes through the one
persist+`logChanged` path instead of a second one.

**`src/db/domains.ts`** (new) —
- `DOMAIN_NAMES` / `DOMAIN_KEYS` (prototype `domRows` names).
- `getDomains()`: per-key default **on** (`d?.[k] !== false`), unknown/legacy keys dropped.
- `derive(d)` / `domainState()` / `useDomains()`: the flags plus the three predicates
  `rowWM = water||meals`, `ovOn = water||habits||weight||meals`, `tlOn = meals||move`.
  The hook rides the existing `useLogVersion()` signal — no second store.
- `setDomains(partial)` (bulk, silent — onboarding step 2), `setDomain(key, on)` +
  `toggleDomain(key)` (Library rows), which fire the prototype toasts through the existing
  `src/ui/toast.ts`: `"{name} hidden — history stays"` / `"{name} is back"`. Writes flip a
  boolean and nothing else — no delete path exists in this module.

Sync-readiness (Round-14 / APP-110): the flags are one plain serializable object under a single
kv key. A sync layer wraps `getDomains`/`setDomains`; no reshaping needed.

**`src/db/__tests__/domains.test.ts`** (new, 7 tests) — defaults (with and without a settings
row), pre-v4 `keepTrack`+`cycle` blob ignored, partial blob defaults the missing keys on, the
three predicates at every single-flag combination, the consumer-list snapshot, toggle
copy + persistence + "history stays" (unrelated kv data untouched), silent bulk write.

**`src/db/__tests__/settings.test.ts`** — fixture only: `base` drops `keepTrack`.

## Gates

- `npx jest src/db/__tests__/domains.test.ts src/db/__tests__/settings.test.ts` → **11/11 pass**
  (+7 net new tests).
- `npx jest src/__tests__/onboarding.test.tsx src/__tests__/account.test.tsx
  src/health/__tests__/healthConnect.test.ts` → **15/15 pass** (runtime unaffected: the old
  onboarding still writes `keepTrack`, which is now simply an unread extra field).
- `npx tsc --noEmit` → **0 errors in the files I own**. Remaining errors are in other tickets'
  files (listed below), all a direct consequence of the type rename this ticket mandates.

## Cross-ownership tsc failures (NOT mine to fix)

| File | Errors | Owner | Fix |
|---|---|---|---|
| `app/onboarding.tsx` | 7 (43, 52, 81 `keepTrack`; 103/209/211/213 cascade from the lost key type) | **APP-105** (rebuilds this file, 5 steps → 2) | rebuild writes `domains` via `setDomains()` |
| `src/__tests__/onboarding.test.tsx` | 1 (line 65) | APP-105 | assert `s.domains` |
| `src/__tests__/account.test.tsx` | 1 (line 17) | APP-105/account ticket | drop `keepTrack` from the fixture |
| `src/health/__tests__/healthConnect.test.ts` | 1 (line 23) | APP-107 | drop `keepTrack` from the fixture |
| `src/ui/__tests__/oklab.test.ts` | 2 (`sandChip` missing) | concurrent tokens/oklab builder | unrelated to APP-095 |

## Deviations / notes

- Toast + row names are English literals, not `t()` keys: `src/i18n/locales/en.json` is outside
  my file scope and the round's i18n sweep (app-plan) moves every string at once. Marked with a
  `ponytail:` comment in `domains.ts`.
- `Domains` type lives in `settings.ts` (it is the persisted shape) to keep `settings.ts` →
  `domains.ts` a one-way import; no cycle.
- `setDomains` inherits `patch()`'s semantics: it no-ops when no settings row exists yet
  (pre-onboarding). Onboarding commits its choices with `saveSettings({name, domains})`.

# App implementation spec — Meal Plan & Workout Plan fidelity (v0.6.0)

App-team spec for the CEO-approved architecture in `docs/meal-plan-handover/DESIGN-SPEC.md`
(BINDING — do not relitigate) against the design source of truth
`docs/meal-plan-handover/design_handoff_vita_v2 4/SPEC - Eating Plan & Training Program.md`
(all px/colors/formulas below are lifted from it; on any conflict the handoff wins for visuals,
DESIGN-SPEC wins for architecture). This is an EVOLUTION of the existing screens, not a rewrite.

Repo paths in this doc are relative to `app/services/vita-app/` unless rooted.

Tickets: APP-075..APP-081 on the Vita frontend board (`1216519867368576`). Dependency order:

```
backend contract v0.6.0 merged (docs/contracts/vita-api-v0.yaml)
  └─ APP-075 types regen + client + mock          (Sonnet)
       ├─ APP-076 portions overlay store + outbox (Opus 4.8)
       ├─ APP-077 pure math: totals/bars/micros/labels/tint (Sonnet)
       │    └─ APP-078 Eating Plan screen fidelity (Opus 4.8)
       │         └─ APP-079 Portion modal          (Opus 4.8)   [also needs APP-076]
       └─ APP-080 Workout detail muscle map        (Opus 4.8)
            └─ APP-081 Workout history + preview   (Opus 4.8)
```

---

## 0 · What exists today (read before building)

- `app/(main)/plan.tsx` — Eating Plan screen. Totals card is 42px `fonts.light` (handoff: 44px
  weight 200), macro bars normalize to `max(P,C,F)` with NO 10% headroom (bars hit 100%), micros
  chips are the static daily `micros` array (`name + percentDaily`), qty pill is tappable ONLY in
  edit mode, portion slider uses `portionRange()` and mutates the working doc (full-doc PUT on
  Save). Edit mode (add/remove meals/items, rename) is a shipped feature and STAYS.
- `src/plan/compute.ts` — pure `itemTotals/mealTotals/planDailyTotals` (macros only, no micros),
  `portionRange()` fallback bounds.
- `src/db/plan.ts` — kv-cached doc, dirty-flag hydrate protection (audit 1.4). Pattern to follow.
- `src/db/outbox.ts` — ordered drain, `create|update|interpret` ops, poison taxonomy, backoff.
- `src/ui/PopOverlay.tsx` — THE centered pop chrome (vtPop, blurred backdrop). Portion modal
  already rides it; it stays the chrome.
- `app/(main)/workout/[id].tsx` — muscle map flat opacity 1 per workout-level muscle, info banner
  on `estimateBg`, exercise-row highlight via `entryPalette.workout.badgeBg` (green — wrong per
  handoff: accent-9%), horizontal 30-day history strip (handoff: vertical rows).
- `src/ui/BodyMap.tsx` — front/back SVG, `resolveHighlights` remaps intensity → `0.25+i*0.65`.
- `src/workout/muscleExercises.ts` — first-listed-muscle = primary heuristic (superseded by
  `muscleRoles` when present; kept as fallback for old entries).
- `src/workout/PreviewSheet.tsx` — rides `SheetOverlay`; needs value tuning only.
- `src/health/healthConnect.ts` — HC reader seam; today reads only counts (no session list).
- `src/api/{client,mock,types.gen}.ts` — `api:gen`/`api:check` scripts regenerate from
  `docs/contracts/vita-api-v0.yaml`.

Fragile paths (session-13/14 lessons — respect, do not touch):
- TabsPager pan gesture + `pagerRef`; never setState mid-gesture.
- Mount tweens start from `onLayout` (`useStartOnLayout`), never bare `useEffect`.
- `"worklet"` directives on pure helpers used inside `useAnimatedStyle`.

---

## 1 · Contract v0.6.0 consumption (APP-075)

Backend owns the contract change (all additive; see DESIGN-SPEC "Contract v0.6.0"):

- `PlanItem.id?: string` — stable server-generated per saved plan version. Overlay key.
- `PlanItem.microsPerUnit?: { fiberG?: number; sodiumMg?: number; ironMg?: number; calciumMg?: number }`
  — typed object, NOT an extension of `MacroTotals`.
- `PlanItem.portion?: { min: number; max: number; step: number }` — backend deterministic bounds.
- `GET /plan` response gains OPTIONAL top-level `portions?: { [itemId: string]: number }`
  (additive on `EatingPlanDraft` as used by GET /plan only; parse responses and history versions
  never carry it).
- `PUT /plan/portions` — body is the BARE sparse map `{ [itemId]: number }` (e.g. `{"it-3": 3}`),
  no wrapper — matches backend-spec §1.4/BE-036; replaces the whole map.
  Idempotent. 422 on unknown itemId. (Exact request/response shape: whatever the merged contract
  says — regen, don't hand-type.)
- `Exercise.muscleRoles?: Array<{ name: Muscle; role: "primary" | "secondary" }>` alongside the
  existing `muscles: string[]`.

App work:

1. `npm run api:gen` after the backend merges the contract → `src/api/types.gen.ts`; `api:check`
   clean; `tsc` 0.
2. `src/api/client.ts`: add `putPlanPortions(portions: Record<string, number>): Promise<void>`
   (PUT `/plan/portions`); `getPlan()` return type now carries the optional `portions` map —
   thread it through (see §2 for who consumes it). No behavior change elsewhere.
3. `src/api/mock.ts`: seed the mock plan with the handoff §1.2 reference data converted to
   contract shape (11 items, 4 meals, ids `eggs|bread|latte|chicken|rice|salad|yog|gran|salmon|veg|spot`,
   `per.k→nutritionPerUnit.kcal, P→proteinG, C→carbsG, F→fatG`,
   `fb→microsPerUnit.fiberG, na→sodiumMg, fe→ironMg, ca→calciumMg`,
   `min/max/step→portion`). Mock `getPlan` returns `{...doc, portions: storedPortions}`;
   mock `putPlanPortions` stores the map; mock `createPlan` resets `storedPortions = {}`
   (mirrors the server's reset-on-new-version). Mock parse (`mockParsePlan`) items gain
   `microsPerUnit` + `portion` but NO `id` (parse drafts are pre-save → no server ids), so the
   old-doc fallback path (§3.4) is exercisable in mock.
4. Mock workout data: give the seeded "Leg day" exercises `muscleRoles` per handoff §2.2
   (`Back squat: [{quads,primary},{glutes,primary},{core,secondary}]` etc. — copy the `muscles`
   table in handoff §2.2 faithfully).

---

## 2 · Portions overlay state + persistence (APP-076)

### 2.1 Storage

kv (SQLite `kv` table — same store as the plan doc; no new table):

- `plan.portions` → `Record<string, number>` — the sparse overlay. Missing key = item default qty.
- Reuse the existing kv dirty helpers with key `plan.portions` (`isDirty/setDirty/clearDirty`)
  for the hydrate-protection rule (§2.3).

New module functions in `src/db/plan.ts` (keep it one file — this IS plan persistence):

```ts
export const getPortions = (): Record<string, number> => kvGet(PORTIONS_KEY) ?? {};
export function setPortion(itemId: string, qty: number): void
  // write map to kv (delete key when qty === item default? NO — keep whatever the modal wrote;
  // the modal only writes when the value differs from the CURRENT map value; see §5)
  // setDirty(PORTIONS_KEY); enqueuePortionsPush();
export function clearPortions(): void  // kv delete + clearDirty; called on new plan version
```

Sparse rule: `setPortion` REMOVES the key when `qty` equals the item's default `quantity`
(slider returned to default = no override — matches the design's `planQty[it.id] ?? it.qty`
fallback and keeps the map genuinely sparse).

### 2.2 Outbox op `portions` — coalescing by design

The op carries NO payload. `entryId` is the fixed sentinel string `"plan.portions"`.

- **Enqueue** (`enqueuePortionsPush` in `src/db/plan.ts` or `entries.ts` beside the other
  enqueues): `INSERT INTO outbox (entryId, op) SELECT 'plan.portions', 'portions' WHERE NOT
  EXISTS (SELECT 1 FROM outbox WHERE op = 'portions')` — at most ONE portions row ever queued.
  Many slider sessions → one op. Last map wins automatically because…
- **Drain** (`src/db/outbox.ts`, new branch beside `interpret`): read the map fresh at send time
  — `await api.putPlanPortions(getPortions())` — then `clearDirty(PORTIONS_KEY)` and delete the
  row. The payload is whatever the map says at drain time, not at enqueue time.
- Trigger a drain attempt right after enqueue when online (same fire-and-forget the entry path
  uses); offline it just sits until the reconnect drain.

### 2.3 Poison taxonomy for op `portions`

| status | meaning | action |
|---|---|---|
| 401 | session expired mid-drain | back off (existing global behavior — refresh interceptor retries) |
| 403 | forbidden | poison: drop op, `clearDirty` (nothing to re-push) |
| 404 | no plan on server | poison: drop op (portions can't exist without a plan; local overlay kept for display) |
| 422 | unknown itemId — local overlay references a stale plan version | poison: drop op, then `void syncPlan()` to re-hydrate doc + server portions (which prunes the stale keys per §2.4) |
| 400/409 | malformed / conflict | poison: drop op |
| network/5xx | transient | back off, stop the drain (ordered, existing behavior) |

Implement by extending `isPoison(err, op)`: for `op === "portions"`, 403/404/422/400/409 are
poison. The 422 → resync side effect lives in the drain's poison branch (like `interpret`'s
`deletePending`).

### 2.4 Hydrate / merge rules (`syncPlan` in `src/db/plan.ts`)

`GET /plan` now returns `portions` alongside the doc. Rules, in order:

1. Doc dirty → existing behavior (re-push doc, skip hydrate) unchanged.
2. Portions dirty (an unpushed local override exists) → hydrate the DOC but KEEP the local
   portions map (local wins; it re-pushes via the queued op). Never merge per-key — the op is
   full-map last-write-wins, so partial merges would invent states neither side wrote.
3. Both clean → `kvSet(PLAN_KEY, doc)` and `kvSet(PORTIONS_KEY, response.portions ?? {})`.
4. After ANY doc write, prune: drop overlay keys whose itemId no longer appears in the doc
   (defensive; stale keys are also harmless at read time because display always goes through
   `qtyOf` which falls back to the item default).

### 2.5 Reset on new version

- `savePlan()` (POST /plan — new import) → `clearPortions()` locally; server resets its overlay
  (DESIGN-SPEC). One line after the kvSet.
- `updatePlan()` (PUT /plan — edit current, NOT a new version) → do NOT clear; prune per §2.4.

### 2.6 Offline-first invariants (test these)

- Slider tick → kv write is synchronous → screen re-render reads the new map. No network on the
  interaction path, ever.
- Kill the app mid-session → overlay survives (kv is SQLite).
- N portion edits offline → exactly 1 outbox row → reconnect → exactly 1 `PUT /plan/portions`
  with the final map.
- 422 poison → op dropped, resync scheduled, drain continues to later items (no stall).

---

## 3 · Pure math (APP-077) — `src/plan/compute.ts` evolution

All formulas verbatim from handoff §1.3. Everything below is pure + unit-tested.

### 3.1 Overlay-aware quantity

```ts
export const qtyOf = (item: PlanItem, portions: Record<string, number>): number =>
  (item.id != null ? portions[item.id] : undefined) ?? item.quantity ?? 1;
```

`itemTotals(item, qty?)` gains an optional explicit qty (default `item.quantity ?? 1` — existing
callers unchanged). `mealTotals(meal, portions = {})` / `planDailyTotals(plan, portions = {})`
thread it through. Existing call sites that must pass the live overlay: `app/(main)/plan.tsx`,
the portion modal, `src/tabs/Home.tsx` line ~706 (plan row kcal). Call sites that deliberately
keep DOC DEFAULTS (the plan as prescribed, not as adjusted): `src/habits/digest.ts`,
`src/habits/checkins.ts`, `src/tabs/Habits.tsx` meal rows — a check-in logs the planned meal;
portion adjustments are a read-time lens. (ponytail: one lens, no fork of the data.)

### 3.2 Micros totals

```ts
export type MicroTotals = { fiberG: number; sodiumMg: number; ironMg: number; calciumMg: number };
export function planMicroTotals(plan, portions = {}): MicroTotals | null
// null when ANY item lacks microsPerUnit → caller falls back to the static daily
// `plan.micros` array. All-or-nothing: never show a live sum that silently
// undercounts items missing data (honesty rule).
// else: sum microsPerUnit.X * qtyOf(item, portions) over every item.
```

Chip label formatting (exact, handoff §1.3):

- `Fiber {tFb.toFixed(1)} g` · `Sodium {Math.round(tNa)} mg` · `Iron {tFe.toFixed(1)} mg` ·
  `Calcium {Math.round(tCa)} mg` — fixed order, all four always shown when live.

### 3.3 Macro bar percentage — the headroom formula

```ts
export function barPct(g: number, tP: number, tC: number, tF: number): number {
  const pMax = Math.max(tP, tC, tF) * 1.1 || 1;  // 10% headroom — a bar NEVER hits 100%
  return Math.round((g / pMax) * 100);
}
// bar label: `${Math.round(g)} g`
```

### 3.4 Quantity label

```ts
// Same normalization + word sets as backend-spec §3.1 — an item parsed with unit "grams"
// must label as a measured "90 g", not "90 × grams", or the label contradicts its
// step-10 slider.
const G_UNITS = new Set(["g", "gram", "grams"]);
const ML_UNITS = new Set(["ml", "milliliter", "milliliters", "millilitre", "millilitres"]);
const norm = (u?: string) => (u ?? "").trim().toLowerCase();
export const qtyLabel = (unit: string | undefined, q: number): string =>
  G_UNITS.has(norm(unit)) ? `${q} g` :
  ML_UNITS.has(norm(unit)) ? `${q} ml` : `${q} × ${unit || "unit"}`;
// "180 g" · "200 ml" · "2 × egg" · "1 × slice"
```

(Replaces plan.tsx's local `${qty} ${unit}`. Keep the word sets in lockstep with backend §3.1
if they ever grow.)

### 3.5 kcal display

```ts
export const kcalLabel = (tK: number): string => "~" + Math.round(tK).toLocaleString("en-US");
// e.g. "~1,756" over the §1.2 fixture — the `~` is the estimate marker, mandatory (philosophy).
// per-meal: `~${Math.round(mk)} kcal` · per-item: `~${Math.round(per.kcal * q)}`
```

### 3.6 Portion bounds

```ts
export const boundsOf = (item: PlanItem): { min: number; max: number; step: number } =>
  item.portion ?? portionRange(item.quantity);  // server heuristic, app fallback for old docs
```

`portionRange` stays exactly as is.

### 3.7 Accent tint helper — the `color-mix` equivalent

New in `src/ui/tokens.ts` (or `accent.ts`):

```ts
/** color-mix(in oklab, accent N%, #FFFDF7) equivalent. sRGB lerp — at N ≤ 35% the
 *  delta vs oklab is < 2 RGB steps on this palette; ponytail: revisit only if the
 *  CEO's device pass flags a tint. */
export function tint(accent: string, pct: number, base = "#FFFDF7"): string
```

Per-channel: `round(accentCh * pct/100 + baseCh * (1 - pct/100))`, hex in/hex out.
N used by these screens: 8, 9, 10, 12, 13, 14, 25, 35 (handoff §3). NEVER hardcode the tints —
always `tint(useAccent(), N)` so vacation mode (`accent.ts`) swaps everything at once.
Sweep the two screens' existing hardcodes (`rgba(196,112,78,0.12)` qty pill,
`rgba(196,112,78,0.3)` banner border, `entryPalette.workout.badgeBg` row highlight) onto it.

Unit tests: `tint("#C4704E", 100) === "#C4704E"`, `tint(x, 0) === "#FFFDF7"`, a known midpoint,
and every formula above against the handoff reference data (defaults → `~1,756` kcal — the
handoff PROSE claims "~1,880" but its own §1.2 item table sums to **1,756.2**; the table is
binding per backend-spec.md D-9/§7, whose eval fixtures pin the same 1,756.2 — e.g. protein
bar = round(145.4 / (154.2 × 1.1) × 100) = 86% over that fixture (P=145.4 C=154.2 F=56.7,
pMax=169.6) — compute the fixtures from §1.2 in the test, don't hand-copy magic numbers).

---

## 4 · Eating Plan screen delta (APP-078) — `app/(main)/plan.tsx`

Element-by-element vs handoff §1.1. Column gap 13 (already). Everything reads
`portions = getPortions()` re-fetched on `useLogVersion()` bumps + a local bump after each
`setPortion` (add a `logChanged()` call in `setPortion` — the existing notify seam).

1. **Header row** — keep `EditHeader` (back + eyebrow + Edit affordance; deviation from the
   handoff recorded as CEO Q2). ADD the right-aligned source badge: text per source kind,
   9.5px/800, ls .8, uppercase, bg `colors.estimateBg` `#F7E7D4`, ink `colors.estimateInk`
   `#A66A3F`, radius 8, padding 3px 7px. Source kind: new kv key `plan.meta` written at import
   time (`{ source: "pdf" | "text" | "manual", importedAt: ISO }`) — set in
   `src/onboarding/planImport.ts` / PlanStep confirm / manual editor save. Labels (i18n):
   pdf → "via nutritionist PDF", text → "via description", manual → "your own entry".
   ponytail: local-only metadata; a plan imported on another device shows no badge (ceiling:
   move into the doc if multi-device ever matters).
2. **Title block** — `view.summary` 24px/700 (today 22). Below: meta line 13px `colors.muted`
   `"imported {Mon D} · your own reference · estimates"` from `plan.meta.importedAt`
   (omit the "imported …" segment when meta is absent).
3. **Totals card** (`Card`, gap 12, `vtFade` = `entering={FadeInUp.duration(450)}`):
   - kcal line: `kcalLabel(tK)` at **fontSize 44, `fonts.extraLight` (Nunito 200),
     letterSpacing −1.2, lineHeight 44**; beside it, baseline-aligned gap 8:
     "kcal planned per day" 13px `colors.muted`. Keep the `EstimateTag` — the `~` plus the
     existing tag both mark the estimate.
   - **Macro bars ×3** (Protein/Carbs/Fat): label row 12.5px — name `fonts.bold` `#6E6355`,
     grams right `${Math.round(g)} g` `colors.muted`; track 7px radius 4 `colors.track`
     `#F0E9DA`; fill `width: barPct(g,…)%` (§3.3 — NEVER `g/max*100`), colors
     `colors.macro.protein #8CA58A / carbs #C98A3F / fat #E0A375`; animate width with
     `withTiming(…, { duration: 250 })` (prototype `transition: width .25s ease`) via
     the existing animated `Bar` if prop-compatible, else a 6-line local fill.
   - **Micros chip row** (wrap, gap 6, paddingTop 2): chips 11px/600 `#6E6355`, bg `#F0EDE2`,
     radius 12, padding 5px 10px. Content: `planMicroTotals(plan, portions)` labels per §3.2;
     `null` → fall back to the existing static `view.micros` rendering (name + percentDaily).
4. **Meal cards** (one per meal): padding `8px 18px 10px` (Card override), header row padding
   `10px 0 2px`: name 15px/700 + time 11.5px `colors.labelMuted` baseline gap 8; right
   `~{n} kcal` 12px/700 `colors.muted` — note the `~` (missing today). Item rows: full-width
   `Pressable`, padding `11px 0`, bottom border `rgba(120,100,75,.07)` (last row none),
   pressed opacity .6. Anatomy left→right gap 10:
   - dot 7px `#E8B48C` (exists)
   - name flex-1 14px/600 `#4A4238`
   - **qty pill — ALWAYS rendered and always tappable** (not edit-gated): label
     `qtyLabel(it.unit, qtyOf(it, portions))`, 11.5px/700, ink `useAccent()`,
     bg `tint(accent, 10)`, radius 11, padding 4px 9px
   - kcal `~{Math.round(per.kcal * q)}` 12.5px `colors.muted`, right-aligned, minWidth 44
   - Tap (row or pill) opens the Portion modal (§5) in BOTH view and edit mode. Edit-mode-only
     controls (×-remove, add item/meal, EditableText) unchanged.
5. **Footer hint** — copy change: "Tap an item to adjust portions — totals update as you drag."
   11.5px `colors.labelMuted`, centered, padding 0 16 (replaces `plan.tapHint` text).

Live update loop: slider tick → `setPortion` → kv + `logChanged()` → `useLogVersion` bump →
screen recomputes `planDailyTotals(view, getPortions())` → bars/chips/kcal animate. The modal
floats over the SAME screen state, so Card A (§5) and the screen behind it both update.
ponytail: JS-side setState per slider frame over 11 items is fine (the existing Slider already
does exactly this).

---

## 5 · Portion modal (APP-079) — on the existing `PopOverlay`

Replaces the current single-card modal content in `plan.tsx` (extract to
`src/plan/PortionPop.tsx` — plan.tsx is big enough). Opens on item tap from VIEW mode (new) and
edit mode (existing). `PopOverlay` chrome untouched (backdrop `rgba(247,242,233,.45)` + blur —
already prototype-exact per APP-063).

**Card A — live totals mini-card** (above the editor; enters with the pop):
`colors.card`, radius 22, padding `15px 17px`, `shadowPop`, border 1 `rgba(120,100,75,.08)`.
- kcal line: `kcalLabel(tK)` 26px `fonts.light` (300) ls −.5 + caption "kcal planned · updates
  live" 11.5px `colors.muted`.
- 3 compact macro bars: 52px-wide label (11px/700 `#6E6355`) + 6px track (same fills as §4) +
  38px right-aligned value (11px `colors.muted`), fill `withTiming 200ms`.
- Re-renders on every slider tick — it reads the same `portions` map. This is the visible payoff.

**Card B — editor** (50ms after Card A: `entering={...).delay(50)}`):
`colors.card`, radius 26, padding `19px 20px`, gap 13, `shadowPop` (0 20 50 .20), border 1.5
`tint(accent, 25)`.
- Header: item name 17px/700 + context `"{meal.name} · {meal.time}"` 11.5px `colors.muted`
  (time omitted when absent); right: `~{Math.round(per.kcal * q)}` 22px `fonts.light` +
  "kcal" 12px/600 `colors.muted`.
- Big qty readout, centered: `qtyLabel(unit, q)` 30px/600 ls −.5, color `useAccent()`.
- `Slider` (existing component) with `boundsOf(item)` (§3.6). Below it: min & max labels
  10.5px `colors.labelMuted` at the two ends of a spread row.
- Macro line, centered, `colors.surface` radius-12 pill, padding 8px 12px, 12px `#6E6355`:
  `P {n} g · C {n} g · F {n} g`, each `Math.round(per.X * q)`.
- **Numeric "exact" field kept** (dual-input philosophy — deviation from the slider-only
  handoff, CEO Q1). Same row style as today, clamped to `[min, max]`, quantized to `step`.
- **Done** button: height 46, radius 23, bg accent, ink `#FFF9F1`, 14.5px/700,
  `shadowCta(accent)`. `onPress` ONLY closes — no commit action.

**Commit semantics (BINDING — DESIGN-SPEC):** every slider/numeric change commits immediately:

- New-style item (`item.id` present): `setPortion(item.id, q)` → kv + enqueue coalesced op
  (§2.2). Closing the modal (Done, backdrop, back) does nothing further. There is NO
  cancel/revert — edits are already persistent, exactly like the prototype.
- **Old-doc fallback** (`item.id` absent — plans imported before v0.6.0, or parse drafts):
  portions are NOT persistable as an overlay. Honest behavior: the modal works identically
  in-session, writing `quantity` into the CACHED DOC (`mutate`-style clone → `kvSet(PLAN_KEY)`)
  and on modal CLOSE (once, not per tick) fires the existing `updatePlan(doc)` full-doc PUT
  (dirty-flag path — contract PUT edits current version, creates no new version, so the
  no-version-on-portion-change rule holds). Totals/chips work identically since they read the
  doc. No banner, no nag: the difference is invisible to the user; re-import upgrades the doc.
  **Accepted ceiling (bounds walk):** because the fallback writes `quantity` into the doc, the
  backend re-derives `portion.max = 2×qty` from the NEW quantity on the next read — lowering
  chicken 180 g → 90 g shrinks the post-hydrate slider range to 0..180. Within one modal
  session the app keeps the original `boundsOf(item)` (bounds captured on open, not per tick);
  the post-hydrate shrink is transition-window-only for legacy docs and re-import fixes it.
- Mixed docs (some items with ids): per-item decision by the same rule.

Edit-mode taps keep current behavior (mutating the working copy; Save does the doc PUT).

---

## 6 · Workout detail delta (APP-080) — `app/(main)/workout/[id].tsx` + `src/ui/BodyMap.tsx`

### 6.1 Per-muscle opacity from `muscleRoles`

New pure module additions in `src/workout/muscleExercises.ts`:

```ts
export type MuscleIntensity = { role: "primary" | "secondary"; opacity: number };
export function muscleIntensities(exercises: Exercise[]): Partial<Record<Muscle, MuscleIntensity>>
```

Rule (deterministic, testable — DESIGN-SPEC gives "≈" latitude; the handoff's §2.2 table is
hand-authored and not exactly derivable, this rule reproduces its primary tier and is monotone):

```
For each muscle m across the workout's exercises:
  roles(m)  = the set of roles m carries in muscleRoles across exercises
  role(m)   = "primary" if ANY exercise lists m as primary, else "secondary"
  count(m)  = number of exercises whose muscleRoles (or fallback muscles) include m
  opacity(m) = role primary:   count >= 3 → 0.92, else 0.78
               role secondary: count >= 2 → 0.62, else 0.30
Fallback when NO exercise carries muscleRoles:
  derive roles from the existing first-listed heuristic (exercisesForMuscle role), same table.
  When exercises are absent entirely (old flat entries): every workout-level muscle → 0.78
  (reads as "worked", no fake precision).
```

Selection model (verbatim handoff §2.2):

```
opacity(id, base) = sel ? (sel === id ? 1 : base * 0.3) : base
anim(id)          = sel === id ? breath : none
```

### 6.2 BodyMap changes (`src/ui/BodyMap.tsx`)

- New optional prop `absolute?: boolean` — when set, `highlighted` values are used as fill
  opacity AS-IS (no `0.25 + i*0.65` remap; muscles absent from the map render at the idle 0.14).
  Trends heatmap keeps the default remap — zero behavior change for existing callers.
- New optional prop `selected?: Muscle | null` — applies the `sel` dim/boost rule above inside
  `resolveHighlights` (pure, extend its signature + tests).
- **vtBreath** on the selected shape: scale 1→1.07→1, 1.5s, infinite
  (`withRepeat(withTiming(1.07, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true)`).
  RN-svg shapes can't take `transform-origin: center` per shape trivially — wrap ONLY the
  selected muscle's shapes in an `AnimatedG` with a computed center translate
  (`translate(cx,cy) scale(s) translate(-cx,-cy)`, center = shape bbox center, pure helper +
  unit test). Start the loop from `onLayout`/mount-of-selection, cancel on deselect
  (fragile-path rule: no tween from bare effect on cold boot).
- Opacity changes tween `withTiming 300ms` (prototype `transition: opacity .3s`). Memoize the
  Figure so `animatedProps` don't freeze (session-6 pitfall 3).
- **Auto-flip**: picking a muscle flips the view to the muscle's side — ONLY when the muscle has
  no shapes on the current side (shoulders/forearms/calves exist on both sides in this SVG —
  don't flip for those). Export `sideOf(m: Muscle, current: BodySide): BodySide` (pure):
  `bodyRegions(current)[m] ? current : otherSide`. Screen drives `side` as controlled state.

### 6.3 Screen wiring (`workout/[id].tsx`)

- `highlighted` = `muscleIntensities(...)` opacities; `absolute` + `selected` props; auto-flip on
  `setSelectedMuscle` via `sideOf`.
- **Info banner** restyle (keeps `popIn`): bg `tint(accent, 8)`, border 1 `tint(accent, 25)`,
  radius 16, padding `10px 14px`; muscle name 13.5px/700; **tag chip** "PRIMARY"/"SECONDARY"
  9.5px/800 ls .7 uppercase, accent ink (from `muscleIntensities(...)[m].role` — replaces
  `overallRole` when roles exist); exercises joined " · " 12px `colors.muted`.
- **Muscle chips** (existing `Chip`): selected state must be bg `tint(accent, 14)`, ink accent,
  border accent; idle bg `colors.surface`, ink `#6E6355`, border transparent — adjust `Chip` or
  pass style overrides; chip tap = same handler as shape tap (incl. auto-flip).
- **Exercise-row highlight**: replace `entryPalette.workout.badgeBg` with `tint(accent, 9)`
  (handoff `color-mix(… 9% …)`); lit index number ink accent; `transition: background .3s` →
  animate with `withTiming 300` or accept an instant swap (ponytail: instant is acceptable —
  note in PR; the dim 0.38 on non-hits stays).
- Hit resolution prefers `muscleRoles` (`ex.muscleRoles?.some(r => r.name === m)`), falls back
  to `ex.muscles` (existing `exercisesForMuscle`).
- Footer hint copy: "Tap a muscle or a chip — related exercises light up below." 11px centered.

Everything is on a stack screen (no pager interaction). No layout shift except the banner
(prototype rule) — banner mounts with `popIn`, no height animation needed.

### 6.4 Test plan (APP-080)

- `muscleIntensities`: handoff §2.2 fixture (Leg-day exercises with roles) → quads/glutes .92,
  hams .78 (primary tier reproduced); secondary tier per rule; fallback-no-roles path; empty
  exercises → flat .78.
- `resolveHighlights` absolute + selected: sel boosts to 1, others ×0.3; idle base pass-through.
- `sideOf`: quads front-stays-front, glutes flips front→back, calves never flips.
- Component test: tap chip → banner text + role tag rendered, row indexes lit.

---

## 7 · Workout history + preview tuning (APP-081)

### 7.1 History card — REAL sources only (DESIGN-SPEC decision 3)

Replace the horizontal strip in `workout/[id].tsx` with vertical rows per handoff §2.4:

- Card radius 24, padding `8px 18px 10px`. Header row padding `12px 0 4px`: "HISTORY"
  (SectionLabel) + right "last 30 days · as logged" 10.5px `colors.labelMuted` (copy: "as
  logged", not the handoff's "as imported" — our entries are logged, honesty rule).
- Row (Pressable, padding `10px 0`, bottom border, pressed opacity .6):
  - **date tile** 44×44 radius 14: day 15px/800 + month 9px/800 uppercase opacity .7.
    Today: bg `tint(accent, 13)`, ink accent; else bg `colors.surface`, ink `colors.muted`.
  - middle: title 14px/700; muscles line 11.5px `colors.labelMuted` `numberOfLines={1}`
    (joined " · " from workout-level muscles).
  - right: meta 12px/600 `colors.muted` (`{durationMin} min · ~{kcal} kcal`, segments omitted
    when absent) + source line `VIA {SRC}` 10px/800 ls .5 `colors.labelMuted`; chevron-right
    at 40% opacity (existing `Chevron`).
- Data = merge, newest first:
  1. Captured workout entries: `entriesInRange("workout", …30d)` (exists). `SRC` = "CAPTURE"
     (i18n `workoutDetail.viaCapture`; the per-method detail voice/text/photo stays inside the
     preview sheet meta, not the row).
  2. **Health Connect sessions** (Android + connected only): extend the `HealthReader` seam
     (`src/health/healthConnect.ts`) with
     `readSessions(start: Date, end: Date): Promise<HcSession[]>`
     `type HcSession = { id: string; start: string; end: string; title: string | null; exerciseType: number | null }`
     via `readRecords("ExerciseSession", { timeRangeFilter })`. Map to display rows: title =
     record title ?? a small exerciseType→label table (walking/running/strength/cycling/other —
     ~10 common codes, fall back "Workout"); duration = end−start; NO kcal (HC active-energy is
     day-aggregated in our reader — don't fake per-session kcal); `SRC` = "HEALTH CONNECT".
     Stub reader returns `[]` (Expo Go/iOS/jest — honest absence). **SQLite/display only,
     NEVER the outbox** (ADR-0016: HC data is device-local; backend builds nothing).
  3. De-dupe rule: none in v1 — a workout both captured and HC-recorded shows twice, honestly
     credited. (ponytail ceiling: overlap heuristics only if the CEO flags noise.)
- Tap a captured row → existing `WorkoutPreviewSheet`. Tap an HC row → same sheet, fed by a
  minimal adapter object (title/meta/muscles empty/exercises empty, source line "via Health
  Connect") — the sheet already renders absent sections as nothing.

### 7.2 Preview sheet value tuning (`src/workout/PreviewSheet.tsx`)

Handoff §2.4 exact values (SheetOverlay chrome — bg `colors.sheet #FBF6EC`, radius 30, drag —
already matches; only card content changes):

- Date tile 48×48: bg `tint(accent, 13)`, ink accent (today it's `colors.surface`/ink).
- Title 19px/700 (matches); meta line `{meta} · via {SRC}` 12px `colors.muted` — SRC now the
  honest source (capture method or Health Connect), `~` before kcal (exists).
- Muscle chips: bg `tint(accent, 12)`, ink accent, 11.5px/700, radius 12, padding 5px 11px
  (today: default `Chip` neutral) — pass overrides or a `tinted` prop on Chip.
- Exercise list inner card: bg `colors.card`, radius 20 (today 18), 24px index tiles
  (radius 9 bg `colors.surface` number 11px/800 `colors.labelMuted` — today bare text),
  name 13.5px/600, detail 12px `colors.muted`.
- Footer "Preview · drag down to close" 11px `colors.labelMuted` (exists as `previewHint` —
  verify copy matches exactly).

### 7.3 Source card (§2.1.2) — honest version

The handoff's "Imported from Garmin" avatar card becomes, for capture entries: 36px circle
avatar bg `#E7EDE1` ink `#5F7A61`, monogram from the input method ("Vo"/"Te"/"Ph"/"Ta"),
title "Logged by {voice|text|photo|tap}" 14px/700, sub `{Today · 09:30}` 12px `colors.muted`.
For HC-origin rows opened in preview only (no detail screen), skip. ponytail: this replaces the
current `SourceBadge` pill in the hero — one element, honest, prototype-shaped.

### 7.4 Tests (APP-081)

- History merge: fixture entries + fixture HC sessions → ordering, SRC labels, kcal omitted for
  HC rows.
- exerciseType→label table total function (unknown code → "Workout").
- Stub reader path: non-Android → entries only, no crash.
- Component: history row renders date tile today-tint + `VIA CAPTURE`.

---

## 8 · i18n keys (all new/changed, `src/i18n/locales/en.json`)

Changed copy:
- `plan.tapHint` → "Tap an item to adjust portions — totals update as you drag."
- `plan.kcalPlanned` → "kcal planned per day"

New keys:
```
plan.sourcePdf        "via nutritionist PDF"
plan.sourceText       "via description"
plan.sourceManual     "your own entry"
plan.importedMeta     "imported {{date}} · your own reference · estimates"
plan.updatesLive      "kcal planned · updates live"
plan.mealAt           "{{name}} · {{time}}"
plan.done             "Done"
plan.microFiber       "Fiber {{v}} g"
plan.microSodium      "Sodium {{v}} mg"
plan.microIron        "Iron {{v}} mg"
plan.microCalcium     "Calcium {{v}} mg"
workoutDetail.history         "History"
workoutDetail.last30          "last 30 days · as logged"
workoutDetail.viaCapture      "capture"
workoutDetail.viaHealthConnect "Health Connect"
workoutDetail.loggedBy        "Logged by {{method}}"
workoutDetail.tapChipHint     "Tap a muscle or a chip — related exercises light up below."
workoutDetail.rolePrimary     "PRIMARY"      (existing role.* may cover — reuse if so)
workoutDetail.roleSecondary   "SECONDARY"
health.exerciseType.*         (~10 keys: running, walking, strength, cycling, swimming, yoga, hiit, rowing, elliptical, other)
```
(i18n-ready rule: keys only, English-only launch; adding a language stays translation-files-only.)

---

## 9 · Consolidated test plan (gates: tsc 0 · Jest green · api:check clean)

| Area | Tests |
|---|---|
| compute (APP-077) | overlay qtyOf fallback chain (portions → quantity → 1); planDailyTotals with overlay vs without; planMicroTotals all-or-null rule + toFixed/round label rules; barPct headroom (never 100; `|| 1` zero-macros guard); qtyLabel g/ml/countable; kcalLabel thousands + `~`; boundsOf server-vs-fallback; tint endpoints + midpoint |
| overlay store (APP-076) | sparse delete-on-default; coalescing (3 enqueues → 1 row); drain reads map at send time (enqueue, mutate map, drain → PUT sees final map); 422 poison drops + triggers resync; 404/403 poison; network backoff preserves order; savePlan clears overlay; syncPlan portions-dirty keeps local map; prune on doc write |
| plan screen (APP-078) | totals card renders `~1,756` from the §1.2 fixture (assert the value COMPUTED from the in-test fixture per §3.7 — 1,756.2 kcal, binding per backend-spec D-9/§7; the handoff prose "~1,880" contradicts its own table); chips live vs static fallback (item missing micros → static); qty pill label + tap opens modal in view mode; meal kcal `~` prefix |
| portion modal (APP-079) | slider tick updates Card A kcal + screen totals (shared state); Done only closes (no extra writes); old-doc fallback: qty lands in doc + single updatePlan on close; numeric field clamps/quantizes |
| muscle map (APP-080) | §6.4 list |
| history (APP-081) | §7.4 list |
| E2E (Maestro, existing suite) | plan: open plan → tap item → drag slider → close → totals changed persists after relaunch (add to `.maestro/`) |

Emulator verification (per DoD): portion drag feel, breath pulse, auto-flip, history rows.
Blur/gesture feel = CEO device pass.

---

## 10 · Deliberate shortcuts (ponytail ledger)

- `tint()` is sRGB lerp, not oklab — visually indistinguishable at ≤ 35%; upgrade path: a 20-line
  oklab converter if a device pass flags it.
- Plan source badge + "imported {date}" are device-local kv metadata — ceiling: fold into the
  doc/contract if multi-device display matters.
- No HC-vs-capture de-dupe in history — honest double listing; heuristic only on CEO complaint.
- Instant (non-tweened) exercise-row background swap acceptable if the 300ms tween fights RN
  border animation; note in PR whichever ships.
- Micros chips are all-or-nothing live — partial-data plans read as static daily chips rather
  than an undercounted live sum.

## 11 · Questions for the CEO

1. **Portion modal dual input**: the handoff shows a slider only; we KEEP the numeric "exact"
   field below it (product philosophy: any answer can be typed). Confirm — or drop for pixel
   fidelity?
2. **Eating Plan Edit mode**: the handoff header has no Edit affordance; the shipped app has
   full plan editing (add/remove meals/items, rename). We keep Edit alongside the new
   always-available portion taps. Confirm?
3. **iOS history sources**: "via Health Connect" rows are Android-only; iOS shows captured
   workouts only until a HealthKit reader exists (same open question as APP-072 Integrations).
   OK for this round?
4. **Muscle-map opacity deviation (calves/core)**: the handoff §2.2 reference table is provably
   not derivable from any exercise-count rule (calves .62 with 1 exercise vs core .30 with 2 —
   fewer exercises, HIGHER opacity). Our deterministic rule from `muscleRoles` inverts those
   two on the reference session (calves → secondary-low, core → secondary-high). We ship the
   rule (honest, derived from real data) and accept the deviation from the handoff's hand-tuned
   values. Confirm?

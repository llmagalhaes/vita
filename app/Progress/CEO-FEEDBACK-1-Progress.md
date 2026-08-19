# CEO device-feedback batch #1 — Progress

Device: Samsung SM-S942B (`RFGL52XY36B`), Android gesture navigation, 1080×2340 @ density 420
(411 dp wide). Build under test: mock APK (no `VITA_API_BASE_URL`).

## Item 1 (CRITICAL) — panel navigation dead on device

Both ways into Trends/Library were broken, by **two independent causes**. Neither was
one of the four orchestrator hypotheses (sheet-presence was balanced, the easing was
fine, the GestureDetector was not swallowing the taps).

### 1a · Tabs — the route moved, the row did not

Reproduced with `adb shell input tap 352 170`: the TRENDS chip highlighted, the capture
pill disappeared (it is `pathname === "/day"`-gated), and the Day panel stayed on screen.
So `router.replace` fired and `usePathname` updated — only the row never translated.

Root cause in `src/nav/PanelShell.tsx`: `settle()` wrote `idxRef.current = to` **before**
`router.replace(...)`. The route→panel effect right below it starts with

```ts
if (active < 0 || idxRef.current === active) return;   // ← always true after a tap
```

so it returned before ever running `panel.value = active` / `tx.value = withTiming(...)`.
The drag path never noticed because `onEnd` animates the row itself. Worse, `panel.value`
stayed stale, so after a tap the pan thought it was still on Day.

Fix: `settle()` is now the **gesture-commit** path only (it legitimately pre-records the
index, because the row is already moving) and a new `pick()` handles tab taps — route
change only, effect owns the motion. `onPick` also no longer calls `setNavSwiped()`: a
tap is not a swipe, so it must not retire the hint.

### 1b · Edge-swipe — Android's system back gesture eats it

Reproduced with `adb shell input swipe 30 1200 700 1200 400`: the app went to the
launcher. The prototype arms the Day pan only inside the two 34 dp screen edges
(`canStartPan`), and on Android those edges belong to the system back gesture — a
browser prototype has no such owner. The system inset is ~20–24 dp by default and
Samsung lets the user widen it further, so the app's 34 dp band is inside it: the drag
never reaches the app at all, and it is the one gesture an app cannot outbid.

Fix: `canStartPan` is deleted (with `panelGesture.edgePx`) — **all three panels pan from
anywhere**, which is what Trends and Library already did. Nothing else regresses: the
dock date picker and the Trends scrub still win their horizontal drags through
`blocksExternalGesture(tabsPagerRef)`, vertical drags still fall to the ScrollView via
`failOffsetY`/`isVerticalVeto`, and taps still work because the pan needs |dx| ≥ 8.
Hint copy follows: "Swipe from an edge" → "Swipe left or right".

Regression check: `src/nav/__tests__/panelShell.test.tsx` — a tab tap routes and does not
retire the hint (i.e. it goes through `pick`, not `settle`). The row's translateX is a
Reanimated value this jest environment never advances, so the motion itself is proven on
the device, not in the suite.

## Item 2 — the sheet-cap seam

The cap's colour was already right (`scenic.sheetCap.bg` === `colors.canvas` === `#F7F2E9`)
and its margins already work out flush (`38 − 34 − 13` + the ScrollView's `gap: 13` puts
the next child exactly at the cap's bottom edge — there is no double-spacing).

The whole defect was `shadowCap`: `shadowOffset { width: 0, height: -12 }` **plus**
`elevation: 6`. Android ignores the offset and elevation always draws below the view, so
the cap painted a dark shadow band across the one seam that must be invisible — which is
exactly what turns it into "a detached white rounded strip" with the dock label tucked
under a lip. Fix: one line — `boxShadow: "0px -12px 26px -8px rgba(50,36,22,0.18)"`, the
prototype value verbatim, which the New Architecture (RN 0.85) renders on both platforms.

## Item 3 — rich mock seed (`src/db/seed.ts`, rewritten)

21 days of history + today, all as **ordinary entries** through the real model — meal
records come from the same `buildMealRecord` / `toMealEntry` pair Close-the-day uses,
with the same deterministic ids, so statuses, counters, retro detection, the calendar and
the charts all derive. No aggregates are written anywhere.

- **Day shapes** — 4 unrecorded gaps (4, 11, 17, 18 days ago: water only, so they stay
  "no record"), as-planned closes every 3rd day, adjusted days otherwise (a plan swap on
  the Lunch staple from the plan's own `swaps`, a portion override on the protein, the
  Snack skipped periodically, Dinner on its "Tortilla" option every 5th day).
- **Retro-closed** — 9 and 14 days ago carry `loggedAt` on the following morning, the
  only thing that makes `isRetro` fire. Every other day logs at its own time (the old
  seed stamped `updatedAt = now`, which would have made *every* past day read as retro).
- **Workouts** — ~4/week alternating "Leg day" / "Upper body", with per-exercise muscles.
- **Habits** — one daily habit, answered ~70% yes, unanswered on gap days and today.
- **Weight** — weekly 84.2 → 83.8 → 83.4 → 83.1 kg.
- **Water** — 1 500–2 500 ml/day as 250 ml drinks, on every day including gaps.
- **Today** — part-recorded exactly as before (leg day 07:30, yogurt & granola 08:10,
  250 ml 08:15) plus today's weigh-in; the habit is left unanswered on purpose.

Check: `src/db/__tests__/seed.test.ts` asserts the **derived** side (status mix + gaps
absent from the map, retro on 9 but not 8, water range, five self-describing meal records,
weight drift, habit majority-yes).

## Item 4 — test-only scene switcher

`src/ui/scene.ts` gained a `dev.scene` kv override honoured by `useSceneName`
(`override ?? clock`), and the Library renders a "DEV · SCENE — Auto/Morning/Afternoon/
Evening" row under its footer. Hard-coded English, no i18n keys, no settings surface:
deleting the component + the override block removes the feature entirely.

## Gates

`npx tsc --noEmit` → 0 · `npx jest` → 62 suites, 459 passed / 1 skipped.
New checks: `src/nav/__tests__/panelShell.test.tsx` (tab tap), `src/db/__tests__/seed.test.ts`
(derived day shapes), `src/ui/__tests__/scene.test.ts` (clock rule + override round-trip).

## Device verification (SM-S942B, clean install of the mock APK)

APK: `android/app/build/outputs/apk/release/app-release.apk`, 113 MB, 16:17. Verified
mock before installing — `assets/app.config` → `{"apiBaseUrl": ""}` and zero occurrences
of the prod API host in `assets/index.android.bundle`. Installed after
`adb uninstall com.llmagal.vita`. Screenshots in the session scratchpad.

| # | Evidence | Shot |
|---|---|---|
| 0 | Baseline, OLD build: tap on TRENDS highlighted the chip and hid the capture pill while the Day panel stayed on screen (route moved, row did not) | `s2.png` |
| 0 | Baseline, OLD build: `input swipe 30 1200 700 1200` from the left edge → **launcher** (system back gesture) | `s3.png` |
| 0 | Baseline, OLD build: the seam as the CEO circled it — white strip + shadow band over the dock | `seam.png` |
| 1 | Tab tap Day → Library: Library panel rendered, tab active | `v3-tap-library.png` |
| 2 | Tab tap Library → Trends: Trends panel rendered | `v4-tap-trends.png` |
| 3 | Swipe right→left mid-screen (y=650) Trends → Today | `v5-swipe-rtl.png` |
| 4 | Swipe right→left mid-screen (y=1400) Today → Library | `v6-swipe-day-to-library.png` |
| 5 | Swipe left→right mid-screen Library → Today | `v7-swipe-ltr-back-to-day.png` |
| 6 | Seam: cap flush with the panel, no strip, no band, dock label clear | `v2-trends.png` (top third) |
| 7 | Seeded history in Trends: "22 of 231 days this year have a record", 6 full ENERGY IN bars + the Sat gap + today's 240, WATER 12.0 L / 7 days, MOVEMENT 3 workouts + a pinned "Sat 15 · rest" | `v4-tap-trends.png` |
| 8 | Seeded history in the dock: 10 status dots in three colours (as-planned / adjusted / unrecorded) instead of the old uniform strip | `v2-trends.png` |
| 9 | Plan hydration on a clean install: "plan ~1,378", macros 15/163 · 33/123 · 7/30, "0 confirmed · 1 adjusted · 5 planned" | `v2-trends.png` |

Cross-check of the seed against the derived series (`readBuckets("M")` on a fresh db):
recorded days 1265–1378 kcal, water 1500–2500 ml, gaps exactly on 08-01 / 08-02 / 08-08 /
08-15 (n = 18/17/11/4), today 240 kcal / 250 ml. Trends' "avg 1,068 kcal/day" is the mean
of the six complete days, which matches.

**Not driven on the device** — the phone was unplugged mid-pass (`adb` lost it after the
swipe checks) and never came back: vertical scroll under the now-whole-surface pan, the
TODAY tab tap (the other two tab taps are shown above and share one code path), the scene
switcher flipping the header dark, and opening the calendar / a past day. All four are
covered by the suite, but they want a look on the next device round. The APK for it is at
`scratchpad/vita-mock-v4b.apk`.

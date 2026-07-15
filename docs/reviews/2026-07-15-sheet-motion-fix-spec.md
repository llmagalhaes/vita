# Sheet entrance "childish bounce" — fix specification (for CEO review)

**Date:** 2026-07-15 · **Author:** app team lead (Fable 5) + 1 Sonnet enumeration sub-agent
**Status:** SPEC ONLY — no code changed. Implementation gated on CEO approval.
**Regression introduced by:** session-10 fluid-close work (`useSheetTransition`, commit `5c6974a`, APP-042).
**Fix ticket:** APP-050 (Asana, Vita frontend board — Backlog, gated on this review).

---

## 1. Root cause

**File:** `app/services/vita-app/src/ui/useSheetDrag.ts`

Session 10 unified every sheet's open/drag/close onto one `translateY` driver
(`useSheetTransition`). The **close** paths are correct. The **entrance** was
rewritten from the pre-session-10 pattern (a `SlideInDown` on the prototype's
decelerate bezier) to an **underdamped spring**:

```ts
// line 39 — the open animation, runs every time any sheet mounts
translateY.value = withSpring(0, { damping: 20, stiffness: 210 });
```

### The physics (why this bounces)

Reanimated's `withSpring` is a damped harmonic oscillator. With the default
`mass = 1`, the damping ratio is:

```
ζ = damping / (2·√(stiffness·mass)) = 20 / (2·√210) = 20 / 28.98 ≈ 0.69
```

ζ < 1 is **underdamped**: the value overshoots its target and oscillates back.
First-overshoot magnitude for a step response is `exp(−πζ/√(1−ζ²))`:

```
exp(−π·0.69 / √(1−0.476)) = exp(−2.996) ≈ 5.0% of the travel distance
```

The travel distance is the full sheet height (`FALLBACK_HEIGHT = 700`px until
measured; real sheets ≈ 400–724px). **5% of ~650px ≈ 30–35px**: the sheet
rises ~33px PAST its resting position, then falls back. That is the visible
"childish bounce" — one clear overshoot-and-settle on every sheet open,
app-wide (the hook is the single shared driver, so every sheet inherited it).

### Three animation paths — only one is wrong

| Path | Current code (`useSheetDrag.ts`) | ζ | Verdict |
|---|---|---|---|
| **Entrance** (open) | line 39: `withSpring(0, {damping: 20, stiffness: 210})` | 0.69 → **5% overshoot ≈ 33px** | **THE BUG** — the bounce the CEO sees |
| Drag-dismiss + programmatic close | lines 41–47: `withTiming(height, 260ms, pop bezier)` | n/a (timing) | Correct — the good session-10 behavior, keep |
| Drag spring-back (released above threshold) | line 68: `withSpring(0, {damping: 18, stiffness: 220})` | 0.61 → 9.1% overshoot | Secondary — travel ≤120px so overshoot ≤ ~11px; same bounce family, fix in passing |

The design source of truth confirms the entrance should never overshoot:

- Prototype (`docs/home-v2/handoff/Vita Prototype v2.dc.html`, lines 39, 3167,
  3232, 3536, 3611): **every** sheet opens with
  `vtSheetUp .45s cubic-bezier(.22,.9,.32,1)` — a pure decelerate ease-out
  (control-point y-values 0.9 and 1 → monotone, zero overshoot).
- Handoff `docs/home-v2/handoff/README.md` §Motion: "screen slides `.32–.45s`";
  the springy `cubic-bezier(.34,1.56,.64,1)` is reserved for **dock + tooltip
  micro-interactions**, never full-sheet entrances.
- Our own token file already encodes this: `motion.unfold` =
  `{ durationMs: 450, bezier: [0.22, 0.9, 0.32, 1] }` (`src/ui/tokens.ts:58`) —
  the exact vtSheetUp curve, sitting unused for this purpose.

---

## 2. Affected call sites (completeness check)

`useSheetTransition` is the app's ONLY sheet entrance driver, so the bug — and
the fix — is app-wide from **one file**.

### Direct consumers of `useSheetTransition` (4)

| Consumer | Call site |
|---|---|
| `SheetOverlay` (the shared chrome) | `src/ui/SheetOverlay.tsx:33` |
| `CaptureSheet` (hand-rolled, keyboard-coupled) | `src/capture/CaptureSheet.tsx:222` |
| `CheckinSheet` (hand-rolled, stacked queue) | `src/habits/CheckinSheet.tsx:126` |
| `ReviewSheet` (hand-rolled, offline-review queue) | `src/review/ReviewSheet.tsx:60` |

### Sheets riding `SheetOverlay` (7 — inherit the transition)

| Sheet | `<SheetOverlay` at |
|---|---|
| MacrosSheet | `src/tabs/MacrosSheet.tsx:36` |
| PhotoSheet | `src/capture/PhotoSheet.tsx:97` |
| ConfirmSheet (vacation End confirm) | `src/ui/ConfirmSheet.tsx:35` |
| VacationSheet | `src/vacation/VacationSheet.tsx:79` |
| MuscleSheet (Trends muscle→exercises) | `src/trends/MuscleSheet.tsx:32` |
| ExportSheet | `src/export/ExportSheet.tsx:53` |
| WorkoutPreviewSheet | `src/workout/PreviewSheet.tsx:67` |

No `app/(main)/**` screen renders `<SheetOverlay` inline. 7 + the 3 standalone
hook callers = **all 10 sheet components in the app** (exhaustive grep, verified
against every `export function *Sheet` definition).

### Bespoke-animation drift check

`grep withSpring` over `src/` + `app/` finds only two other spring sites (8 hits
total), both intentionally springy micro-interactions per the handoff (NOT
sheets, NOT in scope):

- `src/ui/PressScale.tsx:28` — press-release scale pop (`damping: 15, stiffness: 320`, travel 3%: imperceptible overshoot).
- `src/nav/TabsPager.tsx:95,120` — pager page snap (`damping: 22, stiffness: 210, mass: 0.9`).

No sheet remains on stock RN `Modal` or a bespoke `SlideInDown` (session 8/10
sweeps removed them). One residual `Modal` exists at `app/(main)/plan.tsx:307`
(the portion-adjust pop-up) — it is a **centered pop-up, not a bottom sheet**
(prototype specifies a centered `vtPop` there; fidelity-audit item B6 tracks its
polish separately). It is unaffected by, and out of scope for, this fix.
**One entrance fix in `useSheetDrag.ts` covers every bottom sheet in the app.**

> Sub-agent enumeration verified 2026-07-15; if implementation lands later,
> re-run `grep -rn "useSheetTransition\|<SheetOverlay" src/ app/` to confirm no
> new bespoke sheet appeared in between.

---

## 3. Corrected motion — exact values

**Entrance:** replace the spring with the prototype's own vtSheetUp timing,
via the existing token — no new constants:

```
withTiming(0, {
  duration: motion.unfold.durationMs,            // 450ms
  easing:   Easing.bezier(0.22, 0.9, 0.32, 1),   // motion.unfold.bezier
})
```

Justification: this is character-for-character the prototype's sheet entrance
(`vtSheetUp .45s cubic-bezier(.22,.9,.32,1)`), inside the handoff's `.32–.45s`
slide band, monotone (zero overshoot), and deterministic (no spring
settle-threshold variance across sheet heights).

**Considered and rejected:** keeping a spring but critically damping it
(`damping: 29, stiffness: 210` → ζ = 29/(2√210) ≈ 1.00). It also removes the
bounce, but its perceived duration drifts with sheet height and Reanimated's
rest thresholds, and the prototype specifies a timing curve, not a spring.
A spring buys velocity continuity — which the entrance doesn't need (it always
starts from rest, off-screen).

**Drag spring-back (secondary):** keep the spring (it can inherit finger
velocity later), but critically damp it:

```
withSpring(0, { damping: 30, stiffness: 220 })   // ζ = 30/(2·√220) ≈ 1.01
```

(was `damping: 18` → ζ 0.61, ~11px overshoot on a cancelled drag).

**Accessibility (reduce-motion):** Reanimated ≥3.5 animation configs default to
`reduceMotion: ReduceMotion.System` — with the OS "reduce motion" setting on,
both `withTiming` and `withSpring` jump to the final value and still fire their
completion callbacks (so the `rendered` unmount path is unaffected). No extra
work needed; do not override the default.

---

## 4. Diff sketch (NOT applied — for review)

One file: `app/services/vita-app/src/ui/useSheetDrag.ts`. Three hunks.

**Hunk 1 — imports (line 13):** `motion` is already imported; add nothing.
`withSpring` stays (still used by the spring-back).

**Hunk 2 — the entrance (line 39):**

```diff
-      translateY.value = withSpring(0, { damping: 20, stiffness: 210 }); // …and rise
+      translateY.value = withTiming(0, {
+        duration: motion.unfold.durationMs, // 450ms — prototype vtSheetUp
+        easing: Easing.bezier(...motion.unfold.bezier), // (.22,.9,.32,1) decelerate — no overshoot
+      }); // …and rise
```

**Hunk 3 — the drag spring-back (line 68):**

```diff
-        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
+        translateY.value = withSpring(0, { damping: 30, stiffness: 220 }); // ζ≈1: settles, never overshoots
```

**Hunk 4 (comment only) — doc header (line 19):** "spring-in on open" →
"rises on open (prototype vtSheetUp: 450ms decelerate bezier)".

Nothing else changes. `SheetOverlay.tsx`, `sheet.ts`, every consumer: untouched.

---

## 5. Verification plan

1. **Emulator pass** (Pixel_10_Pro, Expo Go SDK 56, mock mode — after CEO
   greenlight): open each sheet family once — capture pill (CaptureSheet),
   check-in banner (CheckinSheet), Home macros (MacrosSheet), camera
   (PhotoSheet), vacation (VacationSheet + End ConfirmSheet), export
   (ExportSheet), workout history chip (WorkoutPreviewSheet), Trends muscle
   (MuscleSheet). Each must rise and settle with **no upward travel past its
   resting margin**. Android Dev Settings → "Animation scale 5x" makes the
   before/after unmistakable.
2. **Close paths unchanged**: drag-dismiss (follows finger, releases past
   120px/800px·s⁻¹ into the 260ms slide-out), cancelled drag (springs back,
   now without the ~11px pop-past), programmatic close (Confirm/Save →
   mid-slide catchable). This is exactly the session-10 APP-042 checklist.
3. **Existing tests**: `src/capture/__tests__/sheet.test.ts` covers only the
   pure helpers (`shouldDismiss`, `backdropOpacityAt`) — unaffected, must stay
   green. Behavioral suites that open sheets (`capture.test.tsx`,
   `workout.test.tsx`, `account.test.tsx` ConfirmSheet, `plan-screen.test.tsx`)
   assert state/callbacks only — **no current test asserts the entrance
   config**, which is why session 10 could regress it silently. Full gates:
   `tsc` 0 · Jest 199/199 (38 suites) · `expo export`.
4. **New test (warranted, small)**: render `SheetOverlay visible` under jest
   fake timers and, using Reanimated's jest utils (`getAnimatedStyle` +
   `jest.advanceTimersByTime`), assert `translateY` is **never < 0** across the
   entrance frames and equals 0 at ≥450ms — this is the regression test for
   "no overshoot", independent of the exact curve. If the Reanimated jest mock
   proves unfaithful on easing, fall back to exporting the entrance config
   object from `useSheetDrag.ts` and asserting it references
   `motion.unfold.durationMs` / contains no `damping` key.

---

## 6. Risk — what could regress, and why it won't

- **Programmatic close (the good APP-042 behavior):** untouched — the
  `else if (rendered)` branch (`withTiming(height, 260ms, pop bezier)` +
  unmount-in-callback) is not in the diff.
- **Drag-dismiss:** untouched — `onUpdate`/`onEnd` decision logic
  (`shouldDismiss`) and the hand-off to `close()` are not in the diff.
- **Grab-mid-entrance:** the pan's `onUpdate` writes `translateY` directly,
  which cancels an in-flight `withTiming` the same way it cancels a
  `withSpring`. Behavior identical.
- **Close-mid-entrance:** `visible` flips false → close `withTiming` starts
  from the current value — same as today.
- **Mount/unmount (`rendered`) lifecycle:** driven by the close callback only;
  the entrance has no callback. Unchanged.
- **Backdrop:** `backdropOpacityAt` clamps `t` to [0,1]; with no negative
  `translateY` anymore, it merely loses a (previously invisible) clamped case.
- **Residual risk:** essentially the entrance curve itself — subjective feel at
  450ms. If the CEO finds it slow, the one knob is `duration` (320–450ms band
  per the handoff); no structural change.

**Team-lead assessment:** this is a 2-line behavioral change in one file,
reverting the entrance to the design system's own documented curve, with both
good paths untouched. Safe to apply on greenlight.

---

## Questions for the CEO

1. Approve the exact entrance target: **450ms `cubic-bezier(.22,.9,.32,1)`**
   (the prototype's literal vtSheetUp)? Or prefer the faster end of the band
   (e.g. 360ms, same curve)?
2. The drag spring-back damping bump (18→30) is included as in-family cleanup —
   OK to ship together? (Omitting it keeps a small ~11px pop on cancelled drags.)

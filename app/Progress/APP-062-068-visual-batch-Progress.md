# APP-062..068 — Visual/fidelity batch (session 14)

Asana board: Vita frontend `1216519867368576`. CEO device-tested the 2026-07-20 prod APK
and filed visual bugs vs the prototype. This ledger covers the VISUAL batch (APP-062..068).
A sibling agent owns the functional batch (APP-058..061) in a separate worktree — capture/
sync/outbox/health/api-client untouched here.

Source of truth for every fix: `docs/prototype/vita-prototype.dc.html` (frame refs below).

## Gates (worktree, node_modules symlinked from the shared checkout — zero dep changes)
- `tsc --noEmit` → **exit 0**
- `jest --ci` → **43 suites, 212/212 pass** (the known `vacation.test.ts` midnight flake did not
  trigger this run; it is time-of-day dependent, proven pre-existing on a pristine tree)
- `expo export --platform ios` → **OK** (bundle built)

---

## APP-066 (P0) — Home water card explodes after quick-adds
**Root cause (confirmed):** the expanded water-log row split into a `flex:1` amount `Text`
(no `numberOfLines`) beside an *unconstrained* `method · time` `Text` (no flex, `flexShrink`
defaults to 0 in RN → never yields width). In the narrow ~44%-width water column the meta text
ate the row, starving the amount to ~0px; with no `numberOfLines` the amount **wrapped one
char per line** ("2/5/0/m/l"). The header amount separately truncated to "500 …" because the
vessel (54px) + gap leaves a ~40–55px text column on narrow devices.

**Decision on the in-card history:** the ticket premise ("prototype = vessel + amount +
quick-add only") is **incorrect** — the prototype water card (proto lines 456–466) DOES have
the expandable history. So I KEPT it and fixed its layout to the prototype's own pattern.

**Fix (`src/tabs/Home.tsx`):**
- Row → one ellipsized meta `Text` (`flex:1, minWidth:0, numberOfLines={1}`, "amount · method")
  + a short `flexShrink:0` time — exactly the prototype's `flex:1 min-width:0 nowrap ellipsis`
  + short-time layout. Per-char wrap gone.
- Header amount → `adjustsFontSizeToFit minimumFontScale={0.6}` (keeps `numberOfLines={1}`): the
  unit no longer truncates to "500 …"; it shrinks to fit one line on narrow columns / long
  values.
- Per-row `Pressable → /water/{id}` kept (app feature; the prototype rows aren't tappable).

## APP-063 — Macros pop-up must match the prototype frame (CEO's 4th flag)
The pop card itself already matches the prototype almost verbatim (centered `PopOverlay`, 26px
side margins, `#FFFDF7` r26 card, `shadowPop`, `vtPop`, dashed divider, "FROM YOUR MEALS" rows
on `colors.sheet`, per-meal kcal + P/C/F line). Macro bar fills are already the prototype colors
(`colors.macro` = protein `#8CA58A` green / carbs `#C98A3F` amber / fat `#E0A375` — verbatim the
prototype legend, proto lines 1223–1225 & 2516). So the residual gap is the **backdrop blur**.

**Fix (`src/ui/SheetBackdrop.tsx`) — the "not blurred on Android release" root cause:**
- Android divides perceived blur by `blurReductionFactor` (**default 4**) → release builds read
  as barely-blurred. Set `blurReductionFactor={1}` on Android (full intensity).
- Default light `intensity` 26 → **40** ("strongly blurred").
- Light scrim `rgba(237,229,214,.4)` → **`rgba(247,242,233,.45)`** (prototype exact; also the
  guaranteed fallback tint if a device can't blur at all).
- Kept `blurMethod="dimezisBlurView"` (the current, non-deprecated prop in expo-blur 56.0.3;
  `experimentalBlurMethod` is the *deprecated* alias here — the code already used the right one).
- Affects every sheet + pop-up backdrop consistently (all should match the prototype's frost).

## APP-064 — Stack transition grammar (findings + fix)
**Findings (prototype read):** detail/stack screens animate with **`vtIn`** = fade + `translateY
16→0` over ~.3s ease (proto: Meal detail L548, Account L933, Eating plan L1036 use literal
`animation:vtIn .3s`; Home/Trends/Workout/Habits/Integrations use `{{screenAnim}}` which is also
`vtIn`-family). The lateral `vtSlideInR/L` keyframes exist ONLY for the prototype's *fake* tab
nav — which our real pager replaces. So detail screens should fade+rise, NOT slide laterally.

**Fix (`app/(main)/_layout.tsx`):** Stack `animation: "slide_from_right" → "fade_from_bottom"`
(the built-in that fades + rises = `vtIn`). Scope = stack/push screens only. The three tab
placeholders keep `animation:"none"`; TabsPager + its swipe untouched. Sheet system untouched.

## APP-065 — Missing shadows sweep
- Account "Export to…" CTA (`app/(main)/account.tsx`) → `shadowCta(colors.accent)` (was flat;
  prototype gives every accent CTA `0 10px 22px accent@35%`).
- Export "Prepare PDF" CTA (`src/export/ExportSheet.tsx`) → `shadowCta(colors.accent)` when
  enabled (proto L1643 has it).
- Home check-in / offline-review banner `CountBanner` (`src/tabs/Home.tsx`) → warm terracotta
  lift `#A0643C @ .12` (prototype check-in banner `0 10px 24px rgba(160,100,60,.12)`, proto
  L424) — distinct from the neutral card shadow.
- Inline pending check-in card `CheckinQuestion` (`src/habits/CheckinSheet.tsx`, non-deck) →
  prototype's own `0 12px 28px rgba(105,84,60,.10)` (proto L790), deeper than the default Card
  shadow. Deck variant keeps `shadowDeck`.

## APP-062 — Dock date-picker tooltip clipped / under the finger
**Fix (`src/tabs/home/DockDatePicker.tsx`):** tip `bottom: 26 → 52` (floats well above the
fingertip; also clears the dot's up-to-13px magnify lift). Added explicit `overflow:"visible"`
to the dock row + per-dot slot so the raised pill can't clip on Android. `dock.ts` untouched
(keeps its `"worklet"` directives — the session-13 red-screen gotcha).

## APP-067 — Floating nav pill soft lift shadow + colours
**Fix (`src/capture/CapturePill.tsx`):** pill `shadowRadius 22 → 30`, `elevation 8 → 9`, bg
`rgba(255,253,247,.94) → .90` (prototype `0 18px 44px rgba(105,84,60,.20)` + `rgba(...,.82)`
frost). The active/icon/label colours already matched the prototype (active = accent bg + cream
ink; inactive `#6E6355`) — verified against proto L1848–1866, no change needed.

## APP-068 — Remove redundant 4-icon Home header row
**Finding:** the prototype Home header DOES have 4 icons (proto L405–409, "Account = person icon
on Home" L1895) — but Trends & Habits duplicate the nav pill, and Integrations is reachable from
Account → Your setup (`account.tsx` L141). Account itself is ONLY reachable from this header.
So removing all four would orphan Account.

**Fix (`src/tabs/Home.tsx`):** reverted session-8's 4-icon row to a **single Account (person)
icon** (the Round-5 header). Trends/Habits → nav pill; Integrations → Account → Your setup;
Account → the person icon. Nothing orphaned.

---

## Verification (emulator: Pixel_10_Pro, Expo Go SDK 56, mock mode, my worktree Metro on 8082)
Cold-boot ANRs appeared (documented session-10 slow-JS emulator behaviour, not an app regression);
app reached a fully interactive Home after tapping "Wait".

- **APP-066 ✅** added 4×250 ml → expanded water card shows 4 CLEAN rows ("250 ml · … / 5:54 PM"),
  header "1.00 L" clean, no per-char wrap, no explosion. The definitive P0 fix.
- **APP-068 ✅** Home header shows a SINGLE person icon → opens Account; Account "Your setup" lists
  Integrations (reachable — nothing orphaned).
- **APP-067 ✅** nav pill floats with a clear soft lift; active "Today" = terracotta bg + cream ink.
- **APP-063 ✅** Macros card → centered "Macros today" pop scales in (caught mid-vtPop) over a
  visibly frosted/dimmed backdrop; expo-blur dev toast confirmed dimezisBlurView active.
  ⚠ emulator blur intensity ≠ device — CEO to confirm "strongly blurred" on the next prod APK.
- **APP-064 ✅** person icon → Account entered with a fade/rise (mid-stagger, no lateral slide, no
  crash) — the new fade_from_bottom grammar.
- **APP-065 ✅** Account "Export to…" CTA floats with a visible accent-tinted shadow. The check-in
  banner + inline check-in card shadows need a pending check-in to render (mock seed has none) —
  code correct, visual seed/device-gated.
- **APP-062 needs-device** dock tooltip is a mid-drag transient (adb screencap lands on arbitrary
  frames); position/overflow fix is low-risk, feel best confirmed with a live finger drag.

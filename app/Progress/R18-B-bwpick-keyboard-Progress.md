# R18-B — the add-exercise sheet's keyboard (CEO device round 18)

CEO, real Samsung, release build, workout builder → `bwPick`:

- **(a)** "o teclado não sobe e abaixa automaticamente algumas vezes"
- **(b)** ONCE: "eu digitava e não aparecia nada, porém subiu uma espécie de card do
  nada na tela"

Code inspection only — he cannot reproduce (a) reliably and (b) happened once.

## What the code actually says

### (b) the ghost card — REPRODUCED in a test, root cause found

`src/ui/popHost.tsx` rendered its portalled nodes as an **unkeyed array**
(`<>{list}</>`). The node store is a `Map<id, node>`, and `usePortal(null)` —
which is what every `SheetOverlay` does while it is closed — **deletes** the key;
reopening **appends** it. So the array reorders in ordinary use: a sheet opens
(index 1, behind the panel tabs at 0), the tabs unmount under it (`useSheetPresence`
→ `onPanel` false on a pushed route), and the sheet shifts 1 → 0.

Unkeyed, React reconciles that by position. Both nodes are a plain `View`, so the
fiber is **reused**: the surviving portal is reconciled against its neighbour's
tree. `src/ui/__tests__/popHost.test.tsx` demonstrates it — with the old code the
test finds the **closed** portal's content still on screen and the surviving one
destroyed. That is exactly "a card out of nowhere", and the same tear-down drops
any focused `TextInput` (keyboard falls) and replays the sheet's 450ms entrance.

Fixed: keyed by portal id (`<Fragment key={id}>`), snapshot carries `[id, node]`.
Test fails on the old code, passes on the new.

### (b) the vanishing text — second, independent root cause

The builder's "+ Add exercise" row lives in `BuilderShell`'s ScrollView, which is
`keyboardShouldPersistTaps="handled"`. Pressing it is *handled*, so **RN does not
dismiss the keyboard and the day-name / kcal field keeps Android focus** while the
sheet slides over it. Type without successfully focusing the search field and every
character lands in a field hidden behind the sheet — nothing appears.

Compounding it: `useFieldVisible` (`src/build/parts.tsx`) fires a **320ms delayed
`scrollTo`** on that shell ScrollView, with no focus check and no `clearTimeout`.
The field the user left behind scrolls the builder up *underneath the sheet*, 320ms
after the sheet opened — a card moving on its own, from a screen the person is no
longer on.

### (a) the keyboard going down by itself — three real paths

1. `returnKeyType="search"` with RN's default submit behaviour **blurs on submit**.
   The list already filters live, so pressing the search key did nothing except
   close the keyboard.
2. Picking a catalog row unmounts the search field (stage 1 → 2), so the keyboard
   dropped as a delayed side effect rather than a deliberate move.
3. `keyboardShouldPersistTaps="handled"` on the catalog list: a tap on the list's
   own padding — the gaps between rows, the strip under a short result set, easy to
   hit when the list is clamped to 120px — is *unhandled*, and RN dismisses the
   keyboard.

### (a) the keyboard not coming up — the tap that gets eaten

The free-entry row (`Add "{query}"`, ~40px) was rendered at the **top** of the
list, so it appeared and disappeared as the query matched or stopped matching,
shifting every catalog row under the finger mid-keystroke. A tap aimed at the
search field or at a row lands on the row that moved into its place.

Remaining suspect, **not changed** (owned by SheetOverlay/useSheetDrag, and
app-wide): every sheet body sits inside `Gesture.Pan().activeOffsetY(10)`. On
Android RNGH delays and replays the touch stream while the pan arbitrates; a tap
with ≥10px of downward drift activates the pan and cancels the child's touch, so
the `TextInput` never focuses. This fits "algumas vezes" better than anything else
in the tree, but it is app-wide sheet behaviour and could not be proven by reading.

### Ruled out

The APP-132 clamp `max(120, min(300, 0.78·h − keyboard − 260))` **cannot blur the
field**: the search input sits *above* the `ScrollView` it resizes, so shrinking the
list never scrolls or unmounts the focused field. It was, however, subscribing to
keyboard events **while the sheet was closed** (sheets stay mounted for their close
slide), re-rendering the closed sheet — and pushing a new portal node — on every
keyboard event in the builder. Gated on `visible`.

## Changes

| File | Change |
|---|---|
| `src/ui/popHost.tsx` | portalled nodes keyed by portal id, snapshot is `[id, node][]` |
| `src/ui/keyboard.tsx` | `useKeyboardHeightState(enabled = true)` — no subscription while closed |
| `src/build/parts.tsx` | `useFieldVisible`: bail if the field lost focus, `clearTimeout` on re-focus and unmount |
| `src/workout/PickExerciseSheet.tsx` | `Keyboard.dismiss()` on open / pick / add / close; `submitBehavior="submit"`; `keyboardShouldPersistTaps="always"`; free-entry row moved to the bottom under a hairline; accent border while the field owns the keyboard; `autoCorrect={false}`; clamp gated on `visible` |
| `src/ui/__tests__/popHost.test.tsx` | new — portal state survives a sibling portal closing (fails on the old code) |

No new i18n strings.

## Gates

`npx tsc --noEmit` → 0 · `npx jest` → 77 suites, **634 passed / 1 skipped / 635**.

## Ceiling

Not device-verified — inspection round. The RNGH pan-vs-TextInput tap steal above
is the one suspect left standing for "não sobe"; if the CEO still sees it after
this build, the next move is to narrow the sheet's drag gesture to the handle (or
`.blocksExternalGesture` the fields), in `src/ui/useSheetDrag.ts`.

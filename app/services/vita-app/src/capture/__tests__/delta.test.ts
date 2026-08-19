/**
 * APP-104 — the plan-delta core. Everything here runs against the REAL 0.8.0 parse
 * fixtures (`mockParse` with the handoff plan), so the test breaks if the mock and
 * the delta math ever drift apart.
 */
import { handoffPlanV3, mockParse } from "../../api/mock";
import type { MealDetail } from "../../api/client";
import { composeItems, emptyDay, emptyOverlay, sumTotals, type DayRecord } from "../../day/record";
import { applyDelta, planDelta, revertDelta } from "../delta";

const plan = () => {
  // The saved plan carries "m-N" meal ids; the raw fixture does not (stampPlanIds
  // does it server-side), so parse through the mock api path used by the app.
  const doc = handoffPlanV3();
  return { ...doc, meals: doc.meals.map((m, i) => ({ ...m, id: m.id ?? `m-${i + 1}` })) };
};

const draftFor = (phrase: string) => {
  const p = plan();
  const draft = mockParse(phrase, undefined, p).drafts[0]!;
  return { p, draft };
};

const DAY = "2026-08-19";

test("a swap → signed kcal delta + one ~~old~~ → new line, everything else untouched", () => {
  const { p, draft } = draftFor("lunch as planned, but I swapped the steamed corn for sweet potato");
  const d = planDelta(draft, p.meals)!;

  expect(d.state).toBe("adjusted");
  expect(d.planMealId).toBe(p.meals.find((m) => m.name === "Lunch")!.id);

  // exactly one changed row — the swapped item
  expect(d.lines).toHaveLength(1);
  expect(d.lines[0]!.from!.name).toBe("Steamed corn");
  expect(d.lines[0]!.to!.name).toBe("Sweet potato, boiled");

  // the delta is the difference between the two compositions, not a server number
  const lunch = p.meals.find((m) => m.name === "Lunch")!;
  const before = sumTotals(composeItems(lunch, emptyOverlay())).kcal;
  expect(d.kcalDelta).toBe(Math.round(d.totals.kcal - before));
  // A plan swap is priced in the swap's own equivalence space, so a straight swap
  // lands near zero — the card still shows the row, and the badge shows the truth.
  expect(Math.abs(d.kcalDelta)).toBeLessThan(60);
});

test("eaten as planned → done, zero delta, no lines", () => {
  const { p, draft } = draftFor("had lunch");
  const d = planDelta(draft, p.meals)!;
  expect(d.state).toBe("done");
  expect(d.kcalDelta).toBe(0);
  expect(d.lines).toEqual([]);
});

test("skipped → every planned item reads as dropped and the delta is the whole meal", () => {
  const { p, draft } = draftFor("skipped dinner today");
  const d = planDelta(draft, p.meals)!;
  const dinner = p.meals.find((m) => m.name === "Dinner")!;
  expect(d.state).toBe("skipped");
  expect(d.items).toEqual([]);
  expect(d.totals.kcal).toBe(0);
  expect(d.lines).toHaveLength(composeItems(dinner, emptyOverlay()).length);
  expect(d.lines.every((l) => l.to === undefined)).toBe(true);
  expect(d.kcalDelta).toBeLessThan(0);
});

test("the delta is measured against TODAY's overlay, not the pristine plan", () => {
  const { p, draft } = draftFor("had lunch");
  const lunch = p.meals.find((m) => m.name === "Lunch")!;
  const corn = lunch.items[0]!;
  // The user had already halved the corn for today; eating the full plan is now a gain.
  const ov = { ...emptyOverlay(), qty: { [corn.id!]: (corn.quantity ?? 1) / 2 } };
  const d = planDelta(draft, p.meals, ov)!;
  expect(d.kcalDelta).toBeGreaterThan(0);
  expect(d.lines).toHaveLength(1); // the corn row differs by quantity
});

test("off-plan and stale-pointer drafts fall back to the loose card (null)", () => {
  const { p, draft } = draftFor("had a banana");
  expect((draft.detail as MealDetail).planMealId).toBeUndefined();
  expect(planDelta(draft, p.meals)).toBeNull();

  // plan re-imported → the back-pointer no longer resolves (risk 3)
  const { draft: lunch } = draftFor("had lunch");
  expect(planDelta(lunch, [])).toBeNull();
});

// ── apply / revert ───────────────────────────────────────────────────────────

const AT = `${DAY}T13:00:00.000Z`;

test("apply → revert restores an unrecorded meal byte-identically (and asks for the delete)", () => {
  const { p, draft } = draftFor("lunch, swapped the steamed corn for sweet potato");
  const day: DayRecord = emptyDay(DAY);
  const d = planDelta(draft, p.meals)!;

  const applied = applyDelta(day, d, AT);
  expect(applied.record.entryId).toBe(`meal:${DAY}:${d.planMealId}`);
  expect(applied.record.state).toBe("adjusted");
  expect(applied.record.items).toEqual(d.items); // the parse's numbers, verbatim
  expect(applied.day.meals).toHaveLength(1);

  const reverted = revertDelta(applied.day, applied.undo);
  expect(reverted.remove).toBe(applied.record.entryId);
  expect(reverted.restore).toBeUndefined();
  expect(reverted.day).toEqual(day);
});

test("apply → revert restores the PREVIOUS record and its meal state byte-identically", () => {
  const { p, draft } = draftFor("had lunch");
  const done = planDelta(draft, p.meals)!;
  const day = applyDelta(emptyDay(DAY), done, AT).day; // lunch already recorded as done

  const { draft: swapped } = draftFor("lunch, swapped the steamed corn for sweet potato");
  const adjusted = planDelta(swapped, p.meals)!;
  const applied = applyDelta(day, adjusted, AT);
  expect(applied.day.meals).toHaveLength(1); // re-record, never a duplicate
  expect(applied.day.meals[0]!.state).toBe("adjusted");
  expect(applied.undo.previous!.state).toBe("done");

  const reverted = revertDelta(applied.day, applied.undo);
  expect(reverted.restore).toEqual(day.meals[0]);
  expect(reverted.day).toEqual(day);
});

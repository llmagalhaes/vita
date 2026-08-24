import { fireEvent, render, screen } from "@testing-library/react-native";
import "../i18n";
import EatingPlanScreen from "../../app/(main)/plan";
import { PopHost } from "../ui/popHost";
import { api, type EatingPlanDraft } from "../api";
import { getCachedPlan, savePlan } from "../db/plan";
import { resetDbForTests } from "../db/db";
import { colors, estimateBase } from "../ui";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));

const basePlan: EatingPlanDraft = {
  summary: "My plan",
  meals: [
    {
      name: "Breakfast",
      time: "08:00",
      items: [{ name: "Oats", quantity: 1, unit: "bowl", nutritionPerUnit: { kcal: 137, proteinG: 6, carbsG: 20, fatG: 3 } }],
    },
  ],
};

beforeEach(() => resetDbForTests());

test("Edit mode recomputes totals live and Save PUTs the whole doc", async () => {
  await savePlan(structuredClone(basePlan)); // cache + store in the mock so PUT has a current version
  const putSpy = jest.spyOn(api, "updatePlan");

  await render(<><EatingPlanScreen /><PopHost /></>);

  // View mode: daily total is one serving (~137). ~411 (×3) is nowhere yet.
  expect(screen.getAllByText("~137").length).toBeGreaterThan(0);
  expect(screen.queryByText("~411")).toBeNull();

  // Enter edit, open the portion sheet on the item, type an exact quantity of 3.
  await fireEvent.press(screen.getByText("Edit"));
  await fireEvent.press(screen.getByText("1 × bowl")); // quantity pill → portion sheet
  await fireEvent.changeText(screen.getByLabelText("Exact"), "3");

  // Live local recompute — 137 × 3 = 411 now shows, before any save.
  expect(screen.getAllByText("~411").length).toBeGreaterThan(0);

  // Close the sheet (Done) and Save → single whole-doc PUT with the edited quantity.
  await fireEvent.press(screen.getByText("Done"));
  await fireEvent.press(screen.getByText("Save"));

  expect(putSpy).toHaveBeenCalledTimes(1);
  const putDoc = putSpy.mock.calls[0]![0];
  expect(putDoc.summary).toBe("My plan"); // whole doc, not a partial patch
  expect(putDoc.meals[0]!.items[0]!.quantity).toBe(3);
  // Cache reflects the edit immediately (kv write is synchronous in updatePlan).
  expect(getCachedPlan()!.meals[0]!.items[0]!.quantity).toBe(3);

  putSpy.mockRestore();
});

test("Cancel discards edits (no PUT, cache unchanged)", async () => {
  await savePlan(structuredClone(basePlan));
  const putSpy = jest.spyOn(api, "updatePlan");
  await render(<><EatingPlanScreen /><PopHost /></>);

  await fireEvent.press(screen.getByText("Edit"));
  await fireEvent.press(screen.getByText("1 × bowl"));
  await fireEvent.changeText(screen.getByLabelText("Exact"), "4");
  await fireEvent.press(screen.getByText("Done"));
  await fireEvent.press(screen.getByText("Cancel"));

  expect(putSpy).not.toHaveBeenCalled();
  expect(getCachedPlan()!.meals[0]!.items[0]!.quantity).toBe(1);
  putSpy.mockRestore();
});

test("View mode: tapping an item opens the portion modal and a slider drag persists via the overlay", async () => {
  await savePlan(structuredClone(basePlan)); // items get server ids assigned (mock createPlan)
  const portionSpy = jest.spyOn(api, "putPlanPortions").mockResolvedValue(undefined);
  await render(<><EatingPlanScreen /><PopHost /></>);

  // Open the modal in VIEW mode (no Edit press) on the item pill.
  await fireEvent.press(screen.getByText("1 × bowl"));
  // Numeric exact field commits immediately via the overlay (no Save needed).
  await fireEvent.changeText(screen.getByLabelText("Exact"), "3");

  expect(screen.getAllByText("~411").length).toBeGreaterThan(0); // live update, view mode
  const { getPortions } = require("../db/plan") as typeof import("../db/plan");
  const key = Object.keys(getPortions())[0]!;
  expect(getPortions()[key]).toBe(3); // overlay carries the new qty, keyed by the item id
  portionSpy.mockRestore();
});

/**
 * APP-134 (PLAN R1) — the estimate mark PERSISTS. A number the builder's estimate
 * pass produced is still an estimate on the saved plan, and says so; a number the
 * user typed is a plain number. The `~` on totals is app-wide and predates this.
 */
test("a hand-built plan marks only its estimated numbers", async () => {
  await savePlan({
    summary: "Built here",
    meals: [
      {
        name: "Breakfast",
        time: "08:00",
        items: [
          { name: "Oats", quantity: 60, unit: "g", kcal: 235, kcalEstimated: true },
          { name: "Egg", quantity: 2, unit: "unit", kcal: 156 },
        ],
      },
    ],
  });
  await render(<><EatingPlanScreen /><PopHost /></>);

  // The numbers are there at all — a hand-built item carries no `nutritionPerUnit`.
  const estimated = screen.getByText("~235");
  const typed = screen.getByText("~156");
  expect(estimated).toHaveStyle({ color: colors.estimateInk });
  expect(typed).toHaveStyle({ color: colors.muted });
  // The dashed base is the mark that may not go missing (Android ignores dashed
  // text decoration, so it is a border on the wrapper).
  expect(estimated.parent).toHaveStyle(estimateBase);
  expect(typed.parent).not.toHaveStyle(estimateBase);

  // Meal and day totals: 235 + 156, and both already wear the `~` every plan
  // number wears — a total containing an estimate is itself an estimate.
  expect(screen.getByText("~391 kcal")).toBeOnTheScreen();
  expect(screen.getByText("~391")).toBeOnTheScreen();
});

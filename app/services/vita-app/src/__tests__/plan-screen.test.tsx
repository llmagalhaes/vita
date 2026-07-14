import { fireEvent, render, screen } from "@testing-library/react-native";
import "../i18n";
import EatingPlanScreen from "../../app/(main)/plan";
import { api, type EatingPlanDraft } from "../api";
import { getCachedPlan, savePlan } from "../db/plan";
import { resetDbForTests } from "../db/db";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
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

  await render(<EatingPlanScreen />);

  // View mode: daily total is one serving (137). 411 (×3) is nowhere yet.
  expect(screen.getAllByText("137").length).toBeGreaterThan(0);
  expect(screen.queryByText("411")).toBeNull();

  // Enter edit, open the portion sheet on the item, type an exact quantity of 3.
  await fireEvent.press(screen.getByText("Edit"));
  await fireEvent.press(screen.getByText("1 bowl")); // quantity chip → portion sheet
  await fireEvent.changeText(screen.getByLabelText("Exact"), "3");

  // Live local recompute — 137 × 3 = 411 now shows, before any save.
  expect(screen.getAllByText("411").length).toBeGreaterThan(0);

  // Close the sheet and Save → single whole-doc PUT with the edited quantity.
  await fireEvent.press(screen.getByText("Confirm"));
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
  await render(<EatingPlanScreen />);

  await fireEvent.press(screen.getByText("Edit"));
  await fireEvent.press(screen.getByText("1 bowl"));
  await fireEvent.changeText(screen.getByLabelText("Exact"), "9");
  await fireEvent.press(screen.getByText("Confirm"));
  await fireEvent.press(screen.getByText("Cancel"));

  expect(putSpy).not.toHaveBeenCalled();
  expect(getCachedPlan()!.meals[0]!.items[0]!.quantity).toBe(1);
  putSpy.mockRestore();
});

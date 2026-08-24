/**
 * APP-120…123 — the food builder route, phase by phase (handoff v4.2 §2,
 * criteria 3–7, 9, 10, 12).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../../../i18n";
import BuildPlanScreen from "../../../../app/(main)/build-plan";
import { getCachedPlan, getPlanMeta } from "../../../db/plan";
import { resetDbForTests } from "../../../db/db";
import { getToast } from "../../../ui/toast";

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: jest.fn(), canGoBack: () => true }),
}));

beforeEach(() => {
  resetDbForTests();
  mockBack.mockClear();
  mockReplace.mockClear();
});

/** count → meals with `n` meals, standing on the first meal's open food form. */
async function startWith(n: number) {
  await render(<BuildPlanScreen />);
  await fireEvent.press(screen.getByLabelText(String(n)));
  await fireEvent.press(screen.getByText(`Start with ${n} meals`));
  await screen.findByDisplayValue("Breakfast");
}

/** Type one food into the open form and stack it. */
async function addFood(name: string, qty: string) {
  await fireEvent.changeText(screen.getByPlaceholderText("e.g. Oats"), name);
  await fireEvent.changeText(screen.getByPlaceholderText("60"), qty);
  await fireEvent.press(screen.getByText("Add food"));
}

/** meals → review, filling nothing else in. */
async function toReview(n: number) {
  for (let i = 1; i < n; i++) await fireEvent.press(screen.getByText("Next meal"));
  await fireEvent.press(screen.getByText("Review the plan"));
  await screen.findByText("Your plan, one screen");
}

test("count: the skeleton previews, the chips climb to ten, the CTA opens a ready field", async () => {
  await render(<BuildPlanScreen />);
  expect(screen.getByText("How many times a day do you eat?")).toBeTruthy();
  // Default 5 → the five highest-priority slots, in clock order.
  expect(screen.getByText("Morning snack")).toBeTruthy();
  expect(screen.queryByText("Supper")).toBeNull();

  // + climbs one at a time and a chip with the current value joins the row (criterion 3).
  await fireEvent.press(screen.getByLabelText("+"));
  await fireEvent.press(screen.getByLabelText("+"));
  expect(screen.getByLabelText("7")).toBeTruthy();
  expect(screen.getByText("Pre-workout")).toBeTruthy(); // criterion 4

  await fireEvent.press(screen.getByText("Start with 7 meals"));
  // Criterion 5: the meals phase opens ON the form, not on a button.
  expect(screen.getByPlaceholderText("e.g. Oats")).toBeTruthy();
  expect(screen.getByText("1 of 7")).toBeTruthy();
  // Criterion 7: N + 1 segments, the +1 being the review.
  expect(screen.getByTestId("build-progress").props.children).toHaveLength(8);
});

test("meals: foods stack with the form open, × removes, and there is no kcal field (criterion 6)", async () => {
  await startWith(3);
  await addFood("Oats", "60");
  expect(screen.getByText("Oats")).toBeTruthy();
  expect(screen.getByText("60 g")).toBeTruthy();
  // Still open, and cleared for the next line.
  expect(screen.getByPlaceholderText("e.g. Oats").props.value).toBe("");
  await addFood("Egg", "2");
  expect(screen.getByText("Egg")).toBeTruthy();

  await fireEvent.press(screen.getByLabelText("Remove Oats"));
  expect(screen.queryByText("Oats")).toBeNull();

  // Nothing on this screen asks for a calorie.
  expect(screen.queryByText(/kcal/i)).toBeNull();
  expect(screen.getByText("Calories come at the end, in one pass — no need to know them now.")).toBeTruthy();
});

test("back walks the ladder: review → last meal → first meal → count → out", async () => {
  await startWith(3);
  await toReview(3);

  await fireEvent.press(screen.getByLabelText("Back"));
  await screen.findByText("3 of 3"); // back to the LAST meal step
  await fireEvent.press(screen.getByLabelText("Back"));
  await screen.findByText("2 of 3");
  await fireEvent.press(screen.getByLabelText("Back"));
  await screen.findByText("1 of 3");
  await fireEvent.press(screen.getByLabelText("Back"));
  await screen.findByText("How many times a day do you eat?");
  expect(mockBack).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText("Back"));
  expect(mockBack).toHaveBeenCalled();
});

test("review: the estimate pass fills the empty numbers, marked, and a typed one survives", async () => {
  await startWith(3);
  await addFood("Oats", "60");
  await fireEvent.press(screen.getByText("Next meal"));
  await screen.findByDisplayValue("Lunch");
  await addFood("Rice", "150");
  await fireEvent.press(screen.getByText("Next meal"));
  await fireEvent.press(screen.getByText("Review the plan"));
  await screen.findByText("Your plan, one screen");

  await fireEvent.press(screen.getByText("Fill in the calories for me"));
  expect(screen.getByText("Working through the list…")).toBeTruthy();
  // Criteria 8/9: Oats 60 g → 235, Rice 150 g → 195, both wearing the `~`.
  await screen.findByText("~235", {}, { timeout: 8000 });
  expect(screen.getByText("~195")).toBeTruthy();
  // The day total appears under its eyebrow once there are numbers.
  expect(screen.getByText("A day, as planned")).toBeTruthy();
  expect(screen.getByText("430")).toBeTruthy();
  // The quiet button is gone (`bmEstIdle`); the title/sub have switched.
  expect(screen.queryByText("Fill in the calories for me")).toBeNull();
  expect(screen.getByText("Your plan, with the numbers filled in")).toBeTruthy();

  // Criterion 10: correcting an estimate drops the mark, totals follow.
  await fireEvent.press(screen.getByTestId("kcal-0-0"));
  await fireEvent.changeText(screen.getByTestId("kcal-input"), "300");
  await fireEvent(screen.getByTestId("kcal-input"), "blur");
  await waitFor(() => expect(screen.getByText("495")).toBeTruthy()); // the day total followed
  expect(screen.queryByText("~235")).toBeNull();
  expect(screen.getByTestId("kcal-0-0").props.children).toBe("300"); // solid, no `~`
}, 30000);

test("leaving mid-pass throws nothing (criterion 12)", async () => {
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  await startWith(3);
  await addFood("Oats", "60");
  await toReview(3);
  await fireEvent.press(screen.getByText("Fill in the calories for me"));
  screen.unmount();
  await new Promise((r) => setTimeout(r, 2500));
  expect(err).not.toHaveBeenCalled();
  err.mockRestore();
}, 30000);

test("Finish setup saves a manual, ready plan and toasts the count", async () => {
  await startWith(3);
  await addFood("Oats", "60");
  await toReview(3);
  await fireEvent.press(screen.getByText("Finish setup"));

  expect(getToast()?.text).toBe("3 meals saved — your Day is set up");
  expect(mockBack).toHaveBeenCalled();
  await waitFor(() => expect(getCachedPlan()).not.toBeNull());
  const doc = getCachedPlan()!;
  expect(doc.status).toBe("ready");
  expect(doc.meals).toHaveLength(3);
  expect(doc.meals[0]!.items[0]!.name).toBe("Oats");
  expect(doc.meals[1]!.items).toEqual([]); // an empty meal stays a named slot
  expect(getPlanMeta()?.source).toBe("manual");
});

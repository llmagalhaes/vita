import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../i18n";
import EditPlanScreen from "../../app/(main)/edit-plan";
import { api, type EatingPlanDraft } from "../api";
import { getCachedPlan, savePlan } from "../db/plan";
import { getOverlay, setOverlay } from "../db/dayRecord";
import { dayKey } from "../day/record";
import { resetDbForTests } from "../db/db";
import { ToastHost } from "../ui";

jest.mock("expo-router", () => {
  const goBack = jest.fn();
  return {
    __back: goBack,
    useRouter: () => ({ back: goBack, replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
    useLocalSearchParams: () => ({}),
  };
});
const back = (jest.requireMock("expo-router") as { __back: jest.Mock }).__back;

const plan = (): EatingPlanDraft => ({
  summary: "My plan",
  status: "ready",
  meals: [
    {
      name: "Pre-workout",
      time: "06:40",
      kcal: 109,
      items: [
        { name: "Banana", quantity: 100, unit: "g", nutritionPerUnit: { kcal: 0.89 }, swaps: [{ name: "Pear", quantity: 1, unit: "medium" }] },
        { name: "Honey", quantity: 7, unit: "g", nutritionPerUnit: { kcal: 2.9 } },
      ],
    },
    { name: "Lunch", time: "12:30", items: [{ name: "Rice", quantity: 100, unit: "g", nutritionPerUnit: { kcal: 1.3 } }] },
  ],
});

beforeEach(() => {
  back.mockClear();
  return resetDbForTests();
});

test("live totals, save PUTs the whole doc and clears only today's portion tweaks", async () => {
  await savePlan(plan()); // ids assigned by the mock POST, like the server
  // Today already carries a portion tweak AND a "didn't have it" — one must go, one stays.
  setOverlay(dayKey(), { qty: { "it-1": 120 }, skip: { "it-2": true } });
  const put = jest.spyOn(api, "updatePlan");

  await render(<EditPlanScreen />);

  // Closed cards list their foods and their own kcal (109 = 89 + 20, rounded per item).
  expect(screen.getByText("Banana · Honey")).toBeTruthy();
  expect(screen.getByText("109 kcal")).toBeTruthy();
  expect(screen.getByText("2 meals · 239 kcal a day — nothing is replaced, nothing starts over. Open a meal to rename it, move its time, change portions or drop a food.")).toBeTruthy();
  expect(screen.getByText("Nothing changed yet")).toBeTruthy();

  await fireEvent.press(screen.getByText("Pre-workout"));
  await fireEvent.changeText(screen.getByLabelText("Banana"), "150");

  // Same frame: the item, the meal header and the footer all move.
  expect(screen.getByText("134")).toBeTruthy();
  expect(screen.getByText("154 kcal")).toBeTruthy();
  expect(screen.getByText("Save the changes")).toBeTruthy();

  await fireEvent.press(screen.getByText("Save the changes"));

  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  const doc = put.mock.calls[0]![0];
  expect(doc.meals[0]!.items[0]!.quantity).toBe(150);
  expect(doc.meals[0]!.items[0]!.id).toBe("it-1"); // PUT round-trips ids (BE-058)
  expect(doc.meals[0]!.items[0]!.swaps).toHaveLength(1); // swaps survive an edit
  expect(doc.summary).toBe("My plan"); // whole doc, not a patch
  await waitFor(() => expect(back).toHaveBeenCalled());
  expect(getOverlay(dayKey()).qty).toEqual({});
  expect(getOverlay(dayKey()).skip).toEqual({ "it-2": true }); // a day decision, still true
  put.mockRestore();
});

test("adding a food estimates its calories, keeps the form open, and the unit sticks", async () => {
  await savePlan(plan());
  await render(<EditPlanScreen />);

  await fireEvent.press(screen.getByText("Lunch"));
  await fireEvent.press(screen.getByText("+ Add food"));
  await fireEvent.changeText(screen.getByPlaceholderText("e.g. Greek yogurt"), "Yogurt");
  await fireEvent.changeText(screen.getByPlaceholderText("170"), "170");
  await fireEvent.press(screen.getByText("Add food"));

  // 170 g of yogurt → the food table's 0.72 kcal/g, rounded to a multiple of 5.
  await waitFor(() => expect(screen.getByText("120")).toBeTruthy());
  expect(screen.getByLabelText("Yogurt")).toBeTruthy();
  expect(screen.getByPlaceholderText("e.g. Greek yogurt").props.value).toBe(""); // cleared, still open
  expect(screen.getByText("Add food")).toBeTruthy();
});

test("a new meal opens with its form up, sorts into place at save, and the toast counts meals", async () => {
  await savePlan({ summary: "One", status: "ready", meals: [{ name: "Dinner", time: "19:30", items: [] }] });
  const put = jest.spyOn(api, "updatePlan");
  await render(
    <>
      <EditPlanScreen />
      <ToastHost />
    </>,
  );

  await fireEvent.press(screen.getByText("+ Add a meal"));
  expect(screen.getByText("New meal")).toBeTruthy();
  expect(screen.getByPlaceholderText("e.g. Greek yogurt")).toBeTruthy(); // §2.5: card AND form open

  await fireEvent.press(screen.getByText("Save the changes"));
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  expect(put.mock.calls[0]![0]!.meals.map((m) => m.time)).toEqual(["19:30", "20:00"]); // sorted at save
  expect(await screen.findByText("2 meals saved — your plan is updated")).toBeTruthy();
  put.mockRestore();
});

/**
 * F2 — Save writes the cache and leaves; it must never sit on the network. `updatePlan`
 * does its whole local half before its first await, so a PUT that never answers (a
 * dead tunnel, airplane mode with a captive portal) cannot hold the screen open.
 */
test("Save doesn't wait for the PUT — a hung network still closes the screen", async () => {
  await savePlan(plan());
  const put = jest.spyOn(api, "updatePlan").mockImplementation(() => new Promise(() => {})); // never settles
  await render(<EditPlanScreen />);

  await fireEvent.press(screen.getByText("Pre-workout"));
  await fireEvent.changeText(screen.getByLabelText("Banana"), "150");
  await fireEvent.press(screen.getByText("Save the changes"));

  expect(back).toHaveBeenCalled(); // same tick as the press, no await in between
  expect(getCachedPlan()!.meals[0]!.items[0]!.quantity).toBe(150); // the cache is already the truth
  expect(getOverlay(dayKey()).qty).toEqual({});
  put.mockRestore();
});

/** F6 — an ad-lib swap ("a piece of fruit") states no amount, so it has no per-unit. */
test("a locked ad-lib swap shows no number instead of 0 kcal", async () => {
  const doc = plan();
  doc.meals[0]!.items[0]!.swaps = [{ name: "A piece of fruit" }];
  doc.meals[0]!.items[0]!.usualSwapIndex = 0;
  await savePlan(doc);
  await render(<EditPlanScreen />);

  await fireEvent.press(screen.getByText("Pre-workout"));
  expect(screen.getByText("A piece of fruit")).toBeTruthy();
  expect(screen.getByText("—")).toBeTruthy();
  expect(screen.queryByText("0")).toBeNull();
});

test("back discards the draft silently — no PUT, nothing written", async () => {
  await savePlan(plan());
  const put = jest.spyOn(api, "updatePlan");
  await render(<EditPlanScreen />);

  await fireEvent.press(screen.getByText("Pre-workout"));
  await fireEvent.changeText(screen.getByLabelText("Banana"), "150");
  await fireEvent.press(screen.getByLabelText("Back"));

  expect(back).toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  put.mockRestore();
});

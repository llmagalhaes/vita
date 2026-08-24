import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../i18n";
import { PopHost } from "../ui/popHost";
import PlanSetupScreen from "../../app/(main)/plan-setup";
import { api } from "../api";
import { handoffPlanV3 } from "../api/mock";
import { savePlan } from "../db/plan";
import { listHabits } from "../db/habits";
import { resetDbForTests } from "../db/db";
import { getToast, runToastUndo } from "../ui/toast";

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = { mode: "review" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace, push: mockPush, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
// The recap notifier subscribes to logChanged; keep it inert in these unit tests.
jest.mock("../notify/notifier", () => ({ refreshNotifications: jest.fn() }));

beforeEach(() => {
  resetDbForTests();
  mockReplace.mockClear();
  mockPush.mockClear();
  mockParams = { mode: "review" };
});

async function renderReview() {
  await savePlan({ ...handoffPlanV3(), status: "review" }, "pdf");
  await render(<><PlanSetupScreen /><PopHost /></>);
  // Step 1 = Pre-workout, with the review intro.
  await screen.findByText("Pre-workout");
}

test("parse mode: findings appear then it auto-advances to the review", async () => {
  jest.useRealTimers();
  mockParams = { mode: "parse" };
  await render(<><PlanSetupScreen /><PopHost /></>);
  expect(screen.getByText("Reading your plan…")).toBeTruthy();
  // Real counts from the fetched doc (5 meals; Σ swaps across items + options).
  await screen.findByText(/5 meals · \d+ swap options/, {}, { timeout: 4000 });
  // 1600ms after resolve the review card replaces the parsing card.
  await screen.findByText("Pre-workout", {}, { timeout: 5000 });
}, 15000);

test("selecting a swap makes it the usual (SWAPPED + toast with Undo), Undo restores", async () => {
  await renderReview();
  // Pre-workout → Banana has 20 swaps → open the row.
  await fireEvent.press(screen.getByText("20 swaps"));
  // First 5 inline swaps: pick Pineapple.
  await fireEvent.press(await screen.findByText("Pineapple · 2 medium slices"));

  expect(getToast()?.text).toBe("Your usual is now Pineapple");
  expect(getToast()?.undo).toBeTruthy();
  await screen.findByText("SWAPPED");
  expect(screen.getByText("Pineapple")).toBeTruthy();

  runToastUndo();
  await waitFor(() => expect(screen.queryByText("SWAPPED")).toBeNull());
});

test("switching a meal option resets any open swap row (per-option selections)", async () => {
  await renderReview();
  // Advance to Lunch (step 3): press Looks right twice.
  await fireEvent.press(screen.getByText("Looks right"));
  await screen.findByText("Post-workout");
  await fireEvent.press(screen.getByText("Looks right"));
  await screen.findByText("Lunch");

  // Lunch has options → PICK YOUR USUAL chips render.
  expect(screen.getByText("PICK YOUR USUAL — SWITCH ANY DAY")).toBeTruthy();
  // Open a swap row, then switch to the Brunch option → the open row collapses.
  await fireEvent.press(screen.getAllByText(/swaps$/)[0]!);
  await screen.findByText("Tap one to make it your usual — you can still swap on any single day.");
  await fireEvent.press(screen.getByText(/^Brunch/));
  await waitFor(() => expect(screen.queryByText("Tap one to make it your usual — you can still swap on any single day.")).toBeNull());
});

test("Finish setup creates a habit per ON toggle, PUTs status ready + usuals, navigates to Today", async () => {
  await renderReview();
  const putSpy = jest.spyOn(api, "updatePlan");
  const doc = handoffPlanV3();
  // Walk all 5 meal steps.
  for (let i = 0; i < doc.meals.length; i++) {
    await fireEvent.press(screen.getByText("Looks right"));
  }
  await screen.findByText("Notes & habits");
  await fireEvent.press(screen.getByText("Finish setup"));

  // 1 water + 4 supplements, all default ON.
  await waitFor(() => expect(listHabits().length).toBe(5));
  await waitFor(() => expect(putSpy).toHaveBeenCalled());
  expect(putSpy.mock.calls[0]![0].status).toBe("ready");
  expect(mockReplace).toHaveBeenCalledWith("/day");
  expect(getToast()?.text).toMatch(/Plan ready — 5 meals · 5 new check-ins/);
  putSpy.mockRestore();
});

test("+N more opens the searchable SwapSheet; filter + select closes it with a toast", async () => {
  await renderReview();
  await fireEvent.press(screen.getByText("20 swaps"));
  await fireEvent.press(await screen.findByText("+ 15 more in your plan →"));

  const search = await screen.findByPlaceholderText("Search your plan's options…");
  // Filter to a swap NOT in the inline first-5 list (which stays mounted behind the sheet).
  fireEvent.changeText(search, "watermelon");
  const watermelon = await screen.findByText("Watermelon · 2 slices");
  await fireEvent.press(watermelon);

  expect(getToast()?.text).toBe("Your usual is now Watermelon");
  await waitFor(() => expect(screen.queryByPlaceholderText("Search your plan's options…")).toBeNull());
});

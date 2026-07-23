import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../i18n";
import Today from "../tabs/Today";
import { handoffPlanV3, mockParseProgram } from "../api/mock";
import { kcalLabel, planDailyTotals } from "../plan/compute";
import { getPortions, savePlan, saveProgram, setPortion } from "../db/plan";
import { resetDbForTests } from "../db/db";
import { getToast } from "../ui/toast";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
}));

beforeEach(() => resetDbForTests());

test("meal tab — none state prompts import", async () => {
  await render(<Today />);
  expect(screen.getByText("No meal plan yet")).toBeTruthy();
  expect(screen.getByText("Import a PDF")).toBeTruthy();
});

test("meal tab — review state points at finishing setup", async () => {
  await savePlan({ ...handoffPlanV3(), status: "review" }, "pdf");
  await render(<Today />);
  expect(screen.getByText("Your plan is imported")).toBeTruthy();
  expect(screen.getByText("Continue setup →")).toBeTruthy();
});

test("meal tab — ready state shows the overlay-lens daily total + meals", async () => {
  await savePlan(handoffPlanV3(), "pdf");
  await render(<Today />);
  const total = kcalLabel(planDailyTotals(handoffPlanV3(), {}).kcal);
  expect(screen.getByText(total)).toBeTruthy();
  expect(screen.getByText("Pre-workout")).toBeTruthy();
  expect(screen.getByText("kcal planned today")).toBeTruthy();
});

test("meal tab — a portion override raises the changes banner; Revert clears it", async () => {
  await savePlan(handoffPlanV3(), "pdf");
  setPortion("it-1", 3, 1); // Banana away from its default → one change
  await render(<Today />);
  expect(screen.getByText("1 change for today")).toBeTruthy();

  await fireEvent.press(screen.getByText("Revert"));
  expect(getToast()?.text).toBe("Back to your everyday plan");
  await waitFor(() => expect(Object.keys(getPortions()).length).toBe(0));
});

test("workout tab — skipping an exercise marks OFF TODAY and recomputes the count", async () => {
  await saveProgram(mockParseProgram());
  await render(<Today />);
  await fireEvent.press(screen.getByText("Workout"));

  const day = mockParseProgram().days[0]!;
  expect(screen.getByText(`${day.exercises.length} of ${day.exercises.length} exercises`)).toBeTruthy();

  await fireEvent.press(screen.getByText(day.exercises[0]!.name));
  await screen.findByText("OFF TODAY");
  expect(screen.getByText(`${day.exercises.length - 1} of ${day.exercises.length} exercises`)).toBeTruthy();
  expect(getToast()?.text).toMatch(/Skipped for today/);
});

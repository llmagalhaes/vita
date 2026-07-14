import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../i18n";
import i18n from "../i18n";
import Trends from "../tabs/Trends";
import { resetDbForTests } from "../db/db";
import { addLocalEntry } from "../db/entries";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/trends",
  useLocalSearchParams: () => ({}),
}));

beforeEach(() => resetDbForTests());
const t = (k: string) => i18n.t(k);

function seedSome() {
  addLocalEntry({ type: "meal", occurredAt: new Date().toISOString(), inputMethod: "text", isEstimate: true, detail: { title: "Lunch", items: [], totals: { kcal: 600, proteinG: 30, carbsG: 60, fatG: 20 } } });
  addLocalEntry({ type: "water", occurredAt: new Date().toISOString(), inputMethod: "tap", isEstimate: false, detail: { amountMl: 500 } });
  addLocalEntry({ type: "workout", occurredAt: new Date().toISOString(), inputMethod: "text", isEstimate: true, detail: { title: "Leg day", durationMin: 45, kcal: 320, muscles: ["quads", "glutes"], exercises: [{ name: "Squat", sets: 4, reps: 8, loadKg: 80 }] } });
}

test("Food tab renders the window switch and the calorie/water cards", async () => {
  seedSome();
  await render(<Trends />);
  expect(screen.getByText(t("trends.window.W"))).toBeOnTheScreen();
  expect(screen.getByText(t("trends.window.M"))).toBeOnTheScreen();
  expect(screen.getByText(t("trends.calories"))).toBeOnTheScreen();
  expect(screen.getByText(t("trends.consumedVsSpent"))).toBeOnTheScreen();
  expect(screen.getByText(t("trends.mealTimes"))).toBeOnTheScreen();
  // estimates labeled somewhere on the food tab
  expect(screen.getAllByText(new RegExp(t("common.estimates"))).length).toBeGreaterThan(0);
});

test("Activity tab shows muscle heatmap chips and the workout session list", async () => {
  seedSome();
  await render(<Trends />);
  await fireEvent.press(screen.getByText(t("trends.activity")));
  await waitFor(() => expect(screen.getByText(t("trends.musclesWorked"))).toBeOnTheScreen());
  // ranked muscle chips carry a count (BodyMap fed with the same intensity map)
  expect(screen.getByText(/Quads 1/)).toBeOnTheScreen();
  // the session shows in the workout list
  expect(screen.getByText("Leg day")).toBeOnTheScreen();
});

test("Calories card toggles bars ↔ curve", async () => {
  seedSome();
  await render(<Trends />);
  const toggle = screen.getByText(t("trends.showCurve"));
  await fireEvent.press(toggle);
  expect(screen.getByText(t("trends.showBars"))).toBeOnTheScreen();
});

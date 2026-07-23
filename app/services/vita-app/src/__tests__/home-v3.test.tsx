import { render, screen } from "@testing-library/react-native";
import "../i18n";
import Home from "../tabs/Home";
import { addLocalEntry } from "../db/entries";
import { kvSet } from "../db/kv";
import { resetDbForTests } from "../db/db";
import type { EatingPlanDraft } from "../api";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/home",
}));

const logMeal = () =>
  addLocalEntry({
    type: "meal",
    occurredAt: new Date().toISOString(),
    inputMethod: "voice",
    isEstimate: true,
    detail: { title: "Lunch", items: [], totals: { kcal: 300, proteinG: 10, carbsG: 30, fatG: 8 } },
  });
const logWater = (ml: number) =>
  addLocalEntry({ type: "water", occurredAt: new Date().toISOString(), inputMethod: "tap", isEstimate: false, detail: { amountMl: ml } });

const seedPlan = (status: "ready" | "review") => {
  const doc: EatingPlanDraft = { summary: "Plan", meals: [{ name: "Lunch", time: "13:00", kcal: 700, items: [] }], status } as EatingPlanDraft;
  kvSet("plan.current", doc);
};

beforeEach(() => {
  resetDbForTests();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

test("evening + a log → the recap card shows the recap line", async () => {
  jest.setSystemTime(new Date(2026, 6, 23, 20, 0, 0));
  logMeal();
  logWater(250);
  await render(<Home />);
  expect(screen.getByText("EVENING RECAP")).toBeOnTheScreen();
  expect(screen.getByText("1 meal and 250 ml of water — logged, not judged.")).toBeOnTheScreen();
});

test("morning + a log → the recap card is hidden", async () => {
  jest.setSystemTime(new Date(2026, 6, 23, 10, 0, 0));
  logMeal();
  await render(<Home />);
  expect(screen.queryByText("EVENING RECAP")).toBeNull();
});

test("evening + no logs → the recap is hidden and the morning empty card shows", async () => {
  jest.setSystemTime(new Date(2026, 6, 23, 20, 0, 0));
  await render(<Home />);
  expect(screen.queryByText("EVENING RECAP")).toBeNull();
  expect(screen.getByText("Nothing logged yet")).toBeOnTheScreen();
});

test("empty day with a ready plan → morning card names the first meal", async () => {
  jest.setSystemTime(new Date(2026, 6, 23, 10, 0, 0));
  seedPlan("ready");
  await render(<Home />);
  expect(screen.getByText("Your plan starts with lunch at 13:00. Hold the mic when you eat — or peek at what's ahead.")).toBeOnTheScreen();
});

test("review-status plan → the 'Your meal plan is in' pending banner shows", async () => {
  jest.setSystemTime(new Date(2026, 6, 23, 10, 0, 0));
  seedPlan("review");
  await render(<Home />);
  expect(screen.getByText("Your meal plan is in")).toBeOnTheScreen();
});

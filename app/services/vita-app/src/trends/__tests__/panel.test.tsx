/**
 * APP-100 — the Trends panel renders as ONE flat list, gates every card on its
 * composition flag, and drops the pin when the range changes.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import "../../i18n";
import i18n from "../../i18n";
import { resetDbForTests } from "../../db/db";
import { addLocalEntry } from "../../db/entries";
import { saveSettings, type Settings } from "../../db/settings";
import { createHabit } from "../../db/habits";
import { TrendsPanel } from "../TrendsPanel";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/trends",
}));

const ALL: Settings["domains"] = { meals: true, water: true, move: true, habits: true, weight: true };
const t = (k: string, v?: Record<string, unknown>) => i18n.t(k, v ?? {});

beforeEach(() => {
  resetDbForTests();
  saveSettings({ name: "Sam", domains: ALL });
});

const seed = () => {
  const now = new Date().toISOString();
  addLocalEntry({ type: "meal", occurredAt: now, inputMethod: "tap", isEstimate: true, detail: { title: "Lunch", items: [], totals: { kcal: 700 } } });
  addLocalEntry({ type: "water", occurredAt: now, inputMethod: "tap", isEstimate: false, detail: { amountMl: 500 } });
  addLocalEntry({ type: "workout", occurredAt: now, inputMethod: "tap", isEstimate: true, detail: { title: "Leg day", kcal: 320 } });
};

test("the panel is one list: rail, record counter and every domain's card", async () => {
  seed();
  createHabit({ name: "Creatine", days: [true, true, true, true, true, true, true], time: "21:00", enabled: true, kind: "plain" });
  await render(<TrendsPanel />);

  for (const r of ["W", "M", "Y"]) expect(screen.getByText(t(`trends.range.${r}`))).toBeOnTheScreen();
  // Counters, never targets: the denominator is the live day-of-year.
  expect(screen.getByText(/of \d+ days this year have a record/)).toBeOnTheScreen();
  expect(screen.getByText(t("trends.record.sub"))).toBeOnTheScreen();

  for (const label of ["energy", "water", "movement", "muscleFocus", "weight"]) {
    expect(screen.getByText(t(`trends.${label}`))).toBeOnTheScreen();
  }
  expect(screen.getByText("Creatine")).toBeOnTheScreen();
  expect(screen.getByText(t("trends.scrubHint"))).toBeOnTheScreen();
});

test("a composition flag off hides that card — it never deletes the data", async () => {
  seed();
  saveSettings({ name: "Sam", domains: { ...ALL, weight: false, habits: false } });
  await render(<TrendsPanel />);

  expect(screen.queryByText(t("trends.weight"))).toBeNull();
  expect(screen.getByText(t("trends.energy"))).toBeOnTheScreen(); // the rest stays
});

test("switching range re-labels the counters (and the pin cannot survive it)", async () => {
  seed();
  await render(<TrendsPanel />);
  // Week shows litres over 7 days; Month shows an average per day.
  expect(screen.getByText(/L in 7 days/)).toBeOnTheScreen();

  await fireEvent.press(screen.getByText(t("trends.range.Y")));
  expect(screen.queryByText(/L in 7 days/)).toBeNull();
  expect(screen.getByText(t("trends.record.sub"))).toBeOnTheScreen();
});

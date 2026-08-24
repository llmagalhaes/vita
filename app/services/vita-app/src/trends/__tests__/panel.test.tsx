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
  createHabit({ name: "Creatine", days: [true, true, true, true, true, true, true], time: "21:00", enabled: true });
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

test("switching range re-labels the coverage line (and the pin cannot survive it)", async () => {
  seed();
  await render(<TrendsPanel />);
  // Level 1 with nothing pinned: the average + how much of the range is recorded.
  expect(screen.getAllByText(/average a recorded day · 1 of 7 days recorded/)).toHaveLength(3);

  await fireEvent.press(screen.getByText(t("trends.range.Y")));
  expect(screen.queryByText(/of 7 days recorded/)).toBeNull();
  expect(screen.getAllByText(/of 12 months recorded/)).toHaveLength(3);
});

/**
 * §3's correctness rule: only movement-on-Year is additive. kcal/water Year bars are
 * daily averages by month, and summing twelve of those is a number with no meaning —
 * so those two cards must not offer a Total.
 */
test("Year: Movement totals its sessions, Energy/Water only average", async () => {
  seed();
  await render(<TrendsPanel />);
  await fireEvent.press(screen.getByText(t("trends.range.Y")));

  expect(screen.getAllByText(t("trends.stat.total"))).toHaveLength(1); // movement only
  expect(screen.getAllByText(/average a day, by month/)).toHaveLength(2); // energy + water
  expect(screen.getByText(/average a month/)).toBeOnTheScreen(); // movement
  expect(screen.queryByText(t("trends.stat.perWeek"))).toBeNull(); // a Month card
});

test("Month: every card carries Per week, and none carries a Total", async () => {
  seed();
  await render(<TrendsPanel />);
  await fireEvent.press(screen.getByText(t("trends.range.M")));

  expect(screen.getAllByText(t("trends.stat.perWeek"))).toHaveLength(3);
  expect(screen.queryByText(t("trends.stat.total"))).toBeNull();
});

test("a stat card is navigation: tapping Highest pins that bar", async () => {
  seed();
  await render(<TrendsPanel />);
  await fireEvent.press(screen.getByText(t("trends.range.M")));
  expect(screen.queryByText(t("trends.clear"))).toBeNull(); // nothing pinned yet

  await fireEvent.press(screen.getAllByText(t("trends.stat.highest"))[0]!);
  expect(screen.getAllByText(t("trends.clear"))).toHaveLength(1); // ONE pin, one card
  expect(screen.getByText(/1st highest of 1 recorded days/)).toBeOnTheScreen();
});

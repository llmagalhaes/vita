/**
 * APP-099 — day travel: dock statuses, the calendar month grid, and the past-day
 * cards. The rules under test are product rules, not layout:
 *   1. an untouched past day NEVER reads as failure — it reads as an absence,
 *   2. that absence is drawn as a RING, never a filled "missed" dot,
 *   3. a retro-close is distinguishable from a live close (loggedAt vs the day end),
 *   4. water alone never makes a day "recorded".
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import "../../i18n";
import i18n from "../../i18n";
import type { LogEntry, MealDetail, NewEntry, PlanMeal } from "../../api/client";
import { resetDbForTests } from "../../db/db";
import { addLocalEntry, markSynced, upsertEntry } from "../../db/entries";
import { adoptServerPlan } from "../../db/plan";
import { getDayRecord } from "../../db/dayRecord";
import { getToast } from "../../ui/toast";
import { PastDay, pastRows } from "../PastDay";
import { monthCells, dotStyle } from "../CalendarSheet";
import { dayStatuses, recentStatuses } from "../statuses";
import { dateForOffset, getSelectedDate, getSelectedOffset, offsetForDate, setSelectedOffset } from "../selection";
import { atMinutes, dayKey, emptyDay, mealEntryId, workoutEntryId } from "../record";
import { dotBase } from "../dock/DockDatePicker";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/day",
}));

const t = (k: string, v?: Record<string, unknown>) => i18n.t(k, v ?? {});
const TODAY = new Date();
const back = (n: number) => dateForOffset(n, TODAY);

const PLAN: PlanMeal[] = [
  { id: "m-1", name: "Breakfast", time: "08:00", items: [{ id: "it-1", name: "Oats", quantity: 60, unit: "g", nutritionPerUnit: { kcal: 4 } }] },
  { id: "m-2", name: "Lunch", time: "13:00", items: [{ id: "it-2", name: "Chicken", quantity: 200, unit: "g", nutritionPerUnit: { kcal: 1.65 } }] },
];

const meal = (date: string, planStatus: MealDetail["planStatus"], planMealId = "m-1"): string => {
  const detail: MealDetail = { title: "Breakfast", items: [], totals: { kcal: 300 }, planMealId, planStatus };
  const entry: NewEntry = { type: "meal", occurredAt: atMinutes(date, 8 * 60), inputMethod: "tap", isEstimate: true, detail };
  return upsertEntry(mealEntryId(date, planMealId), entry).id;
};

const water = (date: string, ml: number) =>
  addLocalEntry({ type: "water", occurredAt: atMinutes(date, 10 * 60), inputMethod: "tap", isEstimate: false, detail: { amountMl: ml } });

beforeEach(() => {
  resetDbForTests();
  setSelectedOffset(0);
});

// ── statuses (derived locally from entries — no /days) ───────────────────────

test("a day is as-planned, adjusted, or simply absent — water alone never closes one", () => {
  meal(back(1), "done");
  meal(back(2), "done");
  meal(back(2), "skipped", "m-2");
  water(back(3), 2000);

  const seen = recentStatuses(TODAY, 10);
  expect(seen[back(1)]).toBe("asPlanned");
  expect(seen[back(2)]).toBe("adjusted"); // a recorded skip is a deviation, not a gap
  expect(seen[back(3)]).toBeUndefined(); // drinks only → still unrecorded
  expect(seen[back(4)]).toBeUndefined();
});

test("dayStatuses only reports the days inside the range", () => {
  meal(back(1), "done");
  meal(back(20), "done");
  const start = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 5);
  const end = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + 1);
  expect(Object.keys(dayStatuses(start, end))).toEqual([back(1)]);
});

// ── the dot: an absence is a ring, never a fill ──────────────────────────────

test("the no-record dot is a RING; recorded days fill green / amber", () => {
  expect(dotBase("unrecorded").ring).toBe(true);
  expect(dotBase("asPlanned")).toEqual({ color: "#8CA58A", ring: false });
  expect(dotBase("adjusted")).toEqual({ color: "#C98A3F", ring: false });
  expect(dotBase(undefined).ring).toBe(false); // v3 dock: neutral sand, no status

  expect(dotStyle("unrecorded", false)).toMatchObject({ backgroundColor: "transparent", borderWidth: 1.5 });
  expect(dotStyle("asPlanned", false)).toEqual({ backgroundColor: "#8CA58A" });
  expect(dotStyle("adjusted", false)).toEqual({ backgroundColor: "#C98A3F" });
  // today is not over — no dot at all, not even a ring
  expect(dotStyle("unrecorded", true)).toEqual({ backgroundColor: "transparent" });
});

// ── calendar grid ────────────────────────────────────────────────────────────

test("the month grid pads to the first weekday, flags the future, and carries statuses", () => {
  const day = new Date(2026, 7, 19); // Wed 19 Aug 2026 — the 1st is a Saturday (index 6)
  const cells = monthCells(day, { "2026-08-03": "adjusted" });
  expect(cells.filter((c) => c.date == null)).toHaveLength(6);
  expect(cells.filter((c) => c.date != null)).toHaveLength(31);
  expect(cells.find((c) => c.day === 3 && c.date)!.status).toBe("adjusted");
  expect(cells.find((c) => c.day === 4 && c.date)!.status).toBe("unrecorded");
  expect(cells.find((c) => c.day === 19)!.future).toBe(false);
  expect(cells.find((c) => c.day === 20)!.future).toBe(true);
});

// ── selection (what every "Open this day →" calls) ───────────────────────────

test("offsets and date keys convert both ways, and the setter travels the panel", () => {
  expect(offsetForDate(dateForOffset(4, TODAY), TODAY)).toBe(4);
  setSelectedOffset(3);
  expect(getSelectedDate()).toBe(back(3));
  expect(getSelectedOffset()).toBe(3);
});

// ── past-day rows ────────────────────────────────────────────────────────────

test("pastRows counts, never judges — and says so when the day was closed later", () => {
  const date = back(2);
  const id = meal(date, "done");
  meal(date, "adjusted", "m-2");
  water(date, 1500);
  expect(pastRows(getDayRecord(date))).toEqual([
    [
      { k: "pastDay.rows.meals", v: { count: 1 } },
      { k: "pastDay.rows.adjusted", v: { count: 1 } },
    ],
    [{ k: "pastDay.rows.water", v: { ml: "1,500" } }],
  ]);

  // Same records, but the server received them TODAY → closed later, by you (R2).
  markSynced(id, { id: "srv", occurredAt: atMinutes(date, 8 * 60), updatedAt: new Date().toISOString() } as LogEntry);
  expect(pastRows(getDayRecord(date)).at(-1)).toEqual([{ k: "pastDay.rows.closedLater" }]);

  // A domain switched off hides its row; it never deletes the record.
  expect(pastRows(getDayRecord(date), { water: false })).not.toContainEqual([
    { k: "pastDay.rows.water", v: { ml: "1,500" } },
  ]);
  expect(pastRows(emptyDay(back(3)))).toEqual([]);
});

// ── the screen ───────────────────────────────────────────────────────────────

test("an untouched past day reads as an absence — and retro-close is the only way out", async () => {
  adoptServerPlan({ summary: "test plan", meals: PLAN });
  const date = back(2);
  await render(<PastDay date={date} />);

  expect(screen.getByText(t("pastDay.empty.title"))).toBeTruthy();
  expect(screen.getByText(t("pastDay.empty.caption"))).toBeTruthy();
  expect(screen.getByText(/Vita assumed nothing/)).toBeTruthy();
  // Nothing on this card blames anyone.
  for (const word of [/missed/i, /failed/i, /goal/i, /streak/i]) expect(screen.queryByText(word)).toBeNull();

  fireEvent.press(screen.getByText(t("pastDay.empty.cta")));

  expect(getDayRecord(date).meals.map((m) => m.entryId)).toEqual([mealEntryId(date, "m-1"), mealEntryId(date, "m-2")]);
  expect(getDayRecord(date).meals.every((m) => m.state === "done")).toBe(true);
  expect(getToast()?.text).toBe(t("pastDay.empty.retroToast"));

  // The same panel now shows the day as recorded — by the user, not by Vita.
  expect(await screen.findByText(t("pastDay.closedAsPlanned"))).toBeTruthy();
  expect(screen.getByText(t("pastDay.recordedBy"))).toBeTruthy();
});

test("undoing a retro-close leaves the day quiet again", async () => {
  adoptServerPlan({ summary: "test plan", meals: PLAN });
  const date = back(3);
  await render(<PastDay date={date} />);
  fireEvent.press(screen.getByText(t("pastDay.empty.cta")));
  expect(getDayRecord(date).meals).toHaveLength(2);

  getToast()!.undo!();
  expect(getDayRecord(date).meals).toHaveLength(0);
});

test("a recorded day with no movement offers the log chips, with the honesty caption", async () => {
  const date = back(1);
  meal(date, "done");
  await render(<PastDay date={date} />);

  expect(screen.getByText(t("pastDay.movement.noneLine"))).toBeTruthy();
  expect(screen.getByText(t("pastDay.movement.logCaption"))).toBeTruthy();

  fireEvent.press(screen.getByText(t("pastDay.movement.log", { name: "Leg day" })));
  expect(getDayRecord(date).workout?.entryId).toBe(workoutEntryId(date));
  expect(getToast()?.text).toBe(t("pastDay.movement.loggedToast", { name: "Leg day" }));

  // The map takes over from the chips: "probable muscle use, from that day's program".
  expect(await screen.findByText(t("pastDay.movement.mapCaption"))).toBeTruthy();
  expect(screen.getByText(t("muscle.name.qu"))).toBeTruthy(); // the map's chips came with it
});

test("today is never rendered as a past day", () => {
  expect(dayKey(TODAY)).toBe(back(0));
});

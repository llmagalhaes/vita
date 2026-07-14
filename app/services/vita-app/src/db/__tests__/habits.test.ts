import { resetDbForTests } from "../db";
import { createHabit, deleteHabit, getHabit, listHabits, updateHabit, type HabitInput } from "../habits";

const input = (over: Partial<HabitInput> = {}): HabitInput => ({
  name: "Take creatine",
  days: [true, true, true, true, true, true, true],
  time: "21:00",
  enabled: true,
  kind: "plain",
  ...over,
});

beforeEach(() => resetDbForTests());

test("create → read round-trips the shape (days json, enabled, kind)", () => {
  const h = createHabit(input());
  expect(h.id).toBeTruthy();
  const got = getHabit(h.id)!;
  expect(got.name).toBe("Take creatine");
  expect(got.days).toEqual([true, true, true, true, true, true, true]);
  expect(got.enabled).toBe(true);
  expect(got.kind).toBe("plain");
  expect(got.planMealName).toBeUndefined();
});

test("plan habit keeps its plan-meal link", () => {
  const h = createHabit(input({ kind: "plan", planMealName: "Lunch" }));
  expect(getHabit(h.id)!.planMealName).toBe("Lunch");
});

test("partial update only touches passed fields", () => {
  const h = createHabit(input());
  updateHabit(h.id, { enabled: false });
  const got = getHabit(h.id)!;
  expect(got.enabled).toBe(false);
  expect(got.name).toBe("Take creatine"); // untouched
  expect(got.time).toBe("21:00");
});

test("update days replaces the array", () => {
  const h = createHabit(input());
  updateHabit(h.id, { days: [false, true, false, true, false, true, false] });
  expect(getHabit(h.id)!.days).toEqual([false, true, false, true, false, true, false]);
});

test("list is ordered by creation; delete removes", () => {
  const a = createHabit(input({ name: "A" }));
  const b = createHabit(input({ name: "B" }));
  expect(listHabits().map((h) => h.name)).toEqual(["A", "B"]);
  deleteHabit(a.id);
  expect(listHabits().map((h) => h.name)).toEqual(["B"]);
  expect(getHabit(b.id)).not.toBeNull();
});

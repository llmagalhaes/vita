import type { Api, EatingPlanDraft, NewEntry } from "../../api/client";
import { createMockApi } from "../../api/mock";
import { resetDbForTests } from "../../db/db";
import { entriesForDay, getEntry, upsertCheckin } from "../../db/entries";
import { drainOutbox } from "../../db/outbox";
import { createHabit, type HabitInput } from "../../db/habits";
import { kvSet } from "../../db/kv";
import { answerCheckin, answeredCheckins, dateKey, getCheckin, habitDots, pendingCheckins } from "../checkins";

const everyDay = [true, true, true, true, true, true, true];
const habitInput = (over: Partial<HabitInput> = {}): HabitInput => ({
  name: "Take creatine",
  days: everyDay,
  time: "21:00",
  enabled: true,
  kind: "plain",
  ...over,
});

const checkin = (habitId: string): NewEntry => ({
  type: "checkin",
  occurredAt: new Date().toISOString(),
  inputMethod: "checkin",
  isEstimate: false,
  detail: { habitId, habitName: "Take creatine", kind: "plain", answer: "yes" },
});

beforeEach(() => resetDbForTests());

test("check-in persists via outbox as a `checkin` entry keyed habitId:date", async () => {
  const dk = "2026-07-14";
  upsertCheckin("h1", dk, checkin("h1"));

  // Local write is the display source, keyed deterministically.
  expect(getEntry(`h1:${dk}`)!.type).toBe("checkin");

  const mock = createMockApi();
  const seen: { key: string; type: string }[] = [];
  const spy: Api = {
    ...mock,
    createEntry: (key, entry) => {
      seen.push({ key, type: entry.type });
      return mock.createEntry(key, entry);
    },
  };
  await drainOutbox(spy);
  expect(seen).toEqual([{ key: "h1:2026-07-14", type: "checkin" }]);
});

test("change answer re-answers the same day and PATCHes once synced", async () => {
  const dk = "2026-07-14";
  upsertCheckin("h1", dk, checkin("h1"));
  await drainOutbox(createMockApi()); // first answer synced → serverId set

  // Re-answer "not_quite".
  upsertCheckin("h1", dk, { ...checkin("h1"), detail: { habitId: "h1", habitName: "Take creatine", kind: "plain", answer: "not_quite" } });
  expect((getEntry(`h1:${dk}`)!.detail as { answer: string }).answer).toBe("not_quite");

  const mock = createMockApi();
  let patched = 0;
  const spy: Api = { ...mock, patchEntry: (id, patch) => { patched++; return mock.patchEntry(id, patch); } };
  await drainOutbox(spy);
  expect(patched).toBe(1); // update op, not a duplicate create
});

test("plan check-in answered yes auto-logs the plan's meal", () => {
  const plan: EatingPlanDraft = {
    summary: "demo",
    meals: [
      {
        name: "Lunch",
        items: [{ name: "Chicken", quantity: 150, unit: "g", nutritionPerUnit: { kcal: 1.65, proteinG: 0.31, carbsG: 0, fatG: 0.036 } }],
      },
    ],
  };
  kvSet("plan.current", plan);
  const h = createHabit(habitInput({ kind: "plan", planMealName: "Lunch" }));

  const { loggedMeal } = answerCheckin(h, "yes");
  expect(loggedMeal).toBe(true);

  const meals = entriesForDay(new Date()).filter((e) => e.type === "meal");
  expect(meals).toHaveLength(1);
  expect((meals[0]!.detail as { title?: string }).title).toBe("Lunch");
});

test("pending → answered flip and today's dot fills on yes", () => {
  const h = createHabit(habitInput());
  const today = new Date();
  expect(pendingCheckins([h], today).map((x) => x.id)).toEqual([h.id]);

  answerCheckin(h, "yes");
  expect(pendingCheckins([h], today)).toHaveLength(0);
  expect(answeredCheckins([h], today).map((a) => a.answer)).toEqual(["yes"]);

  const dots = habitDots(h, today);
  expect(dots[13]).toBe("yes"); // today is the last dot
  expect(getCheckin(h.id, dateKey(today))).not.toBeNull();
});

test("a disabled or off-day habit is not pending", () => {
  const disabled = createHabit(habitInput({ enabled: false }));
  const offToday = createHabit(habitInput({ days: [false, false, false, false, false, false, false] }));
  expect(pendingCheckins([disabled, offToday], new Date())).toHaveLength(0);
});

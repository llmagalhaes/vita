import type { Api, NewEntry } from "../../api/client";
import { createMockApi } from "../../api/mock";
import { resetDbForTests } from "../../db/db";
import { getEntry, upsertCheckin } from "../../db/entries";
import { drainOutbox } from "../../db/outbox";
import { createHabit, type HabitInput } from "../../db/habits";
import { onChange } from "../../db/notify";
import { HABIT_ACTION } from "../../notify/notifier";
import { applyCheckinAction, answerCheckin, answeredCheckins, dateKey, getCheckin, habitDots, pendingCheckins } from "../checkins";

const everyDay = [true, true, true, true, true, true, true];
const habitInput = (over: Partial<HabitInput> = {}): HabitInput => ({
  name: "Take creatine",
  days: everyDay,
  time: "21:00",
  enabled: true,
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

test("the answer is readable on the tap tick, the app-wide fan-out is not on it (R18-E)", () => {
  const h = createHabit(habitInput());
  let fanouts = 0;
  const off = onChange(() => fanouts++);

  answerCheckin(h, "yes");
  // Written and visible immediately — the row (and applyCheckinAction's guard) read this.
  expect(getCheckin(h.id, dateKey(new Date()))).not.toBeNull();
  // …but Day/Trends/Library/syncDayClose were NOT re-read on the tap frame.
  expect(fanouts).toBe(0);
  off();
});

// ── APP-136: Yes / No pressed on the notification itself ──────────────────────────
describe("applyCheckinAction", () => {
  test("writes the same check-in the in-app row writes, and the habit stops being pending", () => {
    const h = createHabit(habitInput());
    const today = new Date();

    expect(applyCheckinAction(HABIT_ACTION.yes, h.id)).toBe(true);
    expect((getCheckin(h.id, dateKey(today))!.detail as { answer: string }).answer).toBe("yes");
    expect(pendingCheckins([h], today)).toHaveLength(0);

    const other = createHabit(habitInput({ name: "Stretch" }));
    expect(applyCheckinAction(HABIT_ACTION.no, other.id)).toBe(true);
    expect((getCheckin(other.id, dateKey(today))!.detail as { answer: string }).answer).toBe("no");
  });

  test("the same response applied twice writes once (listener + cold-start replay)", () => {
    const h = createHabit(habitInput());
    expect(applyCheckinAction(HABIT_ACTION.yes, h.id)).toBe(true);
    expect(applyCheckinAction(HABIT_ACTION.yes, h.id)).toBe(false);
    // …and it never overwrites an answer the user already gave in the app.
    answerCheckin(h, "not_quite");
    expect(applyCheckinAction(HABIT_ACTION.yes, h.id)).toBe(false);
    expect((getCheckin(h.id, dateKey(new Date()))!.detail as { answer: string }).answer).toBe("no");
  });

  test("a plain tap or an unknown habit answers nothing", () => {
    const h = createHabit(habitInput());
    expect(applyCheckinAction("expo.modules.notifications.actions.DEFAULT", h.id)).toBe(false);
    expect(applyCheckinAction(HABIT_ACTION.yes, "gone")).toBe(false);
    expect(getCheckin(h.id, dateKey(new Date()))).toBeNull();
  });

  test("the answer lands on the day the reminder FIRED, not on the day it was pressed", () => {
    const h = createHabit(habitInput());
    const firedAt = new Date(2026, 7, 19, 21, 0, 0); // yesterday 21:00
    expect(applyCheckinAction(HABIT_ACTION.yes, h.id, firedAt.getTime())).toBe(true);
    expect(getCheckin(h.id, "2026-08-19")).not.toBeNull();
    expect(getCheckin(h.id, dateKey(new Date()))).toBeNull();
  });
});

test("a disabled or off-day habit is not pending", () => {
  const disabled = createHabit(habitInput({ enabled: false }));
  const offToday = createHabit(habitInput({ days: [false, false, false, false, false, false, false] }));
  expect(pendingCheckins([disabled, offToday], new Date())).toHaveLength(0);
});

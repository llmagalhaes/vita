/**
 * APP-106 — the single day-close notification.
 *
 * The pure half asserts the whole schedule/cancel matrix and the body copy; the live
 * half drives the notifier seam through `syncDayClose` for the three acceptance
 * criteria: exactly one per day, never during a trip, never on a closed day.
 */
import "../../i18n";
import type { EatingPlanDraft } from "../../api/client";
import { resetDbForTests } from "../../db/db";
import { kvSet } from "../../db/kv";
import { saveSettings } from "../../db/settings";
import { startVacation } from "../../db/vacation";
import { setDayClosed } from "../../db/dayRecord";
import { buildMealRecord, dayKey, dayMeals, emptyDay, emptyOverlay, type DayRecord } from "../../day/record";
import { getEntry } from "../../db/entries";
import { mealEntryId } from "../../day/record";
import { isDayClosed } from "../../db/dayRecord";
import { createHabit } from "../../db/habits";
import { dateKey, getCheckin, pendingCheckins } from "../../habits/checkins";
import { applyDayCloseAction, plannedDayClose, startDayClose, syncDayClose } from "../dayClose";
import { DAY_CLOSE_ACTION, HABIT_ACTION, habitNotifId, setNotifier, stubNotifier } from "../notifier";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() }, useRouter: () => ({ replace: jest.fn() }), usePathname: () => "/day" }));

const item = (id: string, name: string, kcal: number) => ({
  id,
  name,
  quantity: 1,
  unit: "serving",
  nutritionPerUnit: { kcal, proteinG: 0, carbsG: 0, fatG: 0 },
});

/** Breakfast 08:00 and Dinner 19:00 — both due by a 20:00 close hour. */
const PLAN: EatingPlanDraft = {
  summary: "test plan",
  meals: [
    { id: "m-1", name: "Breakfast", time: "08:00", items: [item("i-1", "Oats", 200)] },
    { id: "m-2", name: "Dinner", time: "19:00", items: [item("i-2", "Rice", 300)] },
  ],
};

const MEALS = dayMeals(PLAN.meals);
const DATE = "2026-08-19";
const noon = new Date(2026, 7, 19, 12, 0, 0);
const gates = { enabled: true, paused: false, closed: false };
const day = (): DayRecord => emptyDay(DATE);

const plan = (over: Partial<Parameters<typeof plannedDayClose>[0]> = {}) =>
  plannedDayClose({ day: day(), meals: MEALS, now: noon, hour: 20, gates, ...over });

describe("plannedDayClose (pure)", () => {
  test("names every pending meal, adds the one-tap line and the never-assumes footer", () => {
    const p = plan();
    expect(p).not.toBeNull();
    expect(p!.title).toBe("Close your day?");
    expect(p!.body).toBe(
      "Breakfast and Dinner still marked planned. One tap records the rest as it was planned.\n" +
        "Ignoring this leaves the day unrecorded — Vita never assumes.",
    );
    expect(p!.actions).toEqual({ close: "Close as planned", adjust: "I'll adjust" });
    expect(p!.at.getHours()).toBe(20);
    expect(p!.at.getMinutes()).toBe(0);
  });

  test("a recorded meal drops out of the body; all recorded → 'Everything is confirmed.'", () => {
    const one: DayRecord = { ...day(), meals: [buildMealRecord(DATE, PLAN.meals[0]!, "done", emptyOverlay())] };
    expect(plan({ day: one })!.body).toContain("Dinner still marked planned.");
    expect(plan({ day: one })!.body).not.toContain("Breakfast");

    const both: DayRecord = {
      ...day(),
      meals: PLAN.meals.map((m) => buildMealRecord(DATE, m, "done", emptyOverlay())),
    };
    expect(plan({ day: both })!.body).toContain("Everything is confirmed.");
  });

  test("a meal that is not yet due at the close hour is not called pending", () => {
    const late = dayMeals([{ id: "m-3", name: "Supper", time: "23:00", items: [] }]);
    expect(plan({ meals: [...MEALS, ...late] })!.body).not.toContain("Supper");
  });

  test("cancels (null) when off, paused, already closed, planless, or past the hour", () => {
    expect(plan({ gates: { ...gates, enabled: false } })).toBeNull();
    expect(plan({ gates: { ...gates, paused: true } })).toBeNull();
    expect(plan({ gates: { ...gates, closed: true } })).toBeNull();
    expect(plan({ meals: [] })).toBeNull();
    expect(plan({ now: new Date(2026, 7, 19, 21, 0, 0) })).toBeNull();
  });
});

describe("syncDayClose drives the notifier seam", () => {
  const at = (h: number) => new Date(2026, 7, 19, h, 0, 0);

  beforeEach(() => {
    resetDbForTests();
    jest.useFakeTimers();
    jest.setSystemTime(at(12));
    kvSet("plan.current", PLAN);
  });
  afterEach(() => jest.useRealTimers());

  test("schedules exactly one day-close notification for the day", async () => {
    const stub = stubNotifier();
    setNotifier(stub);

    await syncDayClose(at(12));
    expect(stub.calls.dayClose).toHaveLength(1);
    expect(stub.calls.dayClose[0]).not.toBeNull();
    expect(stub.calls.dayClose[0]!.body).toContain("Breakfast and Dinner still marked planned.");
    // A re-sync replaces (cancel + reschedule under one id) — never a second alarm.
    await syncDayClose(at(13));
    expect(stub.calls.dayClose.filter((c) => c !== null)).toHaveLength(2);
    expect(stub.calls.dayClose[1]!.at.getTime()).toBe(stub.calls.dayClose[0]!.at.getTime());
  });

  test("nothing is scheduled during a trip", async () => {
    const stub = stubNotifier();
    setNotifier(stub);
    startVacation("untilEnded", false, at(12)); // itself cancels, via refreshNotifications

    await syncDayClose(at(12));
    expect(stub.calls.dayClose.length).toBeGreaterThan(0);
    expect(stub.calls.dayClose.every((c) => c === null)).toBe(true);
  });

  test("nothing is scheduled once the day is closed", async () => {
    setDayClosed(dayKey(at(12)), true);
    const stub = stubNotifier();
    setNotifier(stub);

    await syncDayClose(at(12));
    expect(stub.calls.dayClose).toEqual([null]);
  });

  test("'Close as planned' records the due meals and closes the day; anything else records nothing", async () => {
    const date = dayKey(at(20));
    applyDayCloseAction("expo.modules.notifications.actions.DEFAULT", date, at(20)); // OS dropped the buttons
    expect(getEntry(mealEntryId(date, "m-1"))).toBeNull();
    expect(isDayClosed(date)).toBe(false);

    applyDayCloseAction(DAY_CLOSE_ACTION.close, date, at(20));
    expect(getEntry(mealEntryId(date, "m-1"))).not.toBeNull();
    expect(getEntry(mealEntryId(date, "m-2"))).not.toBeNull();
    expect(isDayClosed(date)).toBe(true);
  });

  test("the close hour follows the recapStartHour setting", async () => {
    saveSettings({ name: "Lucas", recapStartHour: 21 });
    const stub = stubNotifier();
    setNotifier(stub);

    await syncDayClose(at(12));
    expect(stub.calls.dayClose[0]!.at.getHours()).toBe(21);
  });
});

// ── APP-136: a habit check-in answered from the notification ─────────────────────

describe("startDayClose routes the habit Yes/No buttons", () => {
  beforeEach(() => resetDbForTests());

  test("a Yes from the shade records the check-in and dismisses the notification", () => {
    const stub = stubNotifier();
    setNotifier(stub);
    const h = createHabit({ name: "Ômega-3", days: [true, true, true, true, true, true, true], time: "10:45", enabled: true });
    const stop = startDayClose();

    stub.fire({ actionId: HABIT_ACTION.yes, data: { habitId: h.id }, id: habitNotifId(h.id, 1) });

    expect(getCheckin(h.id, dateKey(new Date()))).not.toBeNull();
    expect(stub.calls.dismissed).toEqual([habitNotifId(h.id, 1)]);
    stop();
  });

  test("an answer pressed while the app was dead is applied at boot, before the card renders", () => {
    const stub = stubNotifier();
    setNotifier(stub);
    const h = createHabit({ name: "Ômega-3", days: [true, true, true, true, true, true, true], time: "10:45", enabled: true });
    stub.queued = { actionId: HABIT_ACTION.no, data: { habitId: h.id }, id: "n1" };

    const stop = startDayClose();
    expect((getCheckin(h.id, dateKey(new Date()))!.detail as { answer: string }).answer).toBe("no");
    expect(pendingCheckins([h], new Date())).toHaveLength(0);

    // …and the same response replayed through the live listener changes nothing.
    stub.fire(stub.queued);
    expect((getCheckin(h.id, dateKey(new Date()))!.detail as { answer: string }).answer).toBe("no");
    stop();
  });
});

// ── M4: the notification is about ONE day, and acting on it must close THAT day ──

describe("the notification carries its own day", () => {
  beforeEach(() => {
    resetDbForTests();
    kvSet("plan.current", PLAN);
  });

  test("the scheduled payload names the day it is about", () => {
    expect(plan()!.date).toBe(DATE);
  });

  test("'Close as planned' tapped the next morning closes YESTERDAY, not the new day", () => {
    const yesterday = dayKey(new Date(2026, 7, 19));
    const today = dayKey(new Date(2026, 7, 20));
    const nextMorning = new Date(2026, 7, 20, 7, 30, 0);

    applyDayCloseAction(DAY_CLOSE_ACTION.close, yesterday, nextMorning);

    // the day the notification was about is closed, every meal on it recorded…
    expect(isDayClosed(yesterday)).toBe(true);
    expect(getEntry(mealEntryId(yesterday, "m-1"))).not.toBeNull();
    expect(getEntry(mealEntryId(yesterday, "m-2"))).not.toBeNull();
    // …and today is untouched — breakfast at 07:30 has NOT been confirmed by anyone.
    expect(isDayClosed(today)).toBe(false);
    expect(getEntry(mealEntryId(today, "m-1"))).toBeNull();
  });

  test("acting on today's notification still records only the meals already due", () => {
    const today = dayKey(new Date(2026, 7, 20));
    applyDayCloseAction(DAY_CLOSE_ACTION.close, today, new Date(2026, 7, 20, 12, 0, 0));
    expect(getEntry(mealEntryId(today, "m-1"))).not.toBeNull(); // 08:00, due
    expect(getEntry(mealEntryId(today, "m-2"))).toBeNull(); // 19:00, has not happened
  });
});

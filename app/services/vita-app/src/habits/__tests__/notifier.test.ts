import { resetDbForTests } from "../../db/db";
import { createHabit, type Habit, type HabitInput } from "../../db/habits";
import {
  ensureNotificationPermission,
  plannedNotifications,
  refreshNotifications,
  setNotifier,
  stubNotifier,
  type Notifier,
} from "../notifier";

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Take creatine",
  days: [false, true, false, false, false, false, false], // Monday only
  time: "07:30",
  enabled: true,
  kind: "plain",
  createdAt: new Date().toISOString(),
  ...over,
});

const input = (over: Partial<HabitInput> = {}): HabitInput => ({
  name: "Stretch",
  days: [true, true, true, true, true, true, true],
  time: "09:00",
  enabled: true,
  kind: "plain",
  ...over,
});

test("plannedNotifications maps day index 0=Sunday to expo weekday 1", () => {
  const [n, ...rest] = plannedNotifications([habit()]);
  expect(rest).toHaveLength(0);
  expect(n).toEqual({
    habitId: "h1",
    title: "Vita",
    body: "Take creatine — a quick check-in",
    kind: "plain",
    weekday: 2,
    hour: 7,
    minute: 30,
  });
});

test("a plan-digest alarm carries the resolved digest body and kind (CEO #7)", () => {
  const digest = habit({ id: "d1", name: "Lunch digest", kind: "digest", planMealName: "Lunch" });
  const [n] = plannedNotifications([digest], (h) =>
    h.kind === "digest" ? `${h.planMealName}, from your plan · 40 g protein` : null,
  );
  expect(n!.kind).toBe("digest");
  expect(n!.body).toBe("Lunch, from your plan · 40 g protein");
});

test("a digest with no resolvable body falls back to a neutral line, never a check-in prompt", () => {
  const [n] = plannedNotifications([habit({ kind: "digest", name: "Lunch" })]);
  expect(n!.body).toBe("Lunch — from your plan");
});

test("plannedNotifications skips disabled habits and invalid times", () => {
  expect(plannedNotifications([habit({ enabled: false })])).toHaveLength(0);
  expect(plannedNotifications([habit({ time: "" })])).toHaveLength(0);
  expect(plannedNotifications([habit({ time: "25:00" })])).toHaveLength(0);
});

test("an every-day habit expands to seven alarms", () => {
  expect(plannedNotifications([habit({ days: [true, true, true, true, true, true, true] })])).toHaveLength(7);
});

test("refreshNotifications drives the injected Notifier with the live habit set", async () => {
  resetDbForTests();
  const stub = stubNotifier();
  setNotifier(stub);
  createHabit(input({ name: "Stretch" }));
  createHabit(input({ name: "Water" }));

  await refreshNotifications();
  expect(stub.calls.sync).toHaveLength(1);
  expect(stub.calls.sync[0]!.map((h) => h.name)).toEqual(["Stretch", "Water"]);
});

test("ensureNotificationPermission only prompts when undetermined", async () => {
  let requested = 0;
  const undetermined: Notifier = {
    getPermission: async () => "undetermined",
    requestPermission: async () => {
      requested++;
      return "granted";
    },
    sync: async () => {},
  };
  setNotifier(undetermined);
  expect(await ensureNotificationPermission()).toBe("granted");
  expect(requested).toBe(1);

  const denied: Notifier = { ...undetermined, getPermission: async () => "denied" };
  setNotifier(denied);
  requested = 0;
  expect(await ensureNotificationPermission()).toBe("denied");
  expect(requested).toBe(0); // never re-prompts
});

test("ensureNotificationPermission never throws when the native module throws (Expo Go crash)", async () => {
  // Repro of the CEO crash: expo-notifications' getPermissionsAsync throws in Expo Go SDK 53+.
  const throwing: Notifier = {
    getPermission: async () => {
      throw new Error("expo-notifications: removed from Expo Go — use a development build");
    },
    requestPermission: async () => "granted",
    sync: async () => {},
  };
  setNotifier(throwing);
  await expect(ensureNotificationPermission()).resolves.toBe("denied");
});

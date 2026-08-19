import "../../i18n";
import { resetDbForTests } from "../../db/db";
import { createHabit, type Habit, type HabitInput } from "../../db/habits";
import { habitBody } from "../dayClose";
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
  createdAt: new Date().toISOString(),
  ...over,
});

const input = (over: Partial<HabitInput> = {}): HabitInput => ({
  name: "Stretch",
  days: [true, true, true, true, true, true, true],
  time: "09:00",
  enabled: true,
  ...over,
});

test("plannedNotifications maps day index 0=Sunday to expo weekday 1", () => {
  const [n, ...rest] = plannedNotifications([habit()], habitBody);
  expect(rest).toHaveLength(0);
  expect(n).toEqual({
    habitId: "h1",
    title: "Vita",
    body: "Take creatine — a quick check-in",
    weekday: 2,
    hour: 7,
    minute: 30,
  });
});

test("plannedNotifications skips disabled habits and invalid times", () => {
  expect(plannedNotifications([habit({ enabled: false })], habitBody)).toHaveLength(0);
  expect(plannedNotifications([habit({ time: "" })], habitBody)).toHaveLength(0);
  expect(plannedNotifications([habit({ time: "25:00" })], habitBody)).toHaveLength(0);
});

test("an every-day habit expands to seven alarms", () => {
  expect(plannedNotifications([habit({ days: [true, true, true, true, true, true, true] })], habitBody)).toHaveLength(7);
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
  // The day-close one-shot is re-scheduled after the cancel-all inside sync().
  expect(stub.calls.dayClose).toHaveLength(1);
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

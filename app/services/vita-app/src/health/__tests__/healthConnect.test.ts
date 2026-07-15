import { resetDbForTests } from "../../db/db";
import { saveSettings, setIntegrationEnabled, type Settings } from "../../db/settings";
import { dayKey } from "../../trends/aggregate";
import { kvSet } from "../../db/kv";
import {
  clearHealthSnapshot,
  connectHealthConnect,
  dayBounds,
  getHealthSnapshot,
  healthActiveKcalToday,
  mapHealthToday,
  refreshHealthConnect,
  setHealthReader,
  stubHealthReader,
  todaysHealthSnapshot,
  type HealthReader,
  type HealthSnapshot,
} from "../healthConnect";

const base: Settings = {
  name: "Sam",
  units: "metric",
  keepTrack: { meals: true, water: true, workouts: true, habits: true, cycle: false },
  connected: { appleHealth: false, healthConnect: false },
};

beforeEach(() => {
  resetDbForTests();
  saveSettings(base);
  setHealthReader(stubHealthReader()); // default: honest absence
});

test("mapHealthToday sums active kcal + steps, counts sessions, tolerates missing fields", () => {
  const snap = mapHealthToday(
    "2026-07-15",
    [{ energy: { inKilocalories: 120.4 } }, { energy: { inKilocalories: 80.1 } }, { energy: {} }, {}],
    [{ count: 3000 }, { count: 1500 }, {}],
    [{}, {}],
    "2026-07-15T10:00:00.000Z",
  );
  expect(snap).toEqual({ date: "2026-07-15", activeKcal: 201, steps: 4500, sessions: 2, readAt: "2026-07-15T10:00:00.000Z" });
});

test("dayBounds spans one local calendar day", () => {
  const { start, end } = dayBounds(new Date("2026-07-15T13:00:00"));
  expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 60 * 60 * 1000);
});

test("healthActiveKcalToday counts a today snapshot but ignores a stale one", () => {
  const today: HealthSnapshot = { date: dayKey(new Date()), activeKcal: 260, steps: 5000, sessions: 1, readAt: "x" };
  kvSet("health.snapshot", today);
  expect(healthActiveKcalToday()).toBe(260);
  expect(todaysHealthSnapshot()?.steps).toBe(5000);

  kvSet("health.snapshot", { ...today, date: "2000-01-01" }); // yesterday's leftovers
  expect(healthActiveKcalToday()).toBe(0);
  expect(todaysHealthSnapshot()).toBeNull();
});

test("stub reader reports unavailable and reads nothing (Expo Go / iOS / jest)", async () => {
  const r = stubHealthReader();
  expect(await r.isAvailable()).toBe(false);
  expect(await r.requestPermissions()).toBe(false);
  expect(await r.readToday()).toBeNull();
});

test("refreshHealthConnect no-ops when the source is disconnected (never touches HC)", async () => {
  const isAvailable = jest.fn().mockResolvedValue(true);
  setHealthReader({ isAvailable, requestPermissions: jest.fn(), readToday: jest.fn() } as HealthReader);
  await refreshHealthConnect(); // healthConnect not enabled
  expect(isAvailable).not.toHaveBeenCalled();
  expect(getHealthSnapshot()).toBeNull();
});

test("connect + refresh caches a snapshot when granted; disconnect clears it", async () => {
  const snap: HealthSnapshot = { date: dayKey(new Date()), activeKcal: 300, steps: 8000, sessions: 2, readAt: "x" };
  const reader: HealthReader = {
    isAvailable: jest.fn().mockResolvedValue(true),
    requestPermissions: jest.fn().mockResolvedValue(true),
    readToday: jest.fn().mockResolvedValue(snap),
  };
  setHealthReader(reader);

  setIntegrationEnabled("healthConnect", true);
  const ok = await connectHealthConnect();
  expect(ok).toBe(true);
  expect(getHealthSnapshot()).toEqual(snap);
  expect(healthActiveKcalToday()).toBe(300);

  clearHealthSnapshot();
  expect(getHealthSnapshot()).toBeNull();
});

test("connect returns false (no data) when Health Connect is unavailable", async () => {
  setHealthReader(stubHealthReader());
  setIntegrationEnabled("healthConnect", true);
  expect(await connectHealthConnect()).toBe(false);
  expect(getHealthSnapshot()).toBeNull();
});

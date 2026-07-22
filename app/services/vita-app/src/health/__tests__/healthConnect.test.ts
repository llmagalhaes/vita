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
  mapSdkStatus,
  refreshHealthConnect,
  setHealthReader,
  stubHealthReader,
  todaysHealthSnapshot,
  type HealthReader,
  type HealthSnapshot,
} from "../healthConnect";

const base: Settings = {
  name: "Sam",
  keepTrack: { meals: true, water: true, workouts: true, habits: true, cycle: false },
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

test("mapSdkStatus honors the platform-module case: 3→available, 2→update_required (APP-070)", () => {
  expect(mapSdkStatus(3)).toBe("available"); // SDK_AVAILABLE
  expect(mapSdkStatus(2)).toBe("update_required"); // present but needs setup/update (Android 14+ false negative)
  expect(mapSdkStatus(1)).toBe("not_installed"); // genuinely absent (old Android)
  expect(mapSdkStatus(0)).toBe("not_installed");
});

test("stub reader reports absent and reads nothing (Expo Go / iOS / jest)", async () => {
  const r = stubHealthReader();
  expect(await r.availability()).toBe("not_installed");
  expect(await r.requestPermissions()).toBe(false);
  expect(await r.readToday()).toBeNull();
});

test("refreshHealthConnect no-ops when the source is disconnected (never touches HC)", async () => {
  const availability = jest.fn().mockResolvedValue("available");
  setHealthReader({ availability, requestPermissions: jest.fn(), readToday: jest.fn(), readSessions: jest.fn().mockResolvedValue([]) } as HealthReader);
  await refreshHealthConnect(); // healthConnect not enabled
  expect(availability).not.toHaveBeenCalled();
  expect(getHealthSnapshot()).toBeNull();
});

test("connect + refresh caches a snapshot when granted; disconnect clears it", async () => {
  const snap: HealthSnapshot = { date: dayKey(new Date()), activeKcal: 300, steps: 8000, sessions: 2, readAt: "x" };
  const reader: HealthReader = {
    availability: jest.fn().mockResolvedValue("available"),
    requestPermissions: jest.fn().mockResolvedValue(true),
    readToday: jest.fn().mockResolvedValue(snap),
    readSessions: jest.fn().mockResolvedValue([]),
  };
  setHealthReader(reader);

  setIntegrationEnabled("healthConnect", true);
  expect(await connectHealthConnect()).toEqual({ ok: true, hasData: true });
  expect(getHealthSnapshot()).toEqual(snap);
  expect(healthActiveKcalToday()).toBe(300);

  clearHealthSnapshot();
  expect(getHealthSnapshot()).toBeNull();
});

test("connect surfaces update_required so the screen can guide instead of failing silently (APP-070)", async () => {
  setHealthReader({
    availability: jest.fn().mockResolvedValue("update_required"),
    requestPermissions: jest.fn(),
    readToday: jest.fn(), readSessions: jest.fn().mockResolvedValue([]) } as HealthReader);
  setIntegrationEnabled("healthConnect", true);
  expect(await connectHealthConnect()).toEqual({ ok: false, reason: "update_required" });
  expect(getHealthSnapshot()).toBeNull();
});

test("connect reports denied when permission is refused (present but not granted)", async () => {
  setHealthReader({
    availability: jest.fn().mockResolvedValue("available"),
    requestPermissions: jest.fn().mockResolvedValue(false),
    readToday: jest.fn(), readSessions: jest.fn().mockResolvedValue([]) } as HealthReader);
  setIntegrationEnabled("healthConnect", true);
  expect(await connectHealthConnect()).toEqual({ ok: false, reason: "denied" });
});

test("connect reports connected-but-no-data (Samsung Health sync off)", async () => {
  setHealthReader({
    availability: jest.fn().mockResolvedValue("available"),
    requestPermissions: jest.fn().mockResolvedValue(true),
    readToday: jest.fn().mockResolvedValue(null),
    readSessions: jest.fn().mockResolvedValue([]),
  } as HealthReader);
  setIntegrationEnabled("healthConnect", true);
  expect(await connectHealthConnect()).toEqual({ ok: true, hasData: false });
});

test("connect reports not_installed on a genuinely absent provider", async () => {
  setHealthReader(stubHealthReader());
  setIntegrationEnabled("healthConnect", true);
  expect(await connectHealthConnect()).toEqual({ ok: false, reason: "not_installed" });
  expect(getHealthSnapshot()).toBeNull();
});

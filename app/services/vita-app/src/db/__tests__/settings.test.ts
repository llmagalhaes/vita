import { api } from "../../api";
import { resetDbForTests } from "../db";
import {
  getSettings,
  integrationEnabled,
  notificationsEnabled,
  recapStartHour,
  saveSettings,
  setIntegrationEnabled,
  setName,
  setNotificationsEnabled,
  setRecapStartHour,
  type Settings,
} from "../settings";

const base: Settings = { name: "Sam" }; // composition flags: see domains.test.ts (APP-095)

beforeEach(() => {
  resetDbForTests();
  saveSettings(base);
  jest.restoreAllMocks();
});

test("setName persists locally AND mirrors to the server", () => {
  const spy = jest.spyOn(api, "patchMe");
  setName("Alex");
  expect(getSettings()!.name).toBe("Alex");
  expect(spy).toHaveBeenCalledWith({ name: "Alex" });
});

test("notifications default on; toggle persists (no backend — local only)", () => {
  const spy = jest.spyOn(api, "patchMe");
  expect(notificationsEnabled()).toBe(true); // field absent → on
  setNotificationsEnabled(false);
  expect(notificationsEnabled()).toBe(false);
  setNotificationsEnabled(true);
  expect(notificationsEnabled()).toBe(true);
  expect(spy).not.toHaveBeenCalled(); // prefs stay local
});

test("recap start hour defaults to 20:00 and round-trips", () => {
  expect(recapStartHour()).toBe(20); // field absent → default 20
  setRecapStartHour(21);
  expect(recapStartHour()).toBe(21);
});

test("integration toggles are device-local prefs", () => {
  expect(integrationEnabled("strava")).toBe(false);
  setIntegrationEnabled("strava", true);
  expect(integrationEnabled("strava")).toBe(true);
  setIntegrationEnabled("strava", false);
  expect(integrationEnabled("strava")).toBe(false);
});

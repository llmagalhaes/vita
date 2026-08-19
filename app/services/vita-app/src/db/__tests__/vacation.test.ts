import { api } from "../../api";
import { dayKey, vacationExcluder } from "../../trends/aggregate";
import { setNotifier, stubNotifier } from "../../habits/notifier";
import { resetDbForTests } from "../db";
import {
  OPEN_ENDED_END,
  endVacation,
  getVacation,
  isVacationActive,
  saveVacation,
  startVacation,
  syncVacation,
  vacationKeepsWater,
  vacationRanges,
} from "../vacation";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

beforeEach(() => {
  resetDbForTests();
  setNotifier(stubNotifier()); // never touch expo-notifications in tests
  jest.restoreAllMocks();
});

test("saveVacation persists the ranges to the backend (replace-on-write, D1)", () => {
  const spy = jest.spyOn(api, "putVacations");
  const ranges = [{ start: dayOffset(-1), end: dayOffset(2) }];
  saveVacation({ ranges, duration: "thisWeek", keepWater: false });
  expect(spy).toHaveBeenCalledWith(ranges); // only the ranges leave the device
  expect(getVacation().ranges).toEqual(ranges); // and cached locally
});

test("isVacationActive is true when today is inside a stored range, false otherwise", () => {
  saveVacation({ ranges: [{ start: dayOffset(-1), end: dayOffset(1) }], duration: "thisWeek", keepWater: false });
  expect(isVacationActive()).toBe(true);
  saveVacation({ ranges: [{ start: dayOffset(-10), end: dayOffset(-5) }], duration: "thisWeek", keepWater: false });
  expect(isVacationActive()).toBe(false);
});

test("the real ranges drive the trends vacation-day excluder", () => {
  saveVacation({ ranges: [{ start: dayOffset(-2), end: dayOffset(0) }], duration: "thisWeek", keepWater: false });
  const isExcluded = vacationExcluder(vacationRanges());
  expect(isExcluded(dayKey(new Date()))).toBe(true); // today is in the trip → hidden
  const before = new Date();
  before.setDate(before.getDate() - 9);
  expect(isExcluded(dayKey(before))).toBe(false); // outside → kept
});

test("endVacation clears the ranges locally and on the server", () => {
  saveVacation({ ranges: [{ start: dayOffset(-1), end: dayOffset(1) }], duration: "thisWeek", keepWater: true });
  const spy = jest.spyOn(api, "putVacations");
  endVacation();
  expect(spy).toHaveBeenCalledWith([]); // server range cleared
  expect(isVacationActive()).toBe(false);
});

test("syncVacation hydrates ranges from the backend on mount", async () => {
  await api.putVacations([{ start: dayOffset(0), end: dayOffset(3) }]); // server has a trip
  expect(getVacation().ranges).toEqual([]); // fresh device: nothing cached
  await syncVacation();
  expect(getVacation().ranges).toEqual([{ start: dayOffset(0), end: dayOffset(3) }]);
  expect(isVacationActive()).toBe(true);
});

// Audit 1.4: an offline start/end of a trip wrote kv then fire-and-forget PUT; the next
// online mount overwrote kv with the server ranges → the offline edit was reverted. The
// dirty flag must keep (and re-push) the local ranges instead of hydrating over them.
test("an offline vacation edit is not reverted by the next hydrate (dirty flag)", async () => {
  const local = [{ start: dayOffset(-1), end: dayOffset(2) }];
  jest.spyOn(api, "putVacations").mockRejectedValue(new Error("offline"));
  saveVacation({ ranges: local, duration: "thisWeek", keepWater: false }); // push fails → dirty

  const getSpy = jest
    .spyOn(api, "getVacations")
    .mockResolvedValue([{ start: dayOffset(-30), end: dayOffset(-28) }]); // stale server set
  await syncVacation();
  expect(getSpy).not.toHaveBeenCalled(); // dirty → never fetched → never clobbered
  expect(getVacation().ranges).toEqual(local); // the offline edit is kept
});

// APP-103 / CEO Q7 — the duration chip IS the range, so expiry is structural: there
// is no timer and no stale "on" flag to sweep. Day 7 is still the trip, day 8 isn't.
test('"This week" covers 7 days and then expires by itself', () => {
  const start = new Date();
  startVacation("thisWeek", false, start);
  const [range] = vacationRanges();
  expect(range).toEqual({ start: dayKey(start), end: dayOffset(6) });

  const day7 = new Date(start);
  day7.setDate(start.getDate() + 6);
  expect(isVacationActive(day7)).toBe(true);
  const day8 = new Date(start);
  day8.setDate(start.getDate() + 7);
  expect(isVacationActive(day8)).toBe(false);
});

test('"Until I end it" never expires on its own — only End clears it', () => {
  const start = new Date();
  startVacation("untilEnded", false, start);
  expect(vacationRanges()[0]!.end).toBe(OPEN_ENDED_END);
  const wayLater = new Date(start);
  wayLater.setFullYear(start.getFullYear() + 5);
  expect(isVacationActive(wayLater)).toBe(true);

  endVacation();
  expect(isVacationActive()).toBe(false);
});

test("keepWater is only true while the trip is actually running", () => {
  startVacation("thisWeek", true);
  expect(getVacation().keepWater).toBe(true);
  expect(vacationKeepsWater()).toBe(true);

  endVacation(); // ranges gone → the flag stops meaning anything
  expect(vacationKeepsWater()).toBe(false);
});

// A pre-v4 profile has neither field; reading it must not produce `undefined`.
test("a config saved before v4 reads back with the v4 defaults", () => {
  saveVacation({ ranges: [] } as never);
  expect(getVacation().duration).toBe("thisWeek");
  expect(getVacation().keepWater).toBe(false);
});

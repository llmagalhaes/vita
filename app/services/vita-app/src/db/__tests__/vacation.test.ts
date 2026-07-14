import { api } from "../../api";
import { dayKey, vacationExcluder } from "../../trends/aggregate";
import { setNotifier, stubNotifier } from "../../habits/notifier";
import { resetDbForTests } from "../db";
import { endVacation, getVacation, isVacationActive, saveVacation, syncVacation, vacationRanges } from "../vacation";

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
  saveVacation({ ranges, keepCheckins: false, tripHabitIds: [] });
  expect(spy).toHaveBeenCalledWith(ranges); // only the ranges leave the device
  expect(getVacation().ranges).toEqual(ranges); // and cached locally
});

test("isVacationActive is true when today is inside a stored range, false otherwise", () => {
  saveVacation({ ranges: [{ start: dayOffset(-1), end: dayOffset(1) }], keepCheckins: false, tripHabitIds: [] });
  expect(isVacationActive()).toBe(true);
  saveVacation({ ranges: [{ start: dayOffset(-10), end: dayOffset(-5) }], keepCheckins: false, tripHabitIds: [] });
  expect(isVacationActive()).toBe(false);
});

test("the real ranges drive the trends vacation-day excluder", () => {
  saveVacation({ ranges: [{ start: dayOffset(-2), end: dayOffset(0) }], keepCheckins: false, tripHabitIds: [] });
  const isExcluded = vacationExcluder(vacationRanges());
  expect(isExcluded(dayKey(new Date()))).toBe(true); // today is in the trip → hidden
  const before = new Date();
  before.setDate(before.getDate() - 9);
  expect(isExcluded(dayKey(before))).toBe(false); // outside → kept
});

test("endVacation clears the ranges locally and on the server", () => {
  saveVacation({ ranges: [{ start: dayOffset(-1), end: dayOffset(1) }], keepCheckins: true, tripHabitIds: [] });
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
  saveVacation({ ranges: local, keepCheckins: false, tripHabitIds: [] }); // push fails → dirty

  const getSpy = jest
    .spyOn(api, "getVacations")
    .mockResolvedValue([{ start: dayOffset(-30), end: dayOffset(-28) }]); // stale server set
  await syncVacation();
  expect(getSpy).not.toHaveBeenCalled(); // dirty → never fetched → never clobbered
  expect(getVacation().ranges).toEqual(local); // the offline edit is kept
});

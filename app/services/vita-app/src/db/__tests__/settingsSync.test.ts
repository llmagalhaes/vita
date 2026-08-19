import { api } from "../../api";
import { setNotifier, stubNotifier } from "../../notify/notifier";
import { resetDbForTests } from "../db";
import { getDomains, setDomains } from "../domains";
import { createHabit, listHabits } from "../habits";
import { getSettings, recapStartHour, saveSettings, setRecapStartHour } from "../settings";
import {
  resetSettingsSync,
  adoptBlob,
  assembleBlob,
  syncSettings,
  type SyncedSettings,
} from "../settingsSync";
import { getVacation } from "../vacation";

/** What a previous device would have left on the server. */
const stored: SyncedSettings = {
  domains: { meals: true, water: false, move: true, habits: true, weight: false },
  notificationsEnabled: false,
  notifRecap: true,
  recapStartHour: 21,
  vacation: { keepWater: true, duration: "untilEnded" },
  planMeta: { source: "pdf", importedAt: "2026-07-23T18:02:11Z" },
  habits: [
    {
      id: "8f2c",
      name: "Tomar remédio",
      days: [true, true, true, true, true, false, false],
      time: "08:00",
      enabled: true,
          createdAt: "2026-07-19T10:00:00Z",
    },
  ],
};

/** Run every pending debounce timer and let the fire-and-forget PUT settle. */
async function settle(): Promise<void> {
  jest.runOnlyPendingTimers();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers();
  resetDbForTests();
  resetSettingsSync();
  setNotifier(stubNotifier()); // never touch expo-notifications
  jest.restoreAllMocks();
  saveSettings({ name: "Sam" });
});

afterEach(() => {
  jest.useRealTimers();
});

test("fresh install: the stored blob is adopted into habits, domains and the prefs", async () => {
  jest.spyOn(api, "getSettings").mockResolvedValue(stored as Record<string, unknown>);
  const put = jest.spyOn(api, "putSettings");

  await syncSettings();

  expect(listHabits()).toEqual(stored.habits); // ids + createdAt verbatim
  expect(getDomains()).toEqual(stored.domains);
  expect(recapStartHour()).toBe(21);
  expect(getSettings()!.notificationsEnabled).toBe(false);
  expect(getSettings()!.name).toBe("Sam"); // the name is /me's, never the blob's
  expect(getVacation()).toMatchObject({ keepWater: true, duration: "untilEnded", ranges: [] });

  await settle();
  expect(put).not.toHaveBeenCalled(); // adopting is not a change
});

test("a local change after hydration pushes ONE debounced PUT with the full blob", async () => {
  jest.spyOn(api, "getSettings").mockResolvedValue({});
  const put = jest.spyOn(api, "putSettings");
  await syncSettings();

  createHabit({ name: "Água", days: [true, true, true, true, true, true, true], time: "10:00", enabled: true });
  setRecapStartHour(22);
  setDomains({ weight: false });
  await settle();

  expect(put).toHaveBeenCalledTimes(1); // three writes, one coalesced request
  const blob = put.mock.calls[0]![0] as SyncedSettings;
  expect(blob).toEqual(assembleBlob());
  expect(blob.recapStartHour).toBe(22);
  expect(blob.domains!.weight).toBe(false);
  expect(blob.habits).toHaveLength(1);
  expect(blob.habits![0]!.name).toBe("Água");
  // Exactly the synced set — no integrations toggle, no UI hints, no name, and no
  // planMeta key at all (no plan was imported in this test).
  expect(Object.keys(blob).sort()).toEqual(["domains", "habits", "recapStartHour", "vacation"]);
});

test("an empty server blob adopts nothing; the first local change is what pushes", async () => {
  jest.spyOn(api, "getSettings").mockResolvedValue({});
  const put = jest.spyOn(api, "putSettings");

  await syncSettings();
  expect(listHabits()).toEqual([]);
  await settle();
  expect(put).not.toHaveBeenCalled(); // nothing changed yet → no request at all

  setRecapStartHour(19);
  await settle();
  expect(put).toHaveBeenCalledTimes(1);
  expect((put.mock.calls[0]![0] as SyncedSettings).recapStartHour).toBe(19);
});

// THE hazard (contract client rule): a fresh install that PUT before its GET resolved
// would overwrite the stored blob with its own defaults and lose everything.
test("no PUT ever happens before the first GET resolves", async () => {
  let resolveGet: (b: Record<string, unknown>) => void = () => {};
  jest.spyOn(api, "getSettings").mockReturnValue(new Promise((r) => { resolveGet = r; }));
  const put = jest.spyOn(api, "putSettings");

  const sync = syncSettings(); // GET in flight, nothing resolved
  setRecapStartHour(7); // the user is already toggling
  createHabit({ name: "Alongar", days: [true, true, true, true, true, true, true], time: "07:00", enabled: true });
  await settle();
  expect(put).not.toHaveBeenCalled();

  resolveGet(stored as Record<string, unknown>);
  await sync;
  await settle();
  expect(put).toHaveBeenCalledTimes(1); // only now, and with the adopted+local state
  expect((put.mock.calls[0]![0] as SyncedSettings).habits).toHaveLength(2); // restored + local
});

test("offline stays unhydrated (never pushes) and hydrates on the retry", async () => {
  const get = jest.spyOn(api, "getSettings").mockRejectedValue(new Error("offline"));
  const put = jest.spyOn(api, "putSettings");

  await syncSettings();
  setRecapStartHour(18);
  await settle();
  expect(put).not.toHaveBeenCalled(); // no GET ⇒ no PUT, ever

  get.mockResolvedValue(stored as Record<string, unknown>);
  await syncSettings();
  await settle();
  // Nothing was dirty (no push ever ran), so the server copy wins — the recovery
  // posture: a blob that was never pushed cannot outrank the one being restored.
  expect(recapStartHour()).toBe(21);
  expect((put.mock.calls.at(-1)![0] as SyncedSettings).recapStartHour).toBe(21);
});

// Audit 1.4 discipline: a change written while the push fails is dirty, and dirty
// local state wins over the server copy on the next launch instead of being adopted over.
test("a failed push stays dirty: the next sync re-pushes instead of adopting", async () => {
  jest.spyOn(api, "getSettings").mockResolvedValue({});
  const put = jest.spyOn(api, "putSettings").mockRejectedValue(new Error("offline"));
  await syncSettings();
  setRecapStartHour(23);
  await settle();
  expect(put).toHaveBeenCalledTimes(1); // tried, failed → dirty

  resetSettingsSync(); // next launch
  jest.spyOn(api, "getSettings").mockResolvedValue(stored as Record<string, unknown>);
  put.mockResolvedValue({});
  await syncSettings();
  expect(recapStartHour()).toBe(23); // the unpushed local edit wins
  await settle();
  expect((put.mock.calls.at(-1)![0] as SyncedSettings).recapStartHour).toBe(23);
});

test("adoptBlob deletes nothing local and tolerates a partial blob", () => {
  createHabit({ name: "Meu", days: [true, false, false, false, false, false, false], time: "09:00", enabled: true });
  adoptBlob({ recapStartHour: 6 });
  expect(listHabits()).toHaveLength(1); // local habit untouched
  expect(recapStartHour()).toBe(6);
  expect(getDomains().meals).toBe(true); // absent field → local default kept
  expect(assembleBlob().vacation).toEqual({ keepWater: false, duration: "thisWeek" });
});

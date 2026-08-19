import type { Api, LogEntry, NewEntry } from "../../api/client";
import { createMockApi } from "../../api/mock";
import { dayKey, mealEntryId } from "../../day/record";
import { recentStatuses } from "../../day/statuses";
import { resetDbForTests } from "../db";
import { addLocalEntry, deleteEntry, entriesForDay, getEntry, upsertEntry } from "../entries";
import { kvGet } from "../kv";
import { drainOutbox } from "../outbox";
import { restoreLog } from "../restore";

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  getInfoAsync: jest.fn(async () => ({ exists: true })),
}));

beforeEach(() => resetDbForTests());

const iso = (hour: number, dayOffset = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const server = (id: string, over: Partial<LogEntry> = {}): LogEntry => ({
  id,
  type: "water",
  occurredAt: iso(9),
  inputMethod: "tap",
  isEstimate: false,
  detail: { amountMl: 250 },
  source: "user",
  loggedAt: iso(9),
  updatedAt: iso(9),
  ...over,
} as LogEntry);

/** An api whose GET /entries serves `pages` in order, recording every call. */
function pagedApi(pages: LogEntry[][], over: Partial<Api> = {}) {
  const calls: Array<{ from?: string; cursor?: string }> = [];
  const api: Api = {
    ...createMockApi(),
    listEntries: async (params) => {
      calls.push({ from: params.from, cursor: params.cursor });
      const i = params.cursor ? Number(params.cursor) : 0;
      const items = pages[i] ?? [];
      return { items, ...(pages[i + 1] ? { nextCursor: String(i + 1) } : {}) };
    },
    ...over,
  };
  return { api, calls };
}

test("fresh install restores two pages silently and marks itself done", async () => {
  const { api, calls } = pagedApi([
    [server("s1"), server("s2", { occurredAt: iso(12) })],
    [server("s3", { occurredAt: iso(9, 1) })],
  ]);

  const { restored } = await restoreLog(api);

  expect(restored).toBe(3);
  expect(calls).toHaveLength(2);
  expect(calls[1]!.cursor).toBe("1");
  // 12-month window
  expect(new Date(calls[0]!.from!).getFullYear()).toBe(new Date().getFullYear() - 1);
  const today = entriesForDay(new Date());
  expect(today).toHaveLength(2);
  expect(today[0]!.syncState).toBe("synced");
  expect(today[0]!.serverId).toBe("s1");
  expect(getEntry("s3")!.serverId).toBe("s3");
  expect(kvGet<string>("restore.done")).toBeTruthy();
});

test("second launch makes zero API calls", async () => {
  const first = pagedApi([[server("s1")]]);
  await restoreLog(first.api);
  expect(first.calls).toHaveLength(1);

  const second = pagedApi([[server("s1"), server("s2")]]);
  const { restored } = await restoreLog(second.api);
  expect(restored).toBe(0);
  expect(second.calls).toHaveLength(0);
  expect(entriesForDay(new Date())).toHaveLength(1);
});

test("a dirty local row (queued create on the same deterministic slot) is never overwritten", async () => {
  const detail = { planMealId: "m-1", planStatus: "done", title: "Local", items: [], totals: { kcal: 10 } };
  const slot = mealEntryId(dayKey(), "m-1");
  upsertEntry(slot, { type: "meal", occurredAt: iso(8), inputMethod: "tap", isEstimate: false, detail } as NewEntry);

  // Offline: the create stays queued, so the local row stays dirty while restore runs.
  const { api } = pagedApi(
    [[server("s9", { type: "meal", occurredAt: iso(8), detail: { ...detail, title: "Server" } } as Partial<LogEntry>)]],
    { createEntry: () => Promise.reject(new Error("offline")) },
  );
  const { restored } = await restoreLog(api);

  expect(restored).toBe(0); // the slot is taken — the restored row collapses onto it
  const meals = entriesForDay(new Date()).filter((e) => e.type === "meal");
  expect(meals).toHaveLength(1);
  expect(getEntry(slot)!.syncState).toBe("pending"); // untouched, still queued
  expect((meals[0]!.detail as { title: string }).title).toBe("Local");
});

test("an already-synced local row is matched by serverId, not duplicated", async () => {
  const e = addLocalEntry({
    type: "water",
    occurredAt: iso(11),
    inputMethod: "tap",
    isEstimate: false,
    detail: { amountMl: 500 },
  });
  await drainOutbox(createMockApi());
  const serverId = getEntry(e.id)!.serverId!;

  const { api } = pagedApi([[server(serverId, { occurredAt: iso(11) })]]);
  expect((await restoreLog(api)).restored).toBe(0);
  expect(entriesForDay(new Date())).toHaveLength(1);
  expect(getEntry(e.id)!.id).toBe(e.id); // the original local uuid survives
});

test("an entry with a queued delete is not resurrected", async () => {
  const e = addLocalEntry({
    type: "water",
    occurredAt: iso(10),
    inputMethod: "tap",
    isEstimate: false,
    detail: { amountMl: 250 },
  });
  await drainOutbox(createMockApi());
  const serverId = getEntry(e.id)!.serverId!;
  deleteEntry(e.id); // queues a `delete` op carrying the server id

  // Offline: the delete can't land, so the server still lists the row.
  const { api } = pagedApi([[server(serverId, { occurredAt: iso(10) })]], {
    deleteEntry: () => Promise.reject(new Error("offline")),
  });
  const { restored } = await restoreLog(api);

  expect(restored).toBe(0);
  expect(entriesForDay(new Date())).toHaveLength(0);
});

test("an interrupted restore resumes from the persisted watermark", async () => {
  const boom = pagedApi([[server("s1")], [server("s2")]]);
  const failing: Api = {
    ...boom.api,
    listEntries: async (p) => {
      if (p.cursor) throw new Error("offline");
      return boom.api.listEntries(p);
    },
  };
  await expect(restoreLog(failing)).rejects.toThrow("offline");
  expect(kvGet<string>("restore.done")).toBeNull();
  expect(kvGet<string>("restore.cursor")).toBe("1");

  const resume = pagedApi([[server("s1")], [server("s2")]]);
  const { restored } = await restoreLog(resume.api);
  expect(resume.calls).toEqual([expect.objectContaining({ cursor: "1" })]); // page 1 not re-fetched
  expect(restored).toBe(1);
  expect(getEntry("s2")).not.toBeNull();
  expect(kvGet<string>("restore.done")).toBeTruthy();
});

test("a restored plan-status meal surfaces in the day status", async () => {
  expect(recentStatuses(new Date(), 1)[dayKey()]).toBeUndefined();

  const { api } = pagedApi([
    [
      server("s1", {
        type: "meal",
        occurredAt: iso(13),
        detail: { planMealId: "m-2", planStatus: "done", title: "Almoço", items: [], totals: { kcal: 640 } },
      } as Partial<LogEntry>),
    ],
  ]);
  await restoreLog(api);

  expect(recentStatuses(new Date(), 1)[dayKey()]).toBe("asPlanned");
});

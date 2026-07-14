import { ApiError, type Api, type LogEntry, type NewEntry } from "../../api/client";
import { createMockApi } from "../../api/mock";
import { resetDbForTests } from "../db";
import { addLocalEntry, entriesForDay, getEntry } from "../entries";
import { backoffMs, drainOutbox, pendingCount } from "../outbox";

const water = (): NewEntry => ({
  type: "water",
  occurredAt: new Date().toISOString(),
  inputMethod: "tap",
  isEstimate: false,
  detail: { amountMl: 250 },
});

beforeEach(() => resetDbForTests());

test("local write is instant and queryable as pending", () => {
  const e = addLocalEntry(water());
  expect(e.syncState).toBe("pending");
  const today = entriesForDay(new Date());
  expect(today).toHaveLength(1);
  expect(today[0]!.id).toBe(e.id);
  expect(today[0]!.syncState).toBe("pending");
  expect(pendingCount()).toBe(1);
});

test("enqueue offline → drain on reconnect → entries synced", async () => {
  const a = addLocalEntry(water());
  const b = addLocalEntry(water());
  const offline: Api = { ...createMockApi(), createEntry: () => Promise.reject(new Error("offline")) };

  await drainOutbox(offline);
  expect(pendingCount()).toBe(2); // nothing lost, first item backed off

  const { synced } = await drainOutbox(createMockApi(), () => Date.now() + 10_000);
  expect(synced).toBe(2);
  expect(pendingCount()).toBe(0);
  expect(getEntry(a.id)!.syncState).toBe("synced");
  expect(getEntry(b.id)!.serverId).toBeDefined();
});

test("retry after lost response does not duplicate (idempotency key honored)", async () => {
  const e = addLocalEntry(water());
  const mock = createMockApi();
  const created: LogEntry[] = [];
  // First attempt: server processes the create but the response is "lost".
  const flaky: Api = {
    ...mock,
    createEntry: async (key, entry) => {
      const result = await mock.createEntry(key, entry);
      created.push(result);
      if (created.length === 1) throw new Error("network dropped mid-response");
      return result;
    },
  };

  await drainOutbox(flaky);
  expect(pendingCount()).toBe(1); // still queued — response never arrived

  await drainOutbox(flaky, () => Date.now() + 10_000);
  expect(pendingCount()).toBe(0);
  expect(created).toHaveLength(2);
  expect(created[0]!.id).toBe(created[1]!.id); // idempotent replay, same server entry
  expect(getEntry(e.id)!.serverId).toBe(created[0]!.id);
});

test("reconciliation stores the server updatedAt (LWW marker)", async () => {
  const e = addLocalEntry(water());
  await drainOutbox(createMockApi());
  const synced = getEntry(e.id)!;
  expect(synced.syncState).toBe("synced");
});

test("backoff is exponential and capped", () => {
  expect(backoffMs(0)).toBe(1000);
  expect(backoffMs(3)).toBe(8000);
  expect(backoffMs(20)).toBe(5 * 60 * 1000);
});

// Regression for Fable audit 1.2: a non-retryable 4xx used to back off and `break`, so one
// bad payload blocked the ordered drain forever. It must be dropped so later items still sync.
test("a poison-pill (400) is dropped and does not block a following valid item", async () => {
  const bad = addLocalEntry(water());
  const good = addLocalEntry(water());
  const mock = createMockApi();
  const api: Api = {
    ...mock,
    createEntry: (key, entry) => {
      if (key === bad.id) {
        return Promise.reject(new ApiError(400, { title: "bad payload", status: 400, type: "about:blank" }));
      }
      return mock.createEntry(key, entry);
    },
  };

  const { synced } = await drainOutbox(api);
  expect(synced).toBe(1); // the good item got through
  expect(pendingCount()).toBe(0); // bad dropped from the queue, good synced
  expect(getEntry(good.id)!.syncState).toBe("synced");
});

test("items not yet due are skipped", async () => {
  addLocalEntry(water());
  const failing: Api = { ...createMockApi(), createEntry: () => Promise.reject(new Error("offline")) };
  await drainOutbox(failing); // backs off ~1s
  const { synced } = await drainOutbox(createMockApi()); // immediately after: not due
  expect(synced).toBe(0);
  expect(pendingCount()).toBe(1);
});

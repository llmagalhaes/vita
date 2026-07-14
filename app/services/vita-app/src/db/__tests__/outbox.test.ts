import { ApiError, type Api, type LogEntry, type NewEntry } from "../../api/client";
import { createMockApi } from "../../api/mock";
import { resetDbForTests } from "../db";
import { addLocalEntry, enqueueInterpretation, entriesForDay, getEntry, getPending, upsertCheckin } from "../entries";
import { backoffMs, drainOutbox, pendingCount } from "../outbox";

// Parked-photo pre-flight (audit 1.2) reads the file system; keep it deterministic.
let mockPhotoFileExists = true;
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  getInfoAsync: jest.fn(async () => ({ exists: mockPhotoFileExists })),
  copyAsync: jest.fn(async () => {}),
}));

const water = (): NewEntry => ({
  type: "water",
  occurredAt: new Date().toISOString(),
  inputMethod: "tap",
  isEstimate: false,
  detail: { amountMl: 250 },
});

const problem = (status: number) => new ApiError(status, { title: "x", status, type: "about:blank" });

beforeEach(() => {
  resetDbForTests();
  mockPhotoFileExists = true;
});

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

// APP-033: an offline capture that couldn't reach /parse is parked as an `interpret`
// op and turned into entries on reconnect — nothing is lost offline.
test("offline interpretation: parked raw text is parsed into entries on drain", async () => {
  enqueueInterpretation({ kind: "text", text: "a banana", capturedAt: new Date().toISOString() });
  expect(pendingCount()).toBe(1); // the interpret op is queued
  expect(entriesForDay(new Date())).toHaveLength(0); // nothing logged yet

  const { synced } = await drainOutbox(createMockApi());
  expect(synced).toBeGreaterThan(0); // the produced entry(ies) reached the server
  expect(pendingCount()).toBe(0); // interpret op + follow-up creates all drained
  const today = entriesForDay(new Date());
  expect(today.length).toBeGreaterThan(0);
  expect(today.every((e) => e.syncState === "synced")).toBe(true);
  // CEO R12 #2: auto-added offline (skipped the confirm sheet) → flagged for review.
  expect(today.every((e) => e.needsReview === true)).toBe(true);
});

test("a plain online add is NOT flagged for review", () => {
  const e = addLocalEntry(water());
  expect(e.needsReview).toBe(false);
  expect(entriesForDay(new Date())[0]!.needsReview).toBe(false);
});

test("offline interpretation that can't be parsed (422) is dropped; a following entry still syncs", async () => {
  const badId = enqueueInterpretation({ kind: "text", text: "???", capturedAt: new Date().toISOString() });
  const good = addLocalEntry(water()); // queued after the poison interpret op
  const mock = createMockApi();
  const api: Api = {
    ...mock,
    parseText: () => Promise.reject(new ApiError(422, { title: "unrecognized", status: 422, type: "about:blank" })),
  };

  const { synced } = await drainOutbox(api);
  expect(synced).toBe(1); // the poison interpret is dropped, the good entry gets through
  expect(pendingCount()).toBe(0);
  expect(getPending(badId)).toBeNull(); // parked input cleaned up too
  expect(getEntry(good.id)!.syncState).toBe("synced");
});

test("offline interpretation backs off on network failure, loses nothing, resolves on reconnect", async () => {
  enqueueInterpretation({ kind: "text", text: "eggs", capturedAt: new Date().toISOString() });
  const offline: Api = { ...createMockApi(), parseText: () => Promise.reject(new Error("offline")) };

  await drainOutbox(offline);
  expect(pendingCount()).toBe(1); // still parked, nothing lost
  expect(entriesForDay(new Date())).toHaveLength(0);

  await drainOutbox(createMockApi(), () => Date.now() + 10_000); // backoff elapsed
  expect(pendingCount()).toBe(0);
  expect(entriesForDay(new Date()).length).toBeGreaterThan(0);
});

test("interpret op drains before entries queued after it (order preserved)", async () => {
  // interpret first, then a plain water entry → both land, interpret's drafts included.
  enqueueInterpretation({ kind: "text", text: "a banana", capturedAt: new Date().toISOString() });
  const w = addLocalEntry(water());

  const { synced } = await drainOutbox(createMockApi());
  expect(pendingCount()).toBe(0);
  expect(getEntry(w.id)!.syncState).toBe("synced");
  // banana meal + water both present
  const types = entriesForDay(new Date()).map((e) => e.type).sort();
  expect(types).toContain("water");
  expect(types).toContain("meal");
  expect(synced).toBeGreaterThanOrEqual(2);
});

// Audit 1.2: a parked photo whose cache file was purged makes parsePhoto throw a
// TypeError (not an ApiError) → pre-fix isPoison missed it → the ordered drain backed
// off forever and nothing behind it synced. The missing-file pre-flight drops it instead.
test("offline photo with a vanished cache file is dropped as poison; a following entry still syncs", async () => {
  mockPhotoFileExists = false;
  const badId = enqueueInterpretation({ kind: "photo", imageUri: "file:///cache/gone.jpg", capturedAt: new Date().toISOString() });
  const good = addLocalEntry(water());
  // A real dead-uri multipart POST rejects with a fetch TypeError, not an ApiError.
  const api: Api = { ...createMockApi(), parsePhoto: () => Promise.reject(new TypeError("Network request failed")) };

  const { synced } = await drainOutbox(api);
  expect(synced).toBe(1); // the poison photo is dropped, the good entry gets through
  expect(pendingCount()).toBe(0);
  expect(getPending(badId)).toBeNull(); // parked input cleaned up
  expect(getEntry(good.id)!.syncState).toBe("synced");
});

test("a parked photo whose file IS present still backs off on a network failure (no over-drop)", async () => {
  mockPhotoFileExists = true;
  enqueueInterpretation({ kind: "photo", imageUri: "file:///doc/here.jpg", capturedAt: new Date().toISOString() });
  const offline: Api = { ...createMockApi(), parsePhoto: () => Promise.reject(new TypeError("Network request failed")) };

  await drainOutbox(offline);
  expect(pendingCount()).toBe(1); // present file + network blip → kept, not dropped
});

// Audit 1.3: a re-answered check-in whose create replays the same deterministic
// Idempotency-Key with a new body gets a 409 by design. Dropping it stranded the new
// answer forever (syncState stuck 'pending', guard blocks any future PATCH). It must
// reconcile against the existing server entry via PATCH so the new answer lands.
test("check-in create that 409s is reconciled via PATCH, landing the new answer", async () => {
  const habitId = "habit-1";
  const dk = "2026-07-14";
  const id = `${habitId}:${dk}`;
  const ck = (answer: string): NewEntry => ({
    type: "checkin",
    occurredAt: new Date().toISOString(),
    inputMethod: "checkin",
    isEstimate: false,
    detail: { habitId, habitName: "H", kind: "plain", answer },
  });
  upsertCheckin(habitId, dk, ck("yes")); // first answer → create op (response was "lost")
  upsertCheckin(habitId, dk, ck("no")); // re-answer while pending → rewrites detail, same op

  const serverCheckin: LogEntry = {
    ...ck("yes"),
    id: "srv-1",
    source: "user",
    loggedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let patched: { id: string; patch: { detail?: unknown; occurredAt?: string } } | null = null;
  const api: Api = {
    ...createMockApi(),
    createEntry: () => Promise.reject(problem(409)), // same key + different body → 409
    listEntries: async () => ({ items: [serverCheckin] }),
    patchEntry: async (sid, patch) => {
      patched = { id: sid, patch };
      return { ...serverCheckin, ...patch, updatedAt: new Date().toISOString() };
    },
  };

  const { synced } = await drainOutbox(api);
  expect(synced).toBe(1);
  expect(patched!.id).toBe("srv-1"); // patched the existing server entry, didn't drop
  expect((patched!.patch.detail as { answer: string }).answer).toBe("no"); // new answer landed
  expect(patched!.patch.occurredAt).toBeDefined(); // audit 1.6 — timestamp shipped too
  expect(getEntry(id)!.syncState).toBe("synced");
  expect(pendingCount()).toBe(0);
});

// Audit 1.5 + 1.8: a PATCH (update op) against a server-deleted entry 404s. Pre-fix,
// 404 wasn't poison for updates → infinite backoff stalled the drain. It must drop and
// mark the entry a terminal 'failed' state (so Home stops the "waiting to sync" lie).
test("update op against a deleted server entry is dropped as failed, not stalled", async () => {
  const habitId = "habit-2";
  const dk = "2026-07-14";
  const id = `${habitId}:${dk}`;
  const ck = (answer: string): NewEntry => ({
    type: "checkin",
    occurredAt: new Date().toISOString(),
    inputMethod: "checkin",
    isEstimate: false,
    detail: { habitId, habitName: "H", kind: "plain", answer },
  });
  upsertCheckin(habitId, dk, ck("yes"));
  await drainOutbox(createMockApi()); // create synced → serverId set
  expect(getEntry(id)!.syncState).toBe("synced");
  upsertCheckin(habitId, dk, ck("no")); // synced re-answer → enqueues an update (PATCH) op
  const good = addLocalEntry(water()); // queued after the update op

  const api: Api = { ...createMockApi(), patchEntry: () => Promise.reject(problem(404)) };
  const { synced } = await drainOutbox(api);
  expect(synced).toBe(1); // the update is dropped, the good entry still gets through
  expect(getEntry(id)!.syncState).toBe("failed"); // terminal, not an eternal 'pending'
  expect(getEntry(good.id)!.syncState).toBe("synced");
  expect(pendingCount()).toBe(0);
});

test("items not yet due are skipped", async () => {
  addLocalEntry(water());
  const failing: Api = { ...createMockApi(), createEntry: () => Promise.reject(new Error("offline")) };
  await drainOutbox(failing); // backs off ~1s
  const { synced } = await drainOutbox(createMockApi()); // immediately after: not due
  expect(synced).toBe(0);
  expect(pendingCount()).toBe(1);
});

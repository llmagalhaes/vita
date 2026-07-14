import { api } from "../../api";
import { mockParsePlan } from "../../api/mock";
import { resetDbForTests } from "../db";
import { getCachedPlan, savePlan, syncPlan, updatePlan } from "../plan";

beforeEach(() => {
  resetDbForTests();
  jest.restoreAllMocks();
});

test("a clean cache hydrates from the server on sync", async () => {
  const serverDoc = mockParsePlan("from server");
  jest.spyOn(api, "getPlan").mockResolvedValue(serverDoc);
  await syncPlan();
  expect(getCachedPlan()?.summary).toBe(serverDoc.summary);
});

// Audit 1.4: an offline plan edit wrote kv then fire-and-forget PUT; the next mount
// unconditionally overwrote kv with the server doc → the edit was silently reverted.
// A dirty flag must keep (and re-push) the local edit instead of hydrating over it.
test("an offline plan edit survives the next hydrate (dirty flag)", async () => {
  jest.spyOn(api, "createPlan").mockImplementation(async (d) => d);
  await savePlan(mockParsePlan("original")); // clean, synced

  const edit = mockParsePlan("offline edit");
  jest.spyOn(api, "updatePlan").mockRejectedValue(new Error("offline"));
  await updatePlan(edit); // PUT fails offline → cache holds the edit, marked dirty
  expect(getCachedPlan()?.summary).toBe(edit.summary);

  const getSpy = jest.spyOn(api, "getPlan").mockResolvedValue(mockParsePlan("stale server"));
  jest.spyOn(api, "updatePlan").mockResolvedValue(edit); // re-push now succeeds
  await syncPlan();
  expect(getSpy).not.toHaveBeenCalled(); // dirty → never fetched → never clobbered
  expect(getCachedPlan()?.summary).toBe(edit.summary);
});

test("once the dirty edit is re-pushed, a later sync hydrates normally again", async () => {
  jest.spyOn(api, "createPlan").mockImplementation(async (d) => d);
  await savePlan(mockParsePlan("original"));
  const edit = mockParsePlan("edit");
  jest.spyOn(api, "updatePlan").mockResolvedValue(edit); // push succeeds → dirty cleared
  await updatePlan(edit);

  const serverDoc = mockParsePlan("newer server");
  jest.spyOn(api, "getPlan").mockResolvedValue(serverDoc);
  await syncPlan();
  expect(getCachedPlan()?.summary).toBe(serverDoc.summary); // clean again → hydrates
});

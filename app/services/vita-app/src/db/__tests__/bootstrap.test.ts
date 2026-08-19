/**
 * C1 regression — the app has exactly one launch-time hydration, and it runs.
 *
 * The APP-108 sweep deleted `src/tabs/Home.tsx`, which held the ONLY call sites of
 * `syncPlan` / `syncProgram` / `syncVacation` / `restoreLog`. Nothing replaced them, so
 * on a clean install the server's plan never loaded (empty timeline, hero 0, no
 * day-close notification), APP-111's restore was dead code, a plan finished while the
 * app was backgrounded was never adopted, and an offline plan edit was never re-pushed.
 */
jest.mock("../plan", () => ({ syncPlan: jest.fn(async () => {}), syncProgram: jest.fn(async () => {}) }));
jest.mock("../vacation", () => ({ syncVacation: jest.fn(async () => {}) }));
jest.mock("../restore", () => ({ restoreLog: jest.fn(async () => ({ restored: 0 })) }));
jest.mock("../../health/healthConnect", () => ({ refreshHealthConnect: jest.fn(async () => {}) }));

import { startAppSync } from "../bootstrap";
import { refreshHealthConnect } from "../../health/healthConnect";
import { syncPlan, syncProgram } from "../plan";
import { restoreLog } from "../restore";
import { syncVacation } from "../vacation";

test("startAppSync hydrates plan, program, vacation and the log", async () => {
  startAppSync();
  await Promise.resolve();
  expect(syncPlan).toHaveBeenCalled();
  expect(syncProgram).toHaveBeenCalled();
  expect(syncVacation).toHaveBeenCalled();
  expect(restoreLog).toHaveBeenCalled();
  expect(refreshHealthConnect).toHaveBeenCalled();
});

test("a failing hydrate never escapes — launch must not depend on the network", async () => {
  (restoreLog as jest.Mock).mockRejectedValueOnce(new Error("offline"));
  expect(() => startAppSync()).not.toThrow();
  await new Promise((r) => setTimeout(r, 0));
});

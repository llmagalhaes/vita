import { resetDbForTests } from "../../db/db";
import { entriesForDay } from "../../db/entries";
import { pendingCount } from "../../db/outbox";
import type { WorkoutDetail } from "../../api/client";
import { logManualEnergy, manualEnergyEntry, parseBurned } from "../manual";

beforeEach(() => resetDbForTests());

test("parseBurned reads the spoken/typed number, else null", () => {
  expect(parseBurned("burned 300")).toBe(300);
  expect(parseBurned("burnt 450 kcal")).toBe(450);
  expect(parseBurned("spent 200 calories")).toBe(200);
  expect(parseBurned("had a banana")).toBeNull();
});

test("manualEnergyEntry is a workout entry with kcal and NO exercises (D8, no new shape)", () => {
  const e = manualEnergyEntry(300);
  expect(e.type).toBe("workout");
  expect(e.isEstimate).toBe(true); // labeled an estimate
  const d = e.detail as WorkoutDetail;
  expect(d.kcal).toBe(300);
  expect(d.exercises).toEqual([]);
});

test("logManualEnergy writes the entry locally and enqueues it for sync (existing outbox path)", () => {
  logManualEnergy(300);
  const today = entriesForDay(new Date()).filter((e) => e.type === "workout");
  expect(today).toHaveLength(1);
  expect((today[0]!.detail as WorkoutDetail).kcal).toBe(300);
  expect(pendingCount()).toBe(1); // rides the same outbox as any entry
});

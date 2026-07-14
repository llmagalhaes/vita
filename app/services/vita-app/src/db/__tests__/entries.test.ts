// Pin TZ so the local-day math is deterministic regardless of the runner's zone.
// Must run before any Date use in this file.
process.env.TZ = "UTC";

import type { NewEntry } from "../../api/client";
import { resetDbForTests } from "../db";
import {
  addLocalEntry,
  clearReview,
  countNeedsReview,
  deleteEntry,
  entriesForDay,
  entriesNeedingReview,
} from "../entries";

beforeEach(() => resetDbForTests());

const water = (): NewEntry => ({
  type: "water",
  occurredAt: new Date().toISOString(),
  inputMethod: "tap",
  isEstimate: false,
  detail: { amountMl: 250 },
});

// Regression for Fable audit 1.1: entriesForDay compared ISO strings lexicographically,
// so an offset-bearing (-05:00) timestamp for an instant that is July 14 in UTC was stored
// with a raw "2026-07-13T..." prefix and sorted out of the July-14 range → the entry vanished.
// addLocalEntry now canonicalizes to a UTC instant (…Z), so it lands in the right day.
test("an offset-bearing timestamp near a day boundary lands in the correct local day", () => {
  const instant = new Date("2026-07-14T00:30:00.000Z"); // July 14 in UTC (the pinned TZ)
  const offsetForm = "2026-07-13T19:30:00.000-05:00"; // same instant, wall-clock in a -05:00 zone

  const entry: NewEntry = {
    type: "water",
    occurredAt: offsetForm,
    inputMethod: "tap",
    isEstimate: false,
    detail: { amountMl: 250 },
  };
  addLocalEntry(entry);

  expect(entriesForDay(instant)).toHaveLength(1); // the correct day (July 14)
  const prevDay = new Date(instant);
  prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  expect(entriesForDay(prevDay)).toHaveLength(0); // not the raw-string day (July 13)
});

// Offline-review banner (CEO R12 #2): the count/flag drive Home's "N added — review" banner.
test("a normal add is not flagged; an offline auto-add is (needsReview)", () => {
  addLocalEntry(water()); // online confirm path
  expect(countNeedsReview()).toBe(0);

  const flagged = addLocalEntry(water(), true); // interpretPending's reconnect auto-add
  expect(countNeedsReview()).toBe(1);
  expect(flagged.needsReview).toBe(true);
  expect(entriesNeedingReview().map((e) => e.id)).toEqual([flagged.id]);
});

test("Keep clears the flag and empties the banner", () => {
  const e = addLocalEntry(water(), true);
  expect(countNeedsReview()).toBe(1);

  clearReview(e.id);
  expect(countNeedsReview()).toBe(0);
  expect(entriesNeedingReview()).toHaveLength(0);
  expect(entriesForDay(new Date())).toHaveLength(1); // kept in the log
});

test("Discard deletes the entry and empties the banner", () => {
  const e = addLocalEntry(water(), true);
  expect(countNeedsReview()).toBe(1);

  deleteEntry(e.id);
  expect(countNeedsReview()).toBe(0);
  expect(entriesForDay(new Date())).toHaveLength(0); // gone from the log too
});

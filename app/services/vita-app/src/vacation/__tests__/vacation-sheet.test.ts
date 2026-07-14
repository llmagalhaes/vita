process.env.TZ = "Europe/Amsterdam"; // regression guard: +offset zone where local-parse bit

import { isValidDate } from "../VacationSheet";

test("isValidDate accepts calendar dates regardless of timezone (CEO bug #2)", () => {
  // Old code parsed as local time then compared to a UTC ISO string, so in a +offset zone
  // every valid date failed the round-trip and "Start vacation mode" stayed disabled.
  expect(isValidDate("2026-07-14")).toBe(true);
  expect(isValidDate("2026-07-27")).toBe(true);
  expect(isValidDate("2026-01-01")).toBe(true);
  expect(isValidDate("2026-12-31")).toBe(true);
});

test("isValidDate rejects malformed and impossible dates", () => {
  expect(isValidDate("2026-7-14")).toBe(false); // not zero-padded
  expect(isValidDate("2026-02-30")).toBe(false); // Feb 30 rolls over
  expect(isValidDate("2026-13-01")).toBe(false); // month 13
  expect(isValidDate("not-a-date")).toBe(false);
});

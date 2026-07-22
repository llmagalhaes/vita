import type { LocalEntry } from "../../db/entries";
import type { HcSession } from "../../health/healthConnect";
import { exerciseTypeKey, mergeHistory } from "../history";

const entry = (id: string, occurredAt: string, title: string, kcal?: number): LocalEntry =>
  ({ id, type: "workout", occurredAt, inputMethod: "text", isEstimate: true, syncState: "synced", needsReview: false, detail: { title, muscles: ["quads"], durationMin: 40, kcal } }) as LocalEntry;

const session = (id: string, start: string, end: string, exerciseType: number | null, title: string | null = null): HcSession => ({ id, start, end, title, exerciseType });

const titleOf = (s: HcSession) => s.title ?? `type-${exerciseTypeKey(s.exerciseType)}`;

test("mergeHistory orders newest-first and labels sources; HC rows carry no kcal", () => {
  const rows = mergeHistory(
    [entry("a", "2026-07-08T09:00:00Z", "Push day", 380), entry("b", "2026-07-11T09:00:00Z", "Leg day", 430)],
    [session("s1", "2026-07-10T07:00:00Z", "2026-07-10T07:45:00Z", 56)],
    titleOf,
  );
  expect(rows.map((r) => r.title)).toEqual(["Leg day", "type-running", "Push day"]); // 11 > 10 > 08
  expect(rows[0]!.source).toBe("capture");
  expect(rows[0]!.kcal).toBe(430);
  const hc = rows.find((r) => r.source === "healthConnect")!;
  expect(hc.kcal).toBeUndefined(); // never faked
  expect(hc.durationMin).toBe(45); // 07:00 → 07:45
  expect(hc.muscles).toEqual([]);
});

test("exerciseTypeKey maps known codes and falls back to 'other'", () => {
  expect(exerciseTypeKey(56)).toBe("running");
  expect(exerciseTypeKey(79)).toBe("walking");
  expect(exerciseTypeKey(70)).toBe("strength");
  expect(exerciseTypeKey(83)).toBe("yoga");
  expect(exerciseTypeKey(9999)).toBe("other");
  expect(exerciseTypeKey(null)).toBe("other");
});

test("mergeHistory with no HC sessions (stub path) = captured only, no crash", () => {
  const rows = mergeHistory([entry("a", "2026-07-08T09:00:00Z", "Push day", 380)], [], titleOf);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.source).toBe("capture");
});

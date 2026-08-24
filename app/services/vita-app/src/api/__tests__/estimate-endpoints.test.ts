/**
 * APP-131 — the two v4.2 estimate endpoints: the client speaks the contract paths,
 * and the mock answers in the contract's shape (mock mode must be walkable).
 */
import { createHttpApi } from "../client";
import { createMockApi } from "../mock";

const mock = createMockApi();

describe("mock /estimate/exercise-muscles", () => {
  it("reads the catalog and splits roles at .7 — the same cut as tierOf", async () => {
    const { items } = await mock.estimateExerciseMuscles({ names: ["Squat"] });
    expect(items[0]).toEqual({
      // qu 1 and gl .85 are primary, co .3 is not (criterion 18's weights)
      muscleRoles: [
        { name: "quads", role: "primary" },
        { name: "glutes", role: "primary" },
        { name: "core", role: "secondary" },
      ],
      wholeBody: false,
      estimated: false, // curated catalog entry — not a guess
    });
  });

  it("fans the shared arm capsule out to both wire muscles", async () => {
    const { items } = await mock.estimateExerciseMuscles({ names: ["Biceps curl"] });
    expect(items[0]!.muscleRoles).toEqual([
      { name: "biceps", role: "primary" },
      { name: "triceps", role: "primary" },
    ]);
  });

  it("flags a whole-body activity and keeps its split secondary", async () => {
    const { items } = await mock.estimateExerciseMuscles({ names: ["Football"] });
    expect(items[0]!.wholeBody).toBe(true);
    expect(items[0]!.muscleRoles.every((m) => m.role === "secondary")).toBe(true);
  });

  it("answers a name outside the catalog with nothing — 'not mapped', never a guess", async () => {
    const { items } = await mock.estimateExerciseMuscles({ names: ["Pole dance"] });
    expect(items[0]).toEqual({ muscleRoles: [], wholeBody: false, estimated: true });
  });

  it("is positional — same length, same order", async () => {
    const { items } = await mock.estimateExerciseMuscles({ names: ["Pole dance", "Squat"] });
    expect(items).toHaveLength(2);
    expect(items[0]!.muscleRoles).toEqual([]);
    expect(items[1]!.muscleRoles.length).toBeGreaterThan(0);
  });
});

describe("mock /estimate/workout-kcal", () => {
  it("returns one number for the whole day, rounded to a multiple of 5 and always flagged", async () => {
    // 4×8×.5 = 16, 30×6 = 180 → 196 → 195
    const out = await mock.estimateWorkoutKcal({
      exercises: [
        { name: "Squat", fam: "set", sets: 4, reps: 8 },
        { name: "Muay thai", fam: "time", min: 30 },
      ],
    });
    expect(out).toEqual({ kcal: 195, estimated: true });
    expect(out.kcal % 5).toBe(0);
  });

  it("never comes back under the floor of 5", async () => {
    await expect(mock.estimateWorkoutKcal({ exercises: [{ name: "Plank" }] })).resolves.toEqual({
      kcal: 5,
      estimated: true,
    });
  });
});

test("the http client posts both to their contract paths", async () => {
  const ok = { ok: true, status: 200, json: async () => ({}), text: async () => "{}" } as unknown as Response;
  const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(ok);
  const http = createHttpApi("https://api.test/v1");

  await http.estimateExerciseMuscles({ names: ["Squat"] });
  await http.estimateWorkoutKcal({ exercises: [{ name: "Squat", sets: 3, reps: 10 }] });

  expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
    "https://api.test/v1/estimate/exercise-muscles",
    "https://api.test/v1/estimate/workout-kcal",
  ]);
  fetchMock.mockRestore();
});

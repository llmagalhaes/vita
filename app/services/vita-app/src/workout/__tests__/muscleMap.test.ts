import type { Exercise } from "../../api/client";
import { exercisesForMuscle, muscleIntensities } from "../muscleExercises";
import { resolveHighlights, shapesCenter, sideOf } from "../../ui/BodyMap";

// Leg-day fixture with per-exercise muscleRoles (handoff §2.2) — built in-test.
const LEG_DAY: Exercise[] = [
  { name: "Back squat", muscleRoles: [{ name: "quads", role: "primary" }, { name: "glutes", role: "primary" }, { name: "core", role: "secondary" }] },
  { name: "Leg press", muscleRoles: [{ name: "quads", role: "primary" }] },
  { name: "Romanian deadlift", muscleRoles: [{ name: "glutes", role: "primary" }, { name: "hamstrings", role: "primary" }] },
  { name: "Walking lunges", muscleRoles: [{ name: "quads", role: "primary" }, { name: "glutes", role: "primary" }, { name: "core", role: "secondary" }] },
  { name: "Seated calf raise", muscleRoles: [{ name: "calves", role: "secondary" }] },
  { name: "Leg curl", muscleRoles: [{ name: "hamstrings", role: "primary" }] },
];

test("muscleIntensities reproduces the handoff primary tier (quads/glutes .92, hams .78)", () => {
  const it = muscleIntensities(LEG_DAY);
  expect(it.quads).toEqual({ role: "primary", opacity: 0.92 }); // primary ×3
  expect(it.glutes).toEqual({ role: "primary", opacity: 0.92 }); // primary ×3
  expect(it.hamstrings).toEqual({ role: "primary", opacity: 0.78 }); // primary ×2
  expect(it.core).toEqual({ role: "secondary", opacity: 0.62 }); // secondary ×2 (A9 deviation)
  expect(it.calves).toEqual({ role: "secondary", opacity: 0.3 }); // secondary ×1 (A9 deviation)
});

test("muscleIntensities falls back to the first-listed muscles heuristic; empty → {}", () => {
  const flat: Exercise[] = [{ name: "Squat", muscles: ["quads", "glutes"] }];
  const it = muscleIntensities(flat);
  expect(it.quads?.role).toBe("primary"); // first-listed → primary
  expect(it.glutes?.role).toBe("secondary");
  expect(muscleIntensities([])).toEqual({});
});

test("exercisesForMuscle resolves hits from muscleRoles (roles-only exercises)", () => {
  const hits = exercisesForMuscle(LEG_DAY, "quads");
  expect(hits.map((h) => h.exercise.name)).toEqual(["Back squat", "Leg press", "Walking lunges"]);
  expect(hits.every((h) => h.role === "primary")).toBe(true);
});

test("resolveHighlights: absolute passes opacity through; selected boosts + dims", () => {
  const abs = resolveHighlights("front", { quads: 0.92 }, true, null);
  const quads = abs.find((r) => r.muscle === "quads")!;
  expect(quads.opacity).toBe(0.92);
  const others = abs.find((r) => r.muscle === "chest")!;
  expect(others.opacity).toBe(0.14); // absent → idle

  const sel = resolveHighlights("front", { quads: 0.92, core: 0.62 }, true, "quads");
  expect(sel.find((r) => r.muscle === "quads")!.opacity).toBe(1); // selected → full
  expect(sel.find((r) => r.muscle === "core")!.opacity).toBeCloseTo(0.62 * 0.3, 5); // dimmed
});

test("sideOf: front-only stays, back-only flips, both-sides never flips", () => {
  expect(sideOf("quads", "front")).toBe("front"); // quads live on front
  expect(sideOf("quads", "back")).toBe("front"); // not on back → flip
  expect(sideOf("glutes", "front")).toBe("back"); // glutes only on back → flip
  expect(sideOf("calves", "front")).toBe("front"); // calves on both → stay
  expect(sideOf("calves", "back")).toBe("back");
});

test("shapesCenter is the combined-bbox center of a bilateral muscle", () => {
  const c = shapesCenter([
    { k: "e", cx: 85, cy: 250, rx: 13, ry: 40 },
    { k: "e", cx: 115, cy: 250, rx: 13, ry: 40 },
  ]);
  expect(c).toEqual({ cx: 100, cy: 250 }); // midpoint between the two thighs
});

import type { Exercise } from "../../api/client";
import { exercisesForMuscle, hasPerExerciseMuscles, overallRole } from "../muscleExercises";

const legDay: Exercise[] = [
  { name: "Back squat", sets: 4, reps: 8, loadKg: 80, muscles: ["quads", "glutes"] },
  { name: "Leg press", sets: 3, reps: 12, muscles: ["quads"] },
  { name: "Romanian deadlift", sets: 3, reps: 10, loadKg: 60, muscles: ["hamstrings", "glutes"] },
  { name: "Seated calf raise", sets: 4, reps: 15, muscles: ["calves"] },
];

test("returns the exercises that worked a muscle, preserving list order + index", () => {
  const hits = exercisesForMuscle(legDay, "quads");
  expect(hits.map((h) => h.exercise.name)).toEqual(["Back squat", "Leg press"]);
  expect(hits.map((h) => h.index)).toEqual([0, 1]);
});

test("PRIMARY when first-listed on the exercise, secondary otherwise", () => {
  const glutes = exercisesForMuscle(legDay, "glutes");
  // glutes is 2nd on both Back squat and Romanian deadlift → secondary on both
  expect(glutes.map((h) => h.role)).toEqual(["secondary", "secondary"]);
  expect(overallRole(glutes)).toBe("secondary");

  const calves = exercisesForMuscle(legDay, "calves");
  expect(calves.map((h) => h.role)).toEqual(["primary"]);
  expect(overallRole(calves)).toBe("primary");

  // quads leads Leg press even though it's secondary… no — quads is primary on both
  expect(overallRole(exercisesForMuscle(legDay, "quads"))).toBe("primary");
});

test("a muscle no exercise worked yields no hits", () => {
  expect(exercisesForMuscle(legDay, "chest")).toEqual([]);
  expect(overallRole([])).toBe("secondary");
});

test("hasPerExerciseMuscles distinguishes new data from older/seeded flat exercises", () => {
  expect(hasPerExerciseMuscles(legDay)).toBe(true);
  expect(hasPerExerciseMuscles([{ name: "Squat", sets: 4, reps: 8 }])).toBe(false);
  expect(hasPerExerciseMuscles([])).toBe(false);
});

import { ALL_MUSCLES, bodyRegions, resolveHighlights } from "../BodyMap";

const frontKeys = () => Object.keys(bodyRegions("front"));
const backKeys = () => Object.keys(bodyRegions("back"));

test("front ∪ back covers exactly the 11-muscle closed vocabulary", () => {
  const union = new Set([...frontKeys(), ...backKeys()]);
  expect([...union].sort()).toEqual([...ALL_MUSCLES].sort());
});

test("muscles sit on the anatomically correct side", () => {
  // front-only
  expect(frontKeys()).toContain("chest");
  expect(backKeys()).not.toContain("chest");
  // back-only
  for (const m of ["back", "glutes", "hamstrings", "triceps"]) {
    expect(backKeys()).toContain(m);
    expect(frontKeys()).not.toContain(m);
  }
  // bilateral
  for (const m of ["shoulders", "forearms", "calves"]) {
    expect(frontKeys()).toContain(m);
    expect(backKeys()).toContain(m);
  }
});

test("resolveHighlights maps a highlighted muscle to a strong accent opacity, idle to faint", () => {
  const rows = resolveHighlights("front", { quads: 1 });
  const quads = rows.find((r) => r.muscle === "quads")!;
  const chest = rows.find((r) => r.muscle === "chest")!;
  expect(quads.opacity).toBeCloseTo(0.9); // 0.25 + 1*0.65
  expect(chest.opacity).toBeCloseTo(0.14); // idle base tint
  // a back-only muscle never appears in the front resolution
  expect(rows.find((r) => r.muscle === "glutes")).toBeUndefined();
});

test("intensity is clamped to [0,1]", () => {
  const rows = resolveHighlights("back", { glutes: 5, back: -3 });
  expect(rows.find((r) => r.muscle === "glutes")!.opacity).toBeCloseTo(0.9);
  expect(rows.find((r) => r.muscle === "back")!.opacity).toBeCloseTo(0.14);
});

test("every muscle carries at least one drawable shape", () => {
  for (const side of ["front", "back"] as const) {
    for (const shapes of Object.values(bodyRegions(side))) {
      expect(shapes!.length).toBeGreaterThan(0);
    }
  }
});

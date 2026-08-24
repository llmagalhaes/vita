/**
 * The pure half of the scenic header (handoff v4.1 §1–§2): which palette a trip picks,
 * where the sun/moon sits per daytime, and the scroll fade. The layers themselves are
 * SVG under a worklet — nothing jest can see.
 */
import { beachScenes, isDarkScene, parallaxLayers, scenePalette, scenery, scenes, sunFade, sunPos } from "../../ui";

test("scenePalette: vacation swaps SCN → VSCN in all three daytimes", () => {
  for (const s of ["morning", "afternoon", "evening"] as const) {
    expect(scenePalette(s, false)).toBe(scenes[s]);
    expect(scenePalette(s, true)).toBe(beachScenes[s]);
  }
  expect(scenePalette("morning", true).a).toBe("#DCEEEC");
  expect(scenePalette("afternoon", true).ink).toBe("#33504F");
});

test("evening keeps the dark sky-top + ink in both scenes, so stars and the status bar are scene-only", () => {
  expect(beachScenes.evening.a).toBe(scenes.evening.a); // #2F2C40 — the star field serves both
  expect(beachScenes.evening.ink).toBe(scenes.evening.ink);
  for (const s of ["morning", "afternoon", "evening"] as const) {
    expect(beachScenes[s].dark).toBe(isDarkScene(s));
  }
});

test("sunPos: low-left morning, high afternoon, moon right at evening", () => {
  expect(sunPos("morning")).toMatchObject({ x: 84, y: 62 });
  expect(sunPos("afternoon")).toMatchObject({ x: 214, y: 28 });
  expect(sunPos("evening")).toMatchObject({ x: 302, y: 44, moonX: 313, moonY: 36 });
});

test("sunPos: the beach horizon lifts the disc 5px (moon cutout keeps the raw y)", () => {
  expect(sunPos("evening", true)).toMatchObject({ x: 302, y: 39, moonX: 313, moonY: 36 });
  expect(sunPos("morning", true).y).toBe(57);
});

test("sunFade: 1.000 at rest → 0.452 at the 340px cap", () => {
  expect(sunFade(0)).toBe(1);
  expect(sunFade(Math.min(parallaxLayers.maxScroll, 900))).toBeCloseTo(0.452, 3);
});

test("layer factors: the near layer exits fastest, the sky slowest", () => {
  const exit = (f: number) => 1 - f; // net upward speed = content speed × (1 − factor)
  expect(exit(parallaxLayers.near.y)).toBeGreaterThan(exit(parallaxLayers.mid.y));
  expect(exit(parallaxLayers.mid.y)).toBeGreaterThan(exit(parallaxLayers.sun.y));
  expect(exit(parallaxLayers.sun.y)).toBeGreaterThan(exit(parallaxLayers.sky.y));
  // Max zoom on the front layer at the cap.
  expect(1 + parallaxLayers.maxScroll * parallaxLayers.near.scale).toBeCloseTo(1.119, 3);
});

test("the sun glints ride the sun's x, so morning reflects left and the moon right", () => {
  expect(scenery.beach.glints.map((g) => g.cy)).toEqual([70, 76]);
  expect(sunPos("morning", true).x).toBeLessThan(sunPos("evening", true).x);
});

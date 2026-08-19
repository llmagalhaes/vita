/**
 * The clock rule, and the test-only override that lets the evening scene be reviewed
 * in daylight (CEO batch #1) — "auto" must always hand the header back to the clock.
 *
 * ponytail: the override is checked at its storage seam, not through `useSceneName`;
 * the hook's whole contribution is `override === "auto" ? clock : override`.
 */
import { resetDbForTests } from "../../db/db";
import { getSceneOverride, sceneFor, setSceneOverride } from "../scene";

beforeEach(() => {
  resetDbForTests();
  setSceneOverride("auto");
});

test("the clock picks the scene", () => {
  expect(sceneFor(0)).toBe("morning");
  expect(sceneFor(11)).toBe("morning");
  expect(sceneFor(12)).toBe("afternoon");
  expect(sceneFor(17)).toBe("afternoon");
  expect(sceneFor(18)).toBe("evening");
  expect(sceneFor(23)).toBe("evening");
});

test("the dev override round-trips and defaults to auto", () => {
  expect(getSceneOverride()).toBe("auto");
  setSceneOverride("evening");
  expect(getSceneOverride()).toBe("evening");
  setSceneOverride("auto");
  expect(getSceneOverride()).toBe("auto");
});

import { ENTRANCE_ANIM } from "../useSheetDrag";
import { motion } from "../tokens";

/**
 * APP-050 regression: the sheet entrance must be a monotone decelerate TIMING
 * curve (prototype vtSheetUp), never an underdamped spring. Session 10 silently
 * regressed it to `withSpring({damping:20, stiffness:210})` (ζ≈0.69) → ~33px
 * overshoot, the "childish bounce". No existing test asserted the entrance config,
 * which is how it slipped through. Lock it here.
 */
describe("sheet entrance (ENTRANCE_ANIM)", () => {
  it("is the prototype vtSheetUp timing — 450ms, from motion.unfold", () => {
    expect(ENTRANCE_ANIM.durationMs).toBe(450);
    expect(ENTRANCE_ANIM.durationMs).toBe(motion.unfold.durationMs);
    // inside the handoff's .32–.45s full-sheet slide band
    expect(ENTRANCE_ANIM.durationMs).toBeGreaterThanOrEqual(320);
    expect(ENTRANCE_ANIM.durationMs).toBeLessThanOrEqual(450);
  });

  it("uses a monotone decelerate bezier with NO overshoot (control y-values ≤ 1)", () => {
    const [, y1, , y2] = ENTRANCE_ANIM.bezier;
    expect(y1).toBeLessThanOrEqual(1); // 0.9 — a spring-like bezier (e.g. .34,1.56) would exceed 1 and bounce
    expect(y2).toBeLessThanOrEqual(1); // 1.0
  });

  it("is a timing descriptor, not a spring — no damping/stiffness keys", () => {
    expect(ENTRANCE_ANIM).not.toHaveProperty("damping");
    expect(ENTRANCE_ANIM).not.toHaveProperty("stiffness");
  });
});

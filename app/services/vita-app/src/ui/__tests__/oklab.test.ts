import { mixOklab } from "../oklab";
import { colors, tint } from "../tokens";

// Reference values computed independently (Python, straight from the oklab
// definition: sRGB → linear → LMS → cbrt → oklab, lerp, and back). These are the
// three mix strengths v4 actually uses: 16% (muscle-map floor / primary chip),
// 50% (mid), 86% (muscle-map ceiling at intensity 1.0 → 16 + 1*70).
describe("mixOklab", () => {
  it("matches color-mix(in oklab, accent 16%, #F0EDE2)", () => {
    expect(mixOklab(colors.accent, 16, colors.sandChip)).toBe("#EBD9CA");
  });

  it("matches color-mix(in oklab, accent 50%, #FFFDF7)", () => {
    expect(mixOklab(colors.accent, 50)).toBe("#E4B6A1");
  });

  it("matches color-mix(in oklab, accent 86%, #F0EDE2)", () => {
    expect(mixOklab(colors.accent, 86, colors.sandChip)).toBe("#CC8263");
  });

  it("follows the vacation accent (45% onboarding chip border)", () => {
    expect(mixOklab(colors.vacationAccent, 45)).toBe("#ABCBD1");
  });

  it("returns the endpoints unchanged", () => {
    expect(mixOklab(colors.accent, 100, colors.card)).toBe(colors.accent);
    expect(mixOklab(colors.accent, 0, colors.card)).toBe(colors.card);
  });

  it("clamps out-of-range percentages", () => {
    expect(mixOklab(colors.accent, 140, colors.card)).toBe(colors.accent);
    expect(mixOklab(colors.accent, -20, colors.card)).toBe(colors.card);
  });

  it("keeps tint() alive as a deprecated alias", () => {
    expect(tint(colors.accent, 50)).toBe(mixOklab(colors.accent, 50));
  });
});

/**
 * APP-115 — the catalog's numbers against the handoff's own check values
 * (v4.2 §3.4/§3.6, acceptance criteria 17–21).
 */
import { EXCAT, coverage, dominant, mfill, search, type CatalogEntry } from "../exerciseCatalog";
import { colors, mixOklab } from "../../ui/tokens";

const ACCENT = colors.accent;
const BASE = colors.muscleEmptyAlt; // #EDE6D8
const byName = (name: string): CatalogEntry => EXCAT.find((e) => e.name === name)!;
const asExercise = (name: string) => ({ mus: byName(name).mus, soft: byName(name).whole });

/** The mix percentage a fill came out of — reads the check table straight. */
const pctOf = (fill: string): number => {
  for (let p = 0; p <= 100; p++) if (mixOklab(ACCENT, p, BASE) === fill) return p;
  return -1;
};

describe("EXCAT", () => {
  it("carries both families, whole-body flagged only on the diffuse activities", () => {
    expect(EXCAT.filter((e) => e.fam === "set")).toHaveLength(23);
    expect(EXCAT.filter((e) => e.fam === "time")).toHaveLength(23);
    expect(EXCAT.filter((e) => e.fam === "set").every((e) => !e.whole)).toBe(true);
    expect(byName("Plank").whole).toBe(false); // the only by-time entry that is not whole-body
    expect(byName("Football").whole).toBe(true);
  });

  it("keeps the handoff's weights verbatim", () => {
    expect(byName("Squat").mus).toEqual({ qu: 1, gl: 0.85, co: 0.3 });
    expect(byName("Deadlift").mus).toEqual({ ha: 1, gl: 0.9, bk: 0.75, tr: 0.5, co: 0.45 });
    expect(byName("Football").mus).toEqual({ qu: 0.55, ha: 0.5, ca: 0.45, gl: 0.35 });
  });
});

describe("coverage", () => {
  it("takes the MAX of a shared group, never the sum (criterion 20)", () => {
    const { covS } = coverage([asExercise("Squat"), asExercise("Leg press")]);
    expect(covS.qu).toBe(1); // 1 and 1 — not 2
    expect(covS.gl).toBe(0.85); // .85 vs .6
  });

  it("keeps by-set and whole-body work in separate maps", () => {
    const { covS, covD } = coverage([asExercise("Squat"), asExercise("Football")]);
    expect(covS.qu).toBe(1);
    expect(covD.qu).toBe(0.55);
    expect(covD.ha).toBe(0.5);
    expect(covS.ha).toBeUndefined();
  });

  it("a free entry with no muscles lights nothing (criterion 21)", () => {
    expect(coverage([{ mus: {}, soft: true }])).toEqual({ covS: {}, covD: {} });
  });
});

describe("mfill", () => {
  it("paints Squat at the handoff's percentages (criterion 18)", () => {
    const cov = coverage([asExercise("Squat")]);
    expect(pctOf(mfill("qu", cov, ACCENT))).toBe(70);
    expect(pctOf(mfill("gl", cov, ACCENT))).toBe(63);
    expect(pctOf(mfill("co", cov, ACCENT))).toBe(35);
  });

  it("paints Football in the pale band — visibly lighter (criterion 19)", () => {
    const cov = coverage([asExercise("Football")]);
    expect(pctOf(mfill("ha", cov, ACCENT))).toBe(18);
    expect(pctOf(mfill("ca", cov, ACCENT))).toBe(17);
  });

  it("lets by-set work win over whole-body on the same group", () => {
    const cov = coverage([asExercise("Squat"), asExercise("Football")]);
    expect(pctOf(mfill("qu", cov, ACCENT))).toBe(70); // not the 19% Football alone would give
  });

  it("leaves an untouched group at the base tone", () => {
    expect(mfill("ch", coverage([asExercise("Squat")]), ACCENT)).toBe(BASE);
  });
});

describe("dominant", () => {
  it("returns the heaviest three, strongest first", () => {
    expect(dominant(byName("Squat").mus)).toEqual(["qu", "gl", "co"]);
    expect(dominant(byName("Deadlift").mus)).toEqual(["ha", "gl", "bk"]);
    expect(dominant(byName("Leg curl").mus)).toEqual(["ha"]);
  });

  it("has nothing to say about a free entry", () => {
    expect(dominant({})).toEqual([]);
    expect(dominant(undefined)).toEqual([]);
  });
});

describe("search", () => {
  it("filters by family first — Football is by-time only (criterion 17)", () => {
    expect(search("foot", "time").map((e) => e.name)).toEqual(["Football"]);
    expect(search("foot", "set")).toEqual([]);
  });

  it("is case-insensitive and returns the whole family on an empty query", () => {
    expect(search("SQUAT", "set").map((e) => e.name)).toEqual(["Squat", "Front squat"]);
    expect(search("  ", "set")).toHaveLength(23);
  });
});

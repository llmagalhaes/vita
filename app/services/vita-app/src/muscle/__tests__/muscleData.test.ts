/**
 * APP-101 — the muscle model's numbers, checked against the prototype's own values
 * (docs/v4/README.md §3 + `MUS`/`EXMU`/`muF`/`muT`).
 */
import {
  EXMU,
  MUS,
  exercisesFor,
  intensitiesOf,
  muF,
  muT,
  programChips,
  sessionRows,
  sessionsFromEntries,
  tierOf,
  trendChips,
  type WorkoutSession,
} from "../muscleData";
import type { LocalEntry } from "../../db/entries";
import { colors, mixOklab } from "../../ui/tokens";

const TODAY = new Date(2026, 7, 18, 9, 0); // Tue 18 Aug 2026, local
const at = (daysAgo: number) => new Date(2026, 7, 18 - daysAgo, 18, 0).toISOString();

const leg = (daysAgo: number): WorkoutSession => ({ entryId: `l${daysAgo}`, title: "Leg day", at: at(daysAgo) });
const upper = (daysAgo: number): WorkoutSession => ({ entryId: `u${daysAgo}`, title: "Upper body", at: at(daysAgo) });
/** The prototype's four demo sessions: Leg 1, Upper 3, Leg 5, Upper 8. */
const WEEK = [leg(1), upper(3), leg(5), upper(8)];

describe("muF", () => {
  it("mixes 16 + v*70 percent of the accent into #F0EDE2", () => {
    expect(muF(1, colors.accent)).toBe(mixOklab(colors.accent, 86, colors.sandChip));
    expect(muF(0.85, colors.accent)).toBe(mixOklab(colors.accent, 76, colors.sandChip)); // round(16 + 59.5)
    expect(muF(0.25, colors.accent)).toBe(mixOklab(colors.accent, 34, colors.sandChip));
  });

  it("leaves an untouched muscle neutral — never a 0% accent mix", () => {
    expect(muF(0, colors.accent)).toBe(colors.muscleEmpty);
  });

  it("follows the vacation accent", () => {
    expect(muF(1, colors.vacationAccent)).toBe(mixOklab(colors.vacationAccent, 86, colors.sandChip));
  });
});

describe("tiers", () => {
  it("splits at .75 and .4", () => {
    expect(tierOf(1)).toBe("primary");
    expect(tierOf(0.75)).toBe("primary");
    expect(tierOf(0.74)).toBe("secondary");
    expect(tierOf(0.4)).toBe("secondary");
    expect(tierOf(0.25)).toBe("light");
  });
});

describe("intensitiesOf", () => {
  it("uses the handoff table for a known program", () => {
    expect(intensitiesOf(leg(1))).toEqual(MUS["Leg day"]);
    expect(intensitiesOf({ title: "Push A", planDay: "Upper body", at: at(0) })).toEqual(MUS["Upper body"]);
  });

  it("derives from the session's own exercises for an unknown program", () => {
    const mu = intensitiesOf({
      title: "Push A",
      at: at(0),
      exercises: [
        { name: "Bench press", muscleRoles: [{ name: "chest", role: "primary" }, { name: "triceps", role: "secondary" }] },
        { name: "Dips", muscleRoles: [{ name: "chest", role: "primary" }] },
      ],
    });
    expect(mu.ch).toBe(0.78); // primary, 2 exercises
    expect(mu.ar).toBe(0.3); // secondary, 1 exercise
    expect(mu.qu).toBeUndefined();
  });

  it("falls back to workout-level muscles when no exercise carries any", () => {
    expect(intensitiesOf({ title: "Push A", at: at(0), muscles: ["chest"] }).ch).toBe(0.78);
  });
});

describe("muT aggregate", () => {
  it("reproduces the prototype's weekly numbers (2 leg + 2 upper)", () => {
    const agg = muT(WEEK);
    expect(agg.qu).toBeCloseTo(0.5); // (1*2 + 0*2) / 4
    expect(agg.ch).toBeCloseTo(0.5);
    expect(agg.gl).toBeCloseTo(0.425);
    expect(agg.co).toBeCloseTo(0.25); // both programs hit it at .25
  });

  it("weights by session count (M: 10 leg, 8 upper)", () => {
    const month = [...Array(10)].map((_, i) => leg(i)).concat([...Array(8)].map((_, i) => upper(i)));
    expect(muT(month).qu).toBeCloseTo((1 * 10) / 18);
    expect(muT(month).bk).toBeCloseTo((0.9 * 8) / 18);
  });

  it("is all zeros with no sessions", () => {
    expect(muT([])).toEqual({});
  });
});

describe("chips", () => {
  it("program chips list every muscle the program touches, in map order, tier-labelled", () => {
    expect(programChips(MUS["Leg day"])).toEqual([
      { key: "qu", intensity: 1, tier: "primary" },
      { key: "gl", intensity: 0.85, tier: "primary" },
      { key: "ha", intensity: 0.8, tier: "primary" },
      { key: "ca", intensity: 0.55, tier: "secondary" },
      { key: "co", intensity: 0.25, tier: "light" },
    ]);
  });

  it("trend chips: over .15, strongest first, top 6 of the first 8 muscles", () => {
    const chips = trendChips(WEEK);
    expect(chips).toHaveLength(6);
    expect(chips.map((c) => c.key)).toEqual(["qu", "ch", "bk", "gl", "ha", "sh"]);
    // Shoulders land at .7*2/4 = .35 — ranked, but under the .4 tint threshold.
    expect(chips.map((c) => c.tinted)).toEqual([true, true, true, true, true, false]);
  });

  it("trend chips label a session COUNT — sessions where the muscle was at least secondary", () => {
    const chips = trendChips(WEEK);
    expect(chips.find((c) => c.key === "qu")!.sessions).toBe(2); // the two leg days
    expect(chips.find((c) => c.key === "ch")!.sessions).toBe(2); // the two upper days
  });

  it("drops the barely-touched and tints only from .4", () => {
    const chips = trendChips([leg(1), upper(3), upper(4), upper(5)]);
    const quads = chips.find((c) => c.key === "qu")!;
    expect(quads.intensity).toBeCloseTo(0.25);
    expect(quads.tinted).toBe(false);
    expect(chips.some((c) => c.key === "ca")).toBe(false); // .55/4 = .1375 ≤ .15
  });
});

describe("exercisesFor", () => {
  it("uses the EXMU table for a known program", () => {
    expect(exercisesFor(leg(1), "qu")).toEqual(EXMU["Leg day"]!.qu);
    expect(exercisesFor(upper(3), "ar")).toEqual(["Bench press", "Seated row", "Triceps rope"]);
  });

  it("uses the session's real exercises otherwise, arms folding in bi/tri/forearms", () => {
    const s: WorkoutSession = {
      title: "Push A",
      at: at(0),
      exercises: [
        { name: "Bench press", muscles: ["chest", "triceps"] },
        { name: "Curl", muscles: ["biceps"] },
      ],
    };
    expect(exercisesFor(s, "ar")).toEqual(["Bench press", "Curl"]);
    expect(exercisesFor(s, "qu")).toEqual([]);
  });
});

describe("sessionRows", () => {
  it("lists only the sessions that worked the muscle, newest first", () => {
    const rows = sessionRows(WEEK, "qu", TODAY);
    expect(rows.map((r) => r.program)).toEqual(["Leg day", "Leg day"]);
    expect(rows.map((r) => r.dayOffset)).toEqual([1, 5]);
    expect(rows[0].exercises).toEqual(["Squat", "Leg press", "Walking lunges"]);
    expect(rows[0].tier).toBe("primary");
  });

  it("shows no row for a muscle the program does not hit", () => {
    expect(sessionRows([leg(1), leg(2)], "ch", TODAY)).toEqual([]);
  });

  it("tags the tier per session — chest is primary on upper day, calves secondary on leg day", () => {
    expect(sessionRows(WEEK, "ch", TODAY)[0].tier).toBe("primary");
    expect(sessionRows(WEEK, "ca", TODAY)[0].tier).toBe("secondary");
  });

  it('gates "Open this day →" on the 10-day dock range', () => {
    const rows = sessionRows([leg(0), leg(9), leg(10)], "qu", TODAY);
    expect(rows.map((r) => r.canOpenDay)).toEqual([true, true, false]);
  });

  it("drops a session with intensity but no attributable exercise", () => {
    // Workout-level muscles only: the map still tints, but the sheet has nothing honest to list.
    expect(sessionRows([{ title: "Push A", at: at(1), muscles: ["chest"] }], "ch", TODAY)).toEqual([]);
  });
});

describe("sessionsFromEntries", () => {
  it("maps workout entries onto the session shape", () => {
    const entry = {
      id: "e1",
      type: "workout",
      occurredAt: at(2),
      detail: { title: "Leg day", planDay: "Leg day" },
    } as unknown as LocalEntry;
    expect(sessionsFromEntries([entry])).toEqual([{ entryId: "e1", title: "Leg day", planDay: "Leg day", at: at(2) }]);
  });
});

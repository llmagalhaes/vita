/**
 * APP-128 — builder draft → `TrainingProgramDraft` (handoff v4.2 §3.7, app-plan §B).
 */
import { dayLetter, fromProgramDoc, resizeDays, rolesOf, toProgramDraft, workoutKcalBody, type BwDay, type BwExercise } from "../draft";
import { EXCAT } from "../../../workout/exerciseCatalog";

const cat = (name: string) => EXCAT.find((e) => e.name === name)!;
const ex = (name: string, over: Partial<BwExercise> = {}): BwExercise => {
  const c = cat(name);
  return { n: c.name, fam: c.fam, mus: c.mus, soft: c.whole, sets: "3", reps: "10", min: "30", ...over };
};
const day = (n: string, exs: BwExercise[]): BwDay => ({ n, ex: exs });

describe("dayLetter", () => {
  it("runs A…J — ten sessions is exactly the ceiling (criterion 15)", () => {
    expect(dayLetter(0)).toBe("A");
    expect(dayLetter(9)).toBe("J");
  });
});

describe("rolesOf", () => {
  it("cuts primary at .7 and expands the arm capsule into biceps AND triceps", () => {
    expect(rolesOf({ ar: 0.7 })).toEqual([
      { name: "biceps", role: "primary" },
      { name: "triceps", role: "primary" },
    ]);
    expect(rolesOf({ ar: 0.6 })).toEqual([
      { name: "biceps", role: "secondary" },
      { name: "triceps", role: "secondary" },
    ]);
  });

  it("maps every app key onto the contract vocabulary", () => {
    expect(rolesOf({ qu: 1, gl: 0.85, co: 0.3, tr: 0.5 })).toEqual([
      { name: "quads", role: "primary" },
      { name: "glutes", role: "primary" },
      { name: "core", role: "secondary" },
      { name: "traps", role: "secondary" },
    ]);
  });
});

describe("toProgramDraft", () => {
  it("puts only the active family's fields on the wire", () => {
    const doc = toProgramDraft("Gym + Muay thai", [day("Day A", [ex("Squat", { sets: "4", reps: "8" })]), day("Day B", [ex("Muay thai", { min: "45" })])], "My program");
    expect(doc.summary).toBe("Gym + Muay thai");
    const squat = doc.days[0]!.exercises[0]!;
    expect(squat.sets).toBe(4);
    expect(squat.reps).toBe(8);
    expect(squat.durationMin).toBeUndefined();
    expect(squat.wholeBody).toBeUndefined();
    const mt = doc.days[1]!.exercises[0]!;
    expect(mt.durationMin).toBe(45);
    expect(mt.sets).toBeUndefined();
    expect(mt.reps).toBeUndefined();
    // A whole-body catalog activity says so — the split is a guess, and it is labelled one.
    expect(mt.wholeBody).toBe(true);
    expect(mt.muscleRoles).toContainEqual({ name: "core", role: "secondary" });
  });

  it("keeps what the other family had typed out of the document, not out of the builder", () => {
    const e = ex("Squat", { sets: "4", reps: "8", min: "99" });
    expect(toProgramDraft("", [day("Day A", [e])], "My program").days[0]!.exercises[0]!.durationMin).toBeUndefined();
    expect(e.min).toBe("99"); // still in the builder — switching family loses nothing
  });

  it("a free entry claims nothing: no muscleRoles, no wholeBody (criterion 21)", () => {
    const free: BwExercise = { n: "Capoeira", fam: "time", mus: {}, soft: true, sets: "3", reps: "10", min: "40" };
    const e = toProgramDraft("", [day("Day A", [free])], "My program").days[0]!.exercises[0]!;
    expect(e).toEqual({ name: "Capoeira", durationMin: 40 });
  });

  it("falls back to `My program` when the name is blank or spaces", () => {
    expect(toProgramDraft("", [], "My program").summary).toBe("My program");
    expect(toProgramDraft("   ", [], "My program").summary).toBe("My program");
  });

  it("drops a field the user emptied rather than sending zero", () => {
    const e = toProgramDraft("", [day("Day A", [ex("Squat", { sets: "", reps: "0" })])], "My program").days[0]!.exercises[0]!;
    expect(e.sets).toBeUndefined();
    expect(e.reps).toBeUndefined();
  });

  // MINOR-7: a PT-BR keyboard's decimal key is a comma — `Number("1,5")` is NaN,
  // and the minutes/sets/reps used to vanish without a word.
  it("takes a decimal comma", () => {
    const doc = toProgramDraft("", [day("Day A", [ex("Muay thai", { min: "42,5" })]), { n: "Day B", ex: [], kcal: "420,5" }], "My program");
    expect(doc.days[0]!.exercises[0]!.durationMin).toBe(42.5);
    expect(doc.days[1]!.kcalEstimate).toBe(420.5);
  });

  it("carries a day kcal through when one is set (Round-16 #4, APP-135)", () => {
    // CEO decision 4: typed and estimated alike land in `kcalEstimate` — the field
    // is an estimate by name, and a hand-typed session kcal is one too.
    expect(toProgramDraft("", [{ n: "Day A", ex: [], kcal: "420" }], "My program").days[0]!.kcalEstimate).toBe(420);
    expect(toProgramDraft("", [{ n: "Day A", ex: [], kcal: "300", kcalEst: true }], "My program").days[0]!.kcalEstimate).toBe(300);
    // Empty stays empty: no line reaches the Day surface at all.
    expect(toProgramDraft("", [day("Day A", [])], "My program").days[0]!.kcalEstimate).toBeUndefined();
    expect(toProgramDraft("", [{ n: "Day A", ex: [], kcal: "" }], "My program").days[0]!.kcalEstimate).toBeUndefined();
  });
});

describe("resizeDays", () => {
  it("keeps what is already filled in and names only the new ones", () => {
    const filled = [day("Push", [ex("Squat")]), day("Pull", [])];
    const grown = resizeDays(filled, 4, (i) => `Day ${dayLetter(i)}`);
    expect(grown.map((d) => d.n)).toEqual(["Push", "Pull", "Day C", "Day D"]);
    expect(grown[0]!.ex).toHaveLength(1);
    expect(resizeDays(grown, 1, (i) => `Day ${dayLetter(i)}`).map((d) => d.n)).toEqual(["Push"]);
  });
});

describe("workoutKcalBody (APP-135 / D9)", () => {
  it("sends only the active family's measure", () => {
    expect(workoutKcalBody(day("Day A", [ex("Squat"), ex("Football", { sets: "4", reps: "8", min: "45" })]))).toEqual([
      { name: "Squat", fam: "set", sets: 3, reps: 10 },
      { name: "Football", fam: "time", min: 45 },
    ]);
  });

  it("drops a measure that never became a number", () => {
    expect(workoutKcalBody(day("Day A", [ex("Squat", { sets: "", reps: "abc" })]))).toEqual([
      { name: "Squat", fam: "set", sets: undefined, reps: undefined },
    ]);
  });
});

/**
 * APP-138 — the way back in: a saved program becomes the same draft the builder
 * types out. The catalog wins on name; anything else rebuilds from its roles.
 */
describe("fromProgramDoc", () => {
  it("round-trips a program the builder itself made", () => {
    const doc = toProgramDraft(
      "Gym + Muay thai",
      [
        { n: "Legs", ex: [ex("Squat", { sets: "4", reps: "8" }), ex("Muay thai", { min: "45" })], kcal: "420", kcalEst: true },
        { n: "Rest-ish", ex: [{ n: "Capoeira", fam: "time", mus: {}, soft: true, sets: "", reps: "", min: "60" }] },
      ],
      "My program",
    );
    const back = fromProgramDoc(doc);
    expect(back.name).toBe("Gym + Muay thai");
    expect(toProgramDraft(back.name, back.days, "My program")).toEqual(doc);
  });

  it("takes the catalog's weights by name and the contract's rule for the family", () => {
    const { days } = fromProgramDoc({
      summary: "s",
      days: [{ name: "A", exercises: [{ name: "squat", sets: 5, reps: 5, muscleRoles: [{ name: "quads", role: "primary" }] }] }],
    });
    // Name match wins over the saved roles — the table is deterministic.
    expect(days[0]!.ex[0]).toEqual({ n: "squat", fam: "set", mus: cat("Squat").mus, soft: false, sets: "5", reps: "5", min: "" });
  });

  it("rebuilds weights from roles for an exercise off the catalog", () => {
    const { days } = fromProgramDoc({
      summary: "s",
      days: [
        {
          name: "A",
          exercises: [
            { name: "Kettlebell swing", sets: 3, reps: 15, muscleRoles: [{ name: "glutes", role: "primary" }, { name: "biceps", role: "secondary" }, { name: "triceps", role: "primary" }] },
            { name: "Capoeira", durationMin: 60 },
          ],
        },
      ],
    });
    // The arm capsule holds both arms: the stronger role wins, nothing is summed.
    expect(days[0]!.ex[0]!.mus).toEqual({ gl: 0.9, ar: 0.9 });
    expect(days[0]!.ex[0]!.soft).toBe(false);
    // .9/.45 sit either side of tierOf's .7 cut, so a re-save gives the roles back.
    expect(rolesOf(days[0]!.ex[0]!.mus)).toEqual([
      { name: "glutes", role: "primary" },
      { name: "biceps", role: "primary" },
      { name: "triceps", role: "primary" },
    ]);
    // Claims no muscles → free-typed → soft, and it still claims nothing on save.
    expect(days[0]!.ex[1]).toEqual({ n: "Capoeira", fam: "time", mus: {}, soft: true, sets: "", reps: "", min: "60" });
  });

  it("brings the day's kcal back as the estimate the contract calls it", () => {
    const { days } = fromProgramDoc({ summary: "s", days: [{ name: "A", exercises: [], kcalEstimate: 300 }, { name: "B", exercises: [] }] });
    expect(days[0]!.kcal).toBe("300");
    expect(days[0]!.kcalEst).toBe(true);
    expect(days[1]!.kcal).toBeUndefined();
  });

  it("drops what the builder has no field for", () => {
    const { days } = fromProgramDoc({
      summary: "s",
      splitDescription: "Push / Pull / Legs",
      days: [{ name: "A", exercises: [{ name: "Bench press", sets: 3, reps: 8, loadKg: 60, muscles: ["chest"] }] }],
    });
    expect(days[0]!.ex[0]).not.toHaveProperty("loadKg");
    expect(toProgramDraft("s", days, "f")).not.toHaveProperty("splitDescription");
  });
});

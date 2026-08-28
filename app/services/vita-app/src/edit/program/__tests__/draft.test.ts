/**
 * APP-140 — the program editor's draft: the name→catalog lookup (handoff v4.3 §3.2),
 * the save spread (§3.6) and the proportional kcal, including the handoff's own
 * check values (430 × 198/234 → 364, and 242 → 445).
 */
import type { TrainingProgramDraft } from "../../../api/client";
import { EXCAT, lookup } from "../../../workout/exerciseCatalog";
import { fromDoc, kcalFor, load, projection, toDoc } from "../draft";

const cat = (name: string) => EXCAT.find((e) => e.name === name)!;

/** The prototype's Leg day: load 32+40+30+36+36+60 = 234, kcal 430. */
const legDay: TrainingProgramDraft = {
  summary: "My split",
  days: [
    {
      name: "Leg day",
      kcalEstimate: 430,
      exercises: [
        { name: "Squat", sets: 4, reps: 8, loadKg: 90, muscleRoles: [{ name: "quads", role: "primary" }] },
        { name: "Leg press", sets: 5, reps: 8 },
        { name: "Romanian deadlift", sets: 3, reps: 10 },
        { name: "Walking lunges", sets: 3, reps: 12 },
        { name: "Leg curl", sets: 3, reps: 12 },
        { name: "Standing calf raise", sets: 4, reps: 15 },
      ],
    },
  ],
};

describe("lookup — plan names against the catalog (§3.2)", () => {
  it("matches exactly where the plan uses the catalog's own name", () => {
    for (const n of ["Squat", "Leg press", "Romanian deadlift", "Leg curl", "Bench press", "Seated row", "Lateral raise", "Triceps rope"]) {
      expect(lookup(n).mus).toEqual(cat(n).mus);
    }
  });

  it("falls back to every catalog word being present in the name", () => {
    expect(lookup("Walking lunges").mus).toEqual(cat("Lunges").mus);
    expect(lookup("Standing calf raise").mus).toEqual(cat("Calf raise").mus);
    expect(lookup("Incline dumbbell press").mus).toEqual(cat("Incline press").mus);
  });

  it("prefers the longest catalog name, so `Front squat` beats `Squat`", () => {
    expect(lookup("Front squat com pausa").mus).toEqual(cat("Front squat").mus);
  });

  it("never guesses: an unknown name maps to nothing and paints pale", () => {
    expect(lookup("Kettlebell flow")).toEqual({ mus: {}, soft: true, fam: "set" });
  });

  it("carries the catalog's family and whole-body flag", () => {
    expect(lookup("Muay thai session")).toMatchObject({ fam: "time", soft: true });
    expect(lookup("Squat").soft).toBe(false);
  });
});

describe("fromDoc — the draft the screen edits", () => {
  const [day] = fromDoc(legDay);

  it("derives the family from the fields the contract carries", () => {
    expect(day!.ex.every((e) => e.fam === "set")).toBe(true);
    const [timed] = fromDoc({ summary: "s", days: [{ name: "Cardio", exercises: [{ name: "Running", durationMin: 30 }] }] });
    expect(timed!.ex[0]!.fam).toBe("time");
  });

  it("fills the unused family with the handoff's defaults so the input exists", () => {
    expect(day!.ex[0]).toMatchObject({ sets: "4", reps: "8", min: "30" });
    const [timed] = fromDoc({ summary: "s", days: [{ name: "Cardio", exercises: [{ name: "Running", durationMin: 20 }] }] });
    expect(timed!.ex[0]).toMatchObject({ sets: "3", reps: "10", min: "20" });
  });

  it("keeps the source object on every row", () => {
    expect(day!.ex[0]!.src).toBe(legDay.days[0]!.exercises[0]);
  });

  it("rebuilds weights from saved roles when the catalog misses the name", () => {
    const [d] = fromDoc({
      summary: "s",
      days: [
        {
          name: "Push",
          exercises: [
            {
              name: "Supino inclinado com halteres",
              sets: 3,
              reps: 10,
              muscleRoles: [
                { name: "chest", role: "primary" },
                { name: "triceps", role: "secondary" },
              ],
            },
          ],
        },
      ],
    });
    expect(d!.ex[0]).toMatchObject({ mus: { ch: 0.9, ar: 0.45 }, soft: false });
  });

  it("a name nobody knows and no roles reads as not mapped", () => {
    const [d] = fromDoc({ summary: "s", days: [{ name: "X", exercises: [{ name: "Kettlebell flow", sets: 3, reps: 10 }] }] });
    expect(d!.ex[0]).toMatchObject({ mus: {}, soft: true });
  });
});

describe("toDoc — saving (§3.6)", () => {
  const snap = fromDoc(legDay);

  it("leaves an untouched program identical — exercises byte for byte", () => {
    const out = toDoc(legDay, fromDoc(legDay), snap);
    expect(out).toEqual(legDay);
    // The exercises are spreads of their own source objects, so even key ORDER
    // survives. Only the day itself re-appends its recomputed `kcalEstimate`.
    expect(JSON.stringify(out.days[0]!.exercises)).toBe(JSON.stringify(legDay.days[0]!.exercises));
  });

  it("preserves every field of an exercise it did not edit", () => {
    const draft = fromDoc(legDay);
    draft[0]!.ex[1] = { ...draft[0]!.ex[1]!, reps: "12" }; // Leg press only
    const out = toDoc(legDay, draft, snap);
    expect(out.days[0]!.exercises[0]).toEqual(legDay.days[0]!.exercises[0]); // loadKg + roles intact
    expect(out.days[0]!.exercises[1]).toEqual({ name: "Leg press", sets: 5, reps: 12 });
  });

  it("gives an added exercise roles from the catalog at the .7 cut", () => {
    const draft = fromDoc(legDay);
    draft[0]!.ex = [
      ...draft[0]!.ex,
      { n: "Hip thrust", fam: "set", mus: cat("Hip thrust").mus, soft: false, sets: "3", reps: "10", min: "30" },
    ];
    const added = toDoc(legDay, draft, snap).days[0]!.exercises[6]!;
    expect(added).toEqual({
      name: "Hip thrust",
      sets: 3,
      reps: 10,
      muscleRoles: [
        { name: "glutes", role: "primary" }, // 1 ≥ .7
        { name: "hamstrings", role: "secondary" }, // .5 < .7
      ],
    });
  });

  it("marks an added whole-body activity, and only sends the active family", () => {
    const draft = fromDoc(legDay);
    draft[0]!.ex = [
      { n: "Running", fam: "time", mus: cat("Running").mus, soft: true, sets: "3", reps: "10", min: "30" },
    ];
    const added = toDoc(legDay, draft, snap).days[0]!.exercises[0]!;
    expect(added.durationMin).toBe(30);
    expect(added.sets).toBeUndefined();
    expect(added.wholeBody).toBe(true);
  });
});

describe("proportional kcal (§3.6 check values)", () => {
  const snap = fromDoc(legDay);
  const l0 = load(snap[0]!.ex);

  it("reads the handoff's load off the prototype's Leg day", () => {
    expect(l0).toBe(234);
  });

  it("430 × 198/234 → 364 after the Leg curl goes", () => {
    const draft = fromDoc(legDay);
    draft[0]!.ex = draft[0]!.ex.filter((e) => e.n !== "Leg curl");
    expect(load(draft[0]!.ex)).toBe(198);
    expect(toDoc(legDay, draft, snap).days[0]!.kcalEstimate).toBe(364);
  });

  it("430 × 242/234 → 445 after the Squat goes to 5 × 8", () => {
    const draft = fromDoc(legDay);
    draft[0]!.ex[0] = { ...draft[0]!.ex[0]!, sets: "5" };
    expect(load(draft[0]!.ex)).toBe(242);
    expect(toDoc(legDay, draft, snap).days[0]!.kcalEstimate).toBe(445);
  });

  it("keeps the calibrated number when the volume does not move", () => {
    expect(toDoc(legDay, fromDoc(legDay), snap).days[0]!.kcalEstimate).toBe(430);
  });

  it("an emptied session loses its estimate rather than keeping a phantom one", () => {
    const draft = fromDoc(legDay);
    draft[0]!.ex = [];
    expect(toDoc(legDay, draft, snap).days[0]!.kcalEstimate).toBeUndefined();
    expect("kcalEstimate" in toDoc(legDay, draft, snap).days[0]!).toBe(false);
  });

  it("falls back to load × 1.85 only where there was no number to scale", () => {
    expect(kcalFor(0, 200, undefined)).toBe(370);
    expect(kcalFor(200, 200, undefined)).toBe(370);
    expect(kcalFor(0, 0, 430)).toBeUndefined();
  });

  it("counts a timed exercise as minutes × 15", () => {
    const [d] = fromDoc({ summary: "s", days: [{ name: "Cardio", exercises: [{ name: "Running", durationMin: 30 }] }] });
    expect(load(d!.ex)).toBe(450);
  });
});

describe("dirty projection (R12)", () => {
  it("ignores the source refs and moves on a real edit", () => {
    const open = projection(fromDoc(legDay));
    expect(projection(fromDoc(legDay))).toBe(open);
    expect(open).not.toContain("loadKg"); // the saved objects are not in the comparison
    const draft = fromDoc(legDay);
    draft[0]!.ex[0] = { ...draft[0]!.ex[0]!, reps: "10" };
    expect(projection(draft)).not.toBe(open);
  });
});

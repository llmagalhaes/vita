/**
 * APP-124/125/126/127 — the training builder end to end on the route
 * (handoff v4.2 §3, criteria 15, 16, 17, 18, 19, 21, 22, 23).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../../../i18n";
import BuildProgramScreen from "../../../../app/(main)/build-program";
import { PopHost } from "../../../ui/popHost";
import { coverage, mfill } from "../../../workout/exerciseCatalog";
import { colors, getAccent } from "../../../ui";
import { resetDbForTests } from "../../../db/db";
import { getCachedProgram, saveProgram } from "../../../db/plan";
import en from "../../../i18n/locales/en.json";

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));

/** The map's own maths is APP-115's suite; here we check the CARD wires into it. */
let mockBodyMapProps: { labels?: boolean; fill?: (k: string) => string } = {};
jest.mock("../../../muscle/BodyMap", () => ({
  BodyMap: (props: Record<string, unknown>) => {
    mockBodyMapProps = props;
    return null;
  },
}));

const squat = { mus: { qu: 1, gl: 0.85, co: 0.3 }, soft: false };
const football = { mus: { qu: 0.55, ha: 0.5, ca: 0.45, gl: 0.35 }, soft: true };

const renderScreen = () =>
  render(
    <>
      <BuildProgramScreen />
      <PopHost />
    </>,
  );

/** shape → days, landing on Day A's card. */
const toDays = async () => {
  await fireEvent.press(screen.getByText("Fill in Day A"));
};

/** Open the sheet, pick `name` in `fam`, take the defaults. */
const addExercise = async (name: string, fam: "By set" | "By time" = "By set") => {
  await fireEvent.press(screen.getByLabelText("+ Add exercise or activity"));
  await fireEvent.press(screen.getByLabelText(fam));
  await fireEvent.press(screen.getByLabelText(name));
  await fireEvent.press(screen.getByText("Add to day"));
};

beforeEach(() => {
  resetDbForTests();
  mockBack.mockClear();
  mockBodyMapProps = {};
  mockParams = {};
});

describe("shape phase", () => {
  it("previews one lettered row per session and climbs to Day J (criterion 15)", async () => {
    await renderScreen();
    expect(screen.getByText("Day A")).toBeOnTheScreen();
    expect(screen.getByText("Day C")).toBeOnTheScreen();
    expect(screen.queryByText("Day D")).toBeNull();
    expect(screen.getAllByText("empty")).toHaveLength(3);

    await fireEvent.press(screen.getByLabelText("5"));
    expect(screen.getByText("Day E")).toBeOnTheScreen();
    for (let n = 5; n < 10; n++) await fireEvent.press(screen.getByLabelText("+"));
    expect(screen.getByText("Day J")).toBeOnTheScreen();
    expect(screen.queryByLabelText("+")).toBeNull(); // the ceiling is the letter J
  });

  it("walks the back ladder down: a day, the shape, then out", async () => {
    await renderScreen();
    await toDays();
    await fireEvent.press(screen.getByText("Next day"));
    expect(screen.getByText("2 of 3")).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText("Back"));
    expect(screen.getByText("1 of 3")).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(screen.getByText("Fill in Day A")).toBeOnTheScreen(); // back at the shape
    expect(mockBack).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(mockBack).toHaveBeenCalledTimes(1); // only now does it leave
  });
});

describe("the add sheet", () => {
  it("the family is the first cut, not a form detail (criteria 16, 17)", async () => {
    await renderScreen();
    await toDays();
    await fireEvent.press(screen.getByLabelText("+ Add exercise or activity"));

    expect(screen.getByLabelText("Squat")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Football")).toBeNull();

    await fireEvent.press(screen.getByLabelText("By time"));
    expect(screen.getByLabelText("Football")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Squat")).toBeNull();
    expect(screen.getAllByText("WHOLE BODY").length).toBeGreaterThan(0);

    // Stage 2 of a time exercise has minutes and no set fields at all.
    await fireEvent.press(screen.getByLabelText("Football"));
    expect(screen.getByLabelText("Minutes")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Sets")).toBeNull();
    expect(screen.queryByLabelText("Reps")).toBeNull();
    expect(screen.getByText("whole body — the split is a guess")).toBeOnTheScreen();

    await fireEvent.press(screen.getByText("Back to list"));
    await fireEvent.press(screen.getByLabelText("By set"));
    await fireEvent.press(screen.getByLabelText("Squat"));
    expect(screen.getByLabelText("Sets")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Minutes")).toBeNull();
  });

  it("offers a free entry for a name off the catalog, and it claims nothing (criterion 21)", async () => {
    await renderScreen();
    await toDays();
    await fireEvent.press(screen.getByLabelText("+ Add exercise or activity"));
    await fireEvent.changeText(screen.getByLabelText("Search, or type your own"), "Capoeira");

    expect(screen.getByText("your own — no muscles guessed")).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText("Add “Capoeira”"));
    expect(screen.getByText("no muscles guessed for this one")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Add to day"));

    expect(screen.getByText("Capoeira")).toBeOnTheScreen();
    expect(screen.getByText("not mapped")).toBeOnTheScreen();
    expect(screen.getByText("Nothing yet. The body fills in as you add.")).toBeOnTheScreen(); // lights nothing
  });

  it("does not offer a free row when the query IS a catalog name", async () => {
    await renderScreen();
    await toDays();
    await fireEvent.press(screen.getByLabelText("+ Add exercise or activity"));
    await fireEvent.changeText(screen.getByLabelText("Search, or type your own"), "squat");
    expect(screen.queryByText("your own — no muscles guessed")).toBeNull();
  });
});

describe("the live map", () => {
  it("hands BodyMap the builder's two-source fill, captions off (criteria 18, 22)", async () => {
    await renderScreen();
    await toDays();
    await addExercise("Squat");

    expect(mockBodyMapProps.labels).toBe(false);
    const expected = coverage([squat]);
    for (const k of ["qu", "gl", "co", "ch"] as const) {
      expect(mockBodyMapProps.fill!(k)).toBe(mfill(k, expected, getAccent()));
    }
    // Named twice on purpose: the row's own dominant muscles and the map's chips.
    for (const name of ["Quads", "Glutes", "Core"]) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    expect(screen.queryByText("Paler tones come from whole-body activities, where the split is a guess.")).toBeNull();
  });

  it("paints a whole-body activity in the pale band and says why (criterion 19)", async () => {
    await renderScreen();
    await toDays();
    await addExercise("Football", "By time");

    expect(mockBodyMapProps.fill!("ha")).toBe(mfill("ha", coverage([football]), getAccent()));
    expect(screen.getByText("Paler tones come from whole-body activities, where the split is a guess.")).toBeOnTheScreen();
    expect(screen.getByText("30 min")).toBeOnTheScreen();
  });

  it("takes the max of a shared group across two exercises (criterion 20)", async () => {
    await renderScreen();
    await toDays();
    await addExercise("Squat");
    await addExercise("Leg press");
    // Squat gl .85 vs Leg press gl .6 — the stronger one paints, nothing is summed.
    expect(mockBodyMapProps.fill!("gl")).toBe(mfill("gl", coverage([squat]), getAccent()));
  });
});

describe("day card and finish", () => {
  it("removes an exercise and saves the built program (APP-125, APP-128)", async () => {
    await renderScreen();
    await toDays();
    await fireEvent.changeText(screen.getByLabelText("Day A"), "Legs");
    await addExercise("Squat");
    await addExercise("Leg press");
    expect(screen.getAllByText("3 × 10")).toHaveLength(2); // both rows take the defaults

    await fireEvent.press(screen.getByLabelText("Remove Leg press"));
    expect(screen.queryByLabelText("Remove Leg press")).toBeNull(); // gone from the day (the sheet's catalog row is not it)

    await fireEvent.press(screen.getByText("Next day"));
    await fireEvent.press(screen.getByText("Next day"));
    await fireEvent.press(screen.getByText("Finish setup"));
    await fireEvent.press(screen.getByText("Finish setup")); // double tap saves once

    const doc = getCachedProgram()!;
    expect(doc.summary).toBe("My program"); // untitled → the fallback
    expect(doc.days).toHaveLength(3);
    expect(doc.days[0]!.name).toBe("Legs");
    expect(doc.days[0]!.exercises).toEqual([
      { name: "Squat", sets: 3, reps: 10, muscleRoles: [{ name: "quads", role: "primary" }, { name: "glutes", role: "primary" }, { name: "core", role: "secondary" }] },
    ]);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

/**
 * APP-135 / CEO Round-16 #4 — the day keeps its `~kcal`: typed, or worked out from
 * what is in the session. Estimated wears the mark; typed is solid and untouchable.
 */
describe("the day's kcal", () => {
  it("estimates an empty field, marks it, and saves it as the day's kcalEstimate", async () => {
    await renderScreen();
    await toDays();
    await addExercise("Squat"); // 3 × 10 → the mock's 3*10*0.5 = 15

    const field = screen.getByLabelText("Calories for this session");
    expect(field.props.value).toBe(""); // no kcal field pressure while building

    await fireEvent.press(screen.getByText("Work it out for me"));
    expect(screen.getByText("Working it out…")).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByLabelText("Calories for this session").props.value).toBe("15"), { timeout: 8000 });

    // The mark: `~` prefix, estimate ink, amber dashed base (handoff §2.4).
    expect(screen.getByText("~")).toBeOnTheScreen();
    expect(screen.getByLabelText("Calories for this session")).toHaveStyle({
      color: colors.estimateInk,
      borderBottomColor: colors.estimateDash,
    });
    // Filled → nothing left to press, so no estimate can ever land on it again.
    expect(screen.queryByText("Work it out for me")).toBeNull();

    await fireEvent.press(screen.getByText("Next day"));
    await fireEvent.press(screen.getByText("Next day"));
    await fireEvent.press(screen.getByText("Finish setup"));
    expect(getCachedProgram()!.days[0]!.kcalEstimate).toBe(15);
    expect(getCachedProgram()!.days[1]!.kcalEstimate).toBeUndefined(); // empty stays empty
  }, 30000);

  it("a typed number is solid, unmarked and never offered to the estimator", async () => {
    await renderScreen();
    await toDays();
    await addExercise("Squat");
    await fireEvent.changeText(screen.getByLabelText("Calories for this session"), "420");

    expect(screen.queryByText("~")).toBeNull();
    expect(screen.getByLabelText("Calories for this session")).toHaveStyle({ color: colors.inkHeading });
    expect(screen.queryByText("Work it out for me")).toBeNull();

    await fireEvent.press(screen.getByText("Next day"));
    await fireEvent.press(screen.getByText("Next day"));
    await fireEvent.press(screen.getByText("Finish setup"));
    expect(getCachedProgram()!.days[0]!.kcalEstimate).toBe(420);
  });

  it("offers nothing to estimate from an empty day", async () => {
    await renderScreen();
    await toDays();
    expect(screen.queryByText("Work it out for me")).toBeNull();
  });
});

describe("criterion 23", () => {
  it("the builder's copy carries no warning, suggestion or balance judgement", () => {
    const copy = JSON.stringify(en.build.program).toLowerCase();
    for (const word of ["warning", "unbalanc", "imbalance", "you should", "we suggest", "missing", "try adding", "recommend"]) {
      expect(copy).not.toContain(word);
    }
  });
});

/** APP-138 — `?edit=1`: the builder IS the editor. */
describe("edit mode", () => {
  const saved = {
    summary: "Gym + Muay thai",
    days: [
      { name: "Legs", exercises: [{ name: "Squat", sets: 4, reps: 8, muscleRoles: [{ name: "quads" as const, role: "primary" as const }] }], kcalEstimate: 420 },
      { name: "Ring", exercises: [{ name: "Muay thai", durationMin: 45, wholeBody: true }] },
    ],
  };

  it("opens on the first day, prefilled, with the shape one Back away", async () => {
    await saveProgram(saved);
    mockParams = { edit: "1" };
    await renderScreen();

    expect(screen.getByText("1 of 2")).toBeOnTheScreen(); // straight past the shape
    expect(screen.getByLabelText("Legs")).toBeOnTheScreen();
    expect(screen.getByText("Squat")).toBeOnTheScreen();
    expect(screen.getByText("4 × 8")).toBeOnTheScreen();
    expect(screen.getByLabelText("Calories for this session").props.value).toBe("420");

    await fireEvent.press(screen.getByLabelText("Back"));
    expect(screen.getByDisplayValue("Gym + Muay thai")).toBeOnTheScreen(); // the shape, named
  });

  it("saves a new version carrying the untouched days through", async () => {
    await saveProgram(saved);
    mockParams = { edit: "1" };
    await renderScreen();

    await fireEvent.press(screen.getByLabelText("Remove Squat"));
    await addExercise("Deadlift");
    await fireEvent.press(screen.getByText("Next day"));
    await fireEvent.press(screen.getByText("Finish setup"));

    const doc = getCachedProgram()!;
    expect(doc.summary).toBe("Gym + Muay thai");
    expect(doc.days[0]!.name).toBe("Legs");
    expect(doc.days[0]!.exercises[0]!.name).toBe("Deadlift");
    expect(doc.days[0]!.kcalEstimate).toBe(420);
    // Day B rode through untouched — and its catalog name gave its muscles back.
    expect(doc.days[1]!.name).toBe("Ring");
    expect(doc.days[1]!.exercises[0]).toMatchObject({ name: "Muay thai", durationMin: 45, wholeBody: true });
  });

  it("ignores the flag when there is nothing saved yet", async () => {
    mockParams = { edit: "1" };
    await renderScreen();
    expect(screen.getByText("Fill in Day A")).toBeOnTheScreen();
  });
});

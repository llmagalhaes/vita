/**
 * APP-140 — the training editor on the route (handoff v4.3 §3, criteria 22–35).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import "../../../i18n";
import EditProgramScreen from "../../../../app/(main)/edit-program";
import { PopHost } from "../../../ui/popHost";
import { api, type TrainingProgramDraft } from "../../../api";
import { getDaySkips, saveProgram, toggleDaySkip } from "../../../db/plan";
import { resetDbForTests } from "../../../db/db";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
}));

/** The map's own maths is APP-115's suite; here we check what the CARD paints. */
let mockBodyMap: { fill?: (k: string) => string } = {};
jest.mock("../../../muscle/BodyMap", () => ({
  BodyMap: (props: Record<string, unknown>) => {
    mockBodyMap = props;
    return null;
  },
}));

/** What the body map paints for one muscle right now. */
const fillOf = (k: string): string => mockBodyMap.fill!(k);

const program: TrainingProgramDraft = {
  summary: "My split",
  days: [
    {
      name: "Leg day",
      kcalEstimate: 430,
      exercises: [
        { name: "Squat", sets: 4, reps: 8, loadKg: 90 },
        { name: "Leg press", sets: 5, reps: 8 },
        { name: "Romanian deadlift", sets: 3, reps: 10 },
        { name: "Walking lunges", sets: 3, reps: 12 },
        { name: "Leg curl", sets: 3, reps: 12 },
        { name: "Standing calf raise", sets: 4, reps: 15 },
      ],
    },
    {
      name: "Upper body",
      kcalEstimate: 380,
      exercises: [
        { name: "Bench press", sets: 4, reps: 8 },
        { name: "Incline dumbbell press", sets: 3, reps: 10 },
        { name: "Seated row", sets: 4, reps: 10 },
        { name: "Lateral raise", sets: 3, reps: 15 },
        { name: "Triceps rope", sets: 3, reps: 12 },
      ],
    },
  ],
};

const open = async (doc = program) => {
  await saveProgram(structuredClone(doc));
  return render(
    <>
      <EditProgramScreen />
      <PopHost />
    </>,
  );
};

/** The doc the screen PUT, once the save's floating promise has run. */
const saved = async (spy: jest.SpyInstance): Promise<TrainingProgramDraft> => {
  await waitFor(() => expect(spy).toHaveBeenCalled());
  return spy.mock.calls[0]![0] as TrainingProgramDraft;
};

beforeEach(() => {
  resetDbForTests();
  mockBack.mockClear();
  mockBodyMap = {};
});

it("opens on the first session with every exercise closed (criterion 22)", async () => {
  await open();
  expect(screen.getByText("Change the sessions you already have")).toBeOnTheScreen();
  expect(screen.getByText("6 exercises · tap one to change it")).toBeOnTheScreen();
  expect(screen.getByText("4 × 8")).toBeOnTheScreen();
  expect(screen.queryByLabelText("Sets")).toBeNull();
});

it("maps every exercise of the default plan, name fallback included (criterion 24)", async () => {
  await open();
  expect(screen.queryByText("not mapped")).toBeNull();
  // Walking lunges → Lunges, Standing calf raise → Calf raise.
  expect(screen.getByText("Quads · Glutes · Hamstrings")).toBeOnTheScreen();
  expect(screen.getAllByText("Calves").length).toBeGreaterThan(0); // the row AND the chip
});

/** Handoff §6.5: the chips read in MGN order (torso down, then legs), never by weight. */
it("lists the map's chips in MGN order, not MUSCLE_KEYS order (F4)", async () => {
  await open();
  const chips = () => within(screen.getByTestId("session-chips")).getAllByText(/.+/).map((n) => n.props.children);
  expect(chips()).toEqual(["Back", "Core", "Quads", "Hamstrings", "Glutes", "Calves"]);

  await fireEvent.press(screen.getByLabelText("Upper body"));
  expect(chips()).toEqual(["Chest", "Back", "Shoulders", "Arms", "Traps"]);
});

it("switches sessions and repaints the map (criterion 25)", async () => {
  await open();
  const legFill = fillOf("qu");
  await fireEvent.press(screen.getByLabelText("Upper body"));
  expect(screen.getByText("5 exercises · tap one to change it")).toBeOnTheScreen();
  expect(screen.getByText("Chest · Shoulders · Arms")).toBeOnTheScreen(); // Incline dumbbell press
  expect(fillOf("qu")).not.toBe(legFill);
});

it("edits volume live without moving a single colour (criterion 26)", async () => {
  await open();
  const before = ["qu", "gl", "ha", "ca", "ch", "bk"].map((k) => fillOf(k));
  await fireEvent.press(screen.getByLabelText("Squat"));
  expect(screen.getByLabelText("Sets").props.value).toBe("4");
  await fireEvent.changeText(screen.getByLabelText("Reps"), "10");
  expect(screen.getByText("4 × 10")).toBeOnTheScreen();
  expect(["qu", "gl", "ha", "ca", "ch", "bk"].map((k) => fillOf(k))).toEqual(before);
});

it("opens one exercise at a time", async () => {
  await open();
  await fireEvent.press(screen.getByLabelText("Squat"));
  await fireEvent.press(screen.getByLabelText("Leg press"));
  expect(screen.getAllByLabelText("Sets")).toHaveLength(1);
  expect(screen.getByLabelText("Sets").props.value).toBe("5"); // Leg press, not Squat
});

/**
 * Criterion 27 with the handoff's own numbers corrected: it claims dropping the
 * Leg curl takes hamstrings from 1 to .4 ("only Walking lunges would be left"), but
 * the Romanian deadlift in the same session is `ha: 1` — the map is a MAX, so
 * hamstrings do not move. The mechanism it is really asserting (drop the only
 * exercise that owns a muscle → that muscle goes dark) is checked on calves.
 */
it("removes an exercise on the spot and dims the muscle it owned (criterion 27)", async () => {
  await open();
  const before = fillOf("ca");
  const hamstrings = fillOf("ha");
  await fireEvent.press(screen.getByLabelText("Standing calf raise"));
  await fireEvent.press(screen.getByLabelText("Remove from session"));
  expect(screen.queryByLabelText("Standing calf raise")).toBeNull();
  expect(screen.getByText("5 exercises · tap one to change it")).toBeOnTheScreen();
  expect(fillOf("ca")).not.toBe(before);
  expect(screen.queryByText("Calves")).toBeNull(); // the chip goes with it
  expect(fillOf("ha")).toBe(hamstrings); // Romanian deadlift still owns hamstrings
});

it("adds through the builder's own sheet, titled for the session, and opens the new row (criteria 28/29)", async () => {
  await open();
  await fireEvent.press(screen.getByLabelText("+ Add exercise or activity"));
  expect(screen.getByText("Add to Leg day")).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText("By time"));
  await fireEvent.press(screen.getByLabelText("Running"));
  await fireEvent.press(screen.getByText("Add to day"));

  expect(screen.getByText("7 exercises · tap one to change it")).toBeOnTheScreen();
  expect(screen.getByLabelText("Minutes").props.value).toBe("30"); // expanded already
  expect(screen.getByText("30 min")).toBeOnTheScreen();
});

it("footer is an inert state until something actually changes, then saves (criterion 30)", async () => {
  const put = jest.spyOn(api, "updateProgram");
  await open();
  expect(screen.getByText("Nothing changed yet")).toBeOnTheScreen();
  expect(screen.queryByText("Save the changes")).toBeNull();

  await fireEvent.press(screen.getByLabelText("Leg curl"));
  await fireEvent.press(screen.getByLabelText("Remove from session"));
  await fireEvent.press(screen.getByText("Save the changes"));

  const doc = await saved(put);
  expect(doc.days[0]!.exercises).toHaveLength(5);
  expect(doc.days[0]!.kcalEstimate).toBe(364);
  expect(doc.days[1]).toEqual(program.days[1]); // the session nobody opened is untouched
  expect(mockBack).toHaveBeenCalled();
  put.mockRestore();
});

it("scales the estimate with the volume (criterion 31)", async () => {
  const put = jest.spyOn(api, "updateProgram");
  await open();
  await fireEvent.press(screen.getByLabelText("Squat"));
  await fireEvent.changeText(screen.getByLabelText("Sets"), "5");
  await fireEvent.press(screen.getByText("Save the changes"));

  const doc = await saved(put);
  expect(doc.days[0]!.kcalEstimate).toBe(445);
  expect(doc.days[0]!.exercises[0]).toEqual({ name: "Squat", sets: 5, reps: 8, loadKg: 90 });
  put.mockRestore();
});

it("clears today's exercise check-offs on save, and nothing before it (§3.6 exOv)", async () => {
  const put = jest.spyOn(api, "updateProgram");
  await open();
  toggleDaySkip("Leg day", "Leg curl");
  await fireEvent.press(screen.getByLabelText("Squat"));
  await fireEvent.changeText(screen.getByLabelText("Sets"), "5");
  expect(getDaySkips()["Leg day"]).toBeDefined(); // still there while it is a draft
  await fireEvent.press(screen.getByText("Save the changes"));
  await saved(put);
  expect(getDaySkips()).toEqual({});
  put.mockRestore();
});

it("leaves the program alone when the draft is thrown away (criterion 35)", async () => {
  const put = jest.spyOn(api, "updateProgram");
  await open();
  await fireEvent.press(screen.getByLabelText("Leg curl"));
  await fireEvent.press(screen.getByLabelText("Remove from session"));
  await fireEvent.press(screen.getByLabelText("Back"));
  expect(put).not.toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalled();
  put.mockRestore();
});

it("says the session names are not editable here, and offers no way to (criterion 34)", async () => {
  await open();
  expect(
    screen.getByText("Session names and how many sessions you rotate through are set when you build a program."),
  ).toBeOnTheScreen();
  expect(screen.queryByLabelText("Leg day")).not.toBeNull(); // the tab, not a field
  expect(screen.queryByPlaceholderText("Leg day")).toBeNull();
});

it("an emptied session keeps its tab, drops its estimate and says what that means", async () => {
  const put = jest.spyOn(api, "updateProgram");
  await open({ summary: "s", days: [{ name: "Rest-ish", kcalEstimate: 200, exercises: [{ name: "Squat", sets: 3, reps: 10 }] }] });
  await fireEvent.press(screen.getByLabelText("Squat"));
  await fireEvent.press(screen.getByLabelText("Remove from session"));
  expect(screen.getByText("Nothing left in this session. Add something, or leave it empty and it counts as rest.")).toBeOnTheScreen();
  expect(screen.getByText("Empty session — the body has nothing to fill in.")).toBeOnTheScreen();

  await fireEvent.press(screen.getByText("Save the changes"));
  const doc = await saved(put);
  expect(doc.days[0]!.exercises).toEqual([]);
  expect(doc.days[0]!.kcalEstimate).toBeUndefined();
  put.mockRestore();
});

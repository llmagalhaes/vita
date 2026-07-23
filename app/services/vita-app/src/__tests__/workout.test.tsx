import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../i18n";
import i18n from "../i18n";
import { CaptureProvider } from "../capture/CaptureContext";
import { CapturePill } from "../capture/CapturePill";
import { CaptureSheet } from "../capture/CaptureSheet";
import WorkoutDetailScreen from "../../app/(main)/workout/[id]";
import { resetDbForTests } from "../db/db";
import { addLocalEntry, entriesForDay, type LocalEntry } from "../db/entries";
import { pendingCount } from "../db/outbox";
import type { WorkoutDetail } from "../api";
import type { HcSession } from "../health/healthConnect";

let mockEntryId = "";
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/home",
  useLocalSearchParams: () => ({ id: mockEntryId }),
}));

// Inject Health Connect sessions into the history strip (the stub returns []).
let mockHcSessions: HcSession[] = [];
jest.mock("../health/healthConnect", () => {
  const actual = jest.requireActual("../health/healthConnect");
  return { ...actual, getHealthReader: () => ({ ...actual.stubHealthReader(), readSessions: async () => mockHcSessions }) };
});

beforeEach(() => {
  resetDbForTests();
  mockHcSessions = [];
});
const t = (k: string) => i18n.t(k);

function Capture() {
  return (
    <CaptureProvider>
      <CapturePill />
      <CaptureSheet />
    </CaptureProvider>
  );
}

test("workout confirm card → confirm writes a workout entry via the outbox", async () => {
  await render(<Capture />);
  const input = screen.getByLabelText("Tell Vita what you had…");
  await fireEvent.changeText(input, "Leg day at the gym for 45 minutes");
  await fireEvent(input, "submitEditing");

  // workout-shaped confirm card: title + duration + muscle chips + estimate tag
  await waitFor(() => expect(screen.getByText("Leg day")).toBeOnTheScreen(), { timeout: 3000 });
  expect(screen.getByText("estimate")).toBeOnTheScreen();
  expect(screen.getByText("45 min")).toBeOnTheScreen();
  expect(screen.getByText("Quads")).toBeOnTheScreen();

  expect(entriesForDay(new Date())).toHaveLength(0);
  await fireEvent.press(screen.getByText("Confirm"));

  const entries = entriesForDay(new Date());
  expect(entries).toHaveLength(1);
  expect(entries[0]!.type).toBe("workout");
  expect((entries[0]!.detail as WorkoutDetail).muscles).toContain("quads");

  await waitFor(() => expect(pendingCount()).toBe(0), { timeout: 3000 });
});

test("workout detail renders muscles, exercises and the 30-day history strip", async () => {
  // an older workout so the history strip has more than the current one
  addLocalEntry({
    type: "workout",
    occurredAt: (() => {
      const d = new Date();
      d.setDate(d.getDate() - 4);
      return d.toISOString();
    })(),
    inputMethod: "text",
    isEstimate: true,
    detail: { title: "Push day", durationMin: 50, kcal: 340, muscles: ["chest"], exercises: [] } as WorkoutDetail,
  });
  const e: LocalEntry = addLocalEntry({
    type: "workout",
    occurredAt: new Date().toISOString(),
    inputMethod: "text",
    sourcePhrase: "Leg day, 45 minutes",
    isEstimate: true,
    detail: {
      title: "Leg day",
      durationMin: 45,
      kcal: 315,
      muscles: ["quads", "hamstrings", "glutes"],
      exercises: [{ name: "Back squat", sets: 4, reps: 8, loadKg: 80 }],
    } as WorkoutDetail,
  });
  mockEntryId = e.id;

  await render(<WorkoutDetailScreen />);

  // "Leg day" shows in both the hero and its own history chip
  expect(screen.getAllByText("Leg day").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("315")).toBeOnTheScreen();
  expect(screen.getByText("Back squat")).toBeOnTheScreen();
  expect(screen.getByText(/80 kg/)).toBeOnTheScreen(); // "4 × 8  ·  80 kg" in one node
  // muscle chip (i18n label) present
  expect(screen.getByText("Hamstrings")).toBeOnTheScreen();
  // both workouts show in the 30-day strip
  expect(screen.getByText("Push day")).toBeOnTheScreen();
});

test("muscle chip tap → info banner (label + role tag) + exercise-row wiring (§14.5a)", async () => {
  const e = addLocalEntry({
    type: "workout",
    occurredAt: new Date().toISOString(),
    inputMethod: "text",
    isEstimate: true,
    detail: {
      title: "Leg day",
      durationMin: 45,
      kcal: 315,
      muscles: ["quads", "glutes"],
      exercises: [
        { name: "Back squat", sets: 4, reps: 8, muscleRoles: [{ name: "quads", role: "primary" }, { name: "glutes", role: "primary" }] },
        { name: "Leg curl", sets: 3, reps: 12, muscleRoles: [{ name: "hamstrings", role: "primary" }] },
      ],
    } as WorkoutDetail,
  });
  mockEntryId = e.id;
  await render(<WorkoutDetailScreen />);

  // Tap the "Quads" chip → selected-muscle panel appears with the role tag and the
  // exercises that worked it (proves exercisesForMuscle → hitIndexes wiring).
  await fireEvent.press(screen.getByText("Quads"));
  expect(screen.getByText(t("workoutDetail.role.primary"))).toBeOnTheScreen();
  // Info banner names the hitting exercise (Back squat works quads, Leg curl doesn't):
  // it now appears twice — the exercises list row + the selected-muscle panel.
  expect(screen.getAllByText("Back squat").length).toBeGreaterThanOrEqual(2);
  // The muscle label now shows in both the readout and the panel.
  expect(screen.getAllByText("Quads").length).toBeGreaterThanOrEqual(2);
});

test("history rows: capture row (today tile · VIA CAPTURE · kcal) vs HC row (VIA HEALTH CONNECT, no kcal) (§14.5b)", async () => {
  const today = new Date();
  const e = addLocalEntry({
    type: "workout",
    occurredAt: today.toISOString(),
    inputMethod: "text",
    isEstimate: true,
    detail: { title: "Leg day", durationMin: 45, kcal: 315, muscles: ["quads"], exercises: [] } as WorkoutDetail,
  });
  mockEntryId = e.id;
  const older = new Date();
  older.setDate(older.getDate() - 4);
  mockHcSessions = [{ id: "hc-1", start: older.toISOString(), end: older.toISOString(), title: "Morning run", exerciseType: 56 }];

  await render(<WorkoutDetailScreen />);
  await waitFor(() => expect(screen.getByText("Morning run")).toBeOnTheScreen(), { timeout: 3000 });

  // Both source labels render (uppercased in copy).
  expect(screen.getByText(`${t("workoutDetail.via").toUpperCase()} ${t("workoutDetail.viaCapture").toUpperCase()}`)).toBeOnTheScreen();
  expect(screen.getByText(`${t("workoutDetail.via").toUpperCase()} ${t("workoutDetail.viaHealthConnect").toUpperCase()}`)).toBeOnTheScreen();
  // The today capture row's tile shows today's date number; HC row carries no kcal
  // (mergeHistory never fakes it) → the only "~… kcal" meta belongs to the capture row.
  expect(screen.getByText(new RegExp(`~315 ${t("common.kcal")}`))).toBeOnTheScreen();
  expect(screen.getByText(String(today.getDate()))).toBeOnTheScreen();
});

test("workout detail falls back when the entry is missing", async () => {
  mockEntryId = "nope";
  await render(<WorkoutDetailScreen />);
  expect(screen.getByText("This entry isn't available.")).toBeOnTheScreen();
});

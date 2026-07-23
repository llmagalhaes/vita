import { render, screen } from "@testing-library/react-native";
import "../i18n";
import WorkoutHub from "../tabs/WorkoutHub";
import { kvSet } from "../db/kv";
import { resetDbForTests } from "../db/db";
import type { TrainingProgramDraft } from "../api";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/workout",
}));

// HC reader stub returns [] (no sessions) so the history strip stays empty.
jest.mock("../health/healthConnect", () => {
  const actual = jest.requireActual("../health/healthConnect");
  return { ...actual, getHealthReader: () => ({ ...actual.stubHealthReader(), readSessions: async () => [] }) };
});

const seedProgram = () => {
  const doc: TrainingProgramDraft = {
    summary: "PPL",
    days: [
      { name: "Leg day", kcalEstimate: 430, exercises: [{ name: "Back squat", sets: 4, reps: 8, loadKg: 80 }, { name: "Leg press", sets: 3, reps: 12 }] },
      { name: "Upper body", kcalEstimate: 380, exercises: [{ name: "Bench press", sets: 4, reps: 8 }] },
    ],
  };
  kvSet("program.current", doc);
};

beforeEach(() => resetDbForTests());

test("no program → the dashed empty card", async () => {
  await render(<WorkoutHub />);
  expect(screen.getByText("No training program yet")).toBeOnTheScreen();
});

test("ready program → day chips, summary and exercise rows for the first day", async () => {
  seedProgram();
  await render(<WorkoutHub />);

  // both day chips render
  expect(screen.getByText("Upper body")).toBeOnTheScreen();
  expect(screen.getAllByText("Leg day").length).toBeGreaterThanOrEqual(1); // chip + summary
  // summary: kcal estimate + N of M exercises
  expect(screen.getByText("~430")).toBeOnTheScreen();
  expect(screen.getByText("2 of 2 exercises")).toBeOnTheScreen();
  // exercise rows
  expect(screen.getByText("Back squat")).toBeOnTheScreen();
  expect(screen.getByText("Leg press")).toBeOnTheScreen();
});

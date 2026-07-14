import { fireEvent, render, screen } from "@testing-library/react-native";
import "../i18n";
import TrainingProgramScreen from "../../app/(main)/program";
import { api, type TrainingProgramDraft } from "../api";
import { getCachedProgram, saveProgram } from "../db/plan";
import { resetDbForTests } from "../db/db";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
}));

const baseProgram: TrainingProgramDraft = {
  summary: "My split",
  splitDescription: "Push / Pull / Legs",
  days: [{ name: "Day 1 — Push", exercises: [{ name: "Bench press", sets: 4, reps: 8, loadKg: 60 }] }],
};

beforeEach(() => resetDbForTests());

test("Program edit mode edits fields and Save PUTs the whole doc", async () => {
  await saveProgram(structuredClone(baseProgram));
  const putSpy = jest.spyOn(api, "updateProgram");
  await render(<TrainingProgramScreen />);

  expect(screen.getByText("My split")).toBeOnTheScreen();

  await fireEvent.press(screen.getByText("Edit"));
  // Reps field carries value 8; bump to 10.
  await fireEvent.changeText(screen.getByLabelText("Reps"), "10");
  await fireEvent.press(screen.getByText("Save"));

  expect(putSpy).toHaveBeenCalledTimes(1);
  const doc = putSpy.mock.calls[0]![0];
  expect(doc.summary).toBe("My split"); // whole doc
  expect(doc.days[0]!.exercises[0]!.reps).toBe(10);
  expect(getCachedProgram()!.days[0]!.exercises[0]!.reps).toBe(10);
  putSpy.mockRestore();
});

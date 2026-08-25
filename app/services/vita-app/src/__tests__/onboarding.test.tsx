import { fireEvent, render, screen } from "@testing-library/react-native";
import "../i18n";
import en from "../i18n/locales/en.json";
import Onboarding from "../../app/onboarding";
import { resetDbForTests } from "../db/db";
import { getDomains } from "../db/domains";
import { kvSet } from "../db/kv";
import { getSettings, isOnboarded } from "../db/settings";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: (href: string) => mockReplace(href), push: (href: string) => mockPush(href) }),
}));

// The picker is the one thing a unit run cannot have; every other leg of the two
// setup steps is the real code the Library runs.
const mockImportPdf = jest.fn();
jest.mock("../onboarding/planImport", () => ({ importPdf: () => mockImportPdf() }));

const PLAN = {
  summary: "From a PDF",
  status: "ready",
  meals: [
    { name: "Breakfast", time: "08:00", items: [] },
    { name: "Lunch", time: "12:30", items: [] },
    { name: "Dinner", time: "19:30", items: [] },
  ],
};

const PROGRAM = {
  summary: "Upper / Lower",
  days: [
    { name: "Day A", exercises: [] },
    { name: "Day B", exercises: [] },
  ],
};

beforeEach(() => {
  resetDbForTests();
  mockReplace.mockClear();
  mockPush.mockClear();
  mockImportPdf.mockReset();
});

/** Walk from a fresh render to the eating step (name → keep → plan). */
async function toEatingStep() {
  await render(<Onboarding />);
  await fireEvent.changeText(screen.getByLabelText("Your name"), "Ana");
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.press(screen.getByText("Continue"));
}

test("four steps: name → what Vita keeps → eating plan → training → the Day panel (APP-137)", async () => {
  await render(<Onboarding />);

  // Step 1 — name only
  expect(screen.getByText("Welcome to Vita")).toBeOnTheScreen();
  expect(screen.getByText("What should we call you?")).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText("Your name"), "Ana");
  await fireEvent.press(screen.getByText("Continue"));

  // Step 2 — the five real composition rows, every one on by default
  expect(screen.getByText("What should Vita keep?")).toBeOnTheScreen();
  expect(screen.getByText("Meals & eating plan")).toBeOnTheScreen();
  expect(screen.getByText("morning readings · a weight trend")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Habits"));
  await fireEvent.press(screen.getByText("Continue"));

  // Step 3 — the eating plan: the Library's two routes, and an explicit skip
  expect(screen.getByText("Bring your eating plan?")).toBeOnTheScreen();
  expect(screen.getByText("Import a PDF")).toBeOnTheScreen();
  expect(screen.getByText("Build it here")).toBeOnTheScreen();
  // "Add a single meal" makes no sense with no plan — it is not offered here
  expect(screen.queryByText("Add a single meal")).toBeNull();
  expect(screen.getByText("You can do this anytime from the Library — nothing here has to happen today.")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Skip for now"));

  // Step 4 — training, same shape, and it is the last one
  expect(screen.getByText("Bring your training?")).toBeOnTheScreen();
  expect(screen.getByText("Import a PDF")).toBeOnTheScreen();
  expect(screen.getByText("Build it here")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Open Vita →"));

  expect(isOnboarded()).toBe(true);
  expect(getSettings()!.name).toBe("Ana");
  expect(getDomains()).toEqual({ meals: true, water: true, move: true, habits: false, weight: true });
  expect(mockReplace).toHaveBeenCalledWith("/day");
});

test("the CTA waits for a name, and Back walks one step at a time", async () => {
  await render(<Onboarding />);
  // No name yet → pressing the CTA must not advance
  await fireEvent.press(screen.getByText("Continue"));
  expect(screen.getByText("What should we call you?")).toBeOnTheScreen();

  await fireEvent.changeText(screen.getByLabelText("Your name"), "Lu");
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.press(screen.getByLabelText("Back"));
  expect(screen.getByText("What should we call you?")).toBeOnTheScreen();

  // Forward to the training step, then back up through the eating one
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.press(screen.getByText("Skip for now"));
  expect(screen.getByText("Bring your training?")).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText("Back"));
  expect(screen.getByText("Bring your eating plan?")).toBeOnTheScreen();
});

test("a step you turned off is never offered — no eating step without meals", async () => {
  await render(<Onboarding />);
  await fireEvent.changeText(screen.getByLabelText("Your name"), "Ana");
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.press(screen.getByText("Meals & eating plan"));
  await fireEvent.press(screen.getByText("Continue"));

  expect(screen.queryByText("Bring your eating plan?")).toBeNull();
  expect(screen.getByText("Bring your training?")).toBeOnTheScreen();
});

test("with neither meals nor movement kept, the flow is the old two-step one", async () => {
  await render(<Onboarding />);
  await fireEvent.changeText(screen.getByLabelText("Your name"), "Ana");
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.press(screen.getByText("Meals & eating plan"));
  await fireEvent.press(screen.getByText("Movement"));

  // The keep step is now the last one, so it carries the final CTA
  await fireEvent.press(screen.getByText("Open Vita →"));
  expect(isOnboarded()).toBe(true);
  expect(mockReplace).toHaveBeenCalledWith("/day");
});

test("the eating step pushes the EXISTING routes, PDF carrying the come-back-here param", async () => {
  mockImportPdf.mockResolvedValue({ status: "ready", fileRef: "f/1 2", name: "plan.pdf" });
  await toEatingStep();

  await fireEvent.press(screen.getByText("Build it here"));
  expect(mockPush).toHaveBeenCalledWith("/build-plan");

  await fireEvent.press(screen.getByText("Import a PDF"));
  expect(mockPush).toHaveBeenCalledWith("/plan-setup?mode=parse&ob=1&fileRef=f%2F1%202");
});

test("a cancelled picker leaves the choices exactly as they were", async () => {
  mockImportPdf.mockResolvedValue({ status: "cancelled" });
  await toEatingStep();
  await fireEvent.press(screen.getByText("Import a PDF"));
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getByText("Build it here")).toBeOnTheScreen();
});

test("the training step pushes the builder", async () => {
  await toEatingStep();
  await fireEvent.press(screen.getByText("Skip for now"));
  await fireEvent.press(screen.getByText("Build it here"));
  expect(mockPush).toHaveBeenCalledWith("/build-program");
});

test("coming back with the thing saved collapses the step to one line and the CTA reads Continue", async () => {
  kvSet("plan.current", PLAN);
  kvSet("program.current", PROGRAM);
  await toEatingStep();

  // Eating — rows gone, one done line, and a real Continue instead of a skip
  expect(screen.queryByText("Import a PDF")).toBeNull();
  expect(screen.getByText("3 meals · saved")).toBeOnTheScreen();
  expect(screen.queryByText("Skip for now")).toBeNull();
  await fireEvent.press(screen.getByText("Continue"));

  // Training — same, and the last step keeps its own CTA
  expect(screen.queryByText("Build it here")).toBeNull();
  expect(screen.getByText("Upper / Lower · 2 days")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Open Vita →"));
  expect(mockReplace).toHaveBeenCalledWith("/day");
});

test("onboarding copy stays calm — no mention of the machinery, no emoji (criterion 13)", () => {
  const copy = JSON.stringify(en.onboarding);
  expect(copy).not.toMatch(/\bAI\b|artificial intelligence|Claude/i);
  expect(copy).not.toMatch(/\p{Extended_Pictographic}/u);
  // Skipping is offered, and it says where the thing lives afterwards
  expect(en.onboarding.setup.skipNote).toMatch(/Library/);
});

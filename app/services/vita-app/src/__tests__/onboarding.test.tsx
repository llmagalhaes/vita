import { fireEvent, render, screen } from "@testing-library/react-native";
import "../i18n";
import Onboarding from "../../app/onboarding";
import { resetDbForTests } from "../db/db";
import { getSettings, isOnboarded } from "../db/settings";
import { getCachedPlan, getCachedProgram } from "../db/plan";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: (href: string) => mockReplace(href) }),
}));

beforeEach(() => {
  resetDbForTests();
  mockReplace.mockClear();
});

const next = () => fireEvent.press(screen.getByText("Next"));

test("full onboarding: name → keep-track → plan → program → connect → all set", async () => {
  await render(<Onboarding />);

  // Step 1 — name & units; Next disabled until a name is given
  expect(screen.getByText("What should we call you?")).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText("Your name"), "Ana");
  await fireEvent.press(screen.getByText("Imperial"));
  await next();

  // Step 2 — keep track chips, factual copy (no goals/scores)
  expect(screen.getByText("What would you like to keep an eye on?")).toBeOnTheScreen();
  expect(screen.getByText("Just your own reference — Vita never sets targets or scores.")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Water"));
  await fireEvent.press(screen.getByText("Workouts"));
  await next();

  // Step 3 — eating plan: describe → read back → summary is an estimate → confirm
  expect(screen.getByText("Do you follow an eating plan?")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Describe it"));
  await fireEvent.changeText(screen.getByLabelText("Do you follow an eating plan?"), "Low carb on weekdays. Flexible weekends");
  await fireEvent.press(screen.getByText("Read back"));
  // Read back now hits the REAL parse endpoint (mocked) → wait for the draft.
  expect(await screen.findByText("Plan summary")).toBeOnTheScreen();
  expect(screen.getByText("estimate")).toBeOnTheScreen();
  expect(screen.getByText("“Low carb on weekdays. Flexible weekends”")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Looks right"));
  expect(screen.getByText("Saved to your profile")).toBeOnTheScreen();
  await next();

  // Step 4 — training program: none
  expect(screen.getByText("A training program in progress?")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("No program"));
  expect(screen.getByText("No program — noted")).toBeOnTheScreen();
  await next();

  // Step 5 — connect apps (UI-only toggles in M1)
  expect(screen.getByText("Bring what you already use")).toBeOnTheScreen();
  await fireEvent.press(screen.getAllByText("Connect")[0]!); // Apple Health (Health Connect shows the same label)
  expect(screen.getByText("Connected")).toBeOnTheScreen();
  await next();

  // Step 6 — all set recap + philosophy, then Start
  expect(screen.getByText("All set, Ana.")).toBeOnTheScreen();
  expect(
    screen.getByText("Vita records what you tell it and shows it back — it never sets goals, grades your day, or gives advice."),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Start"));

  expect(isOnboarded()).toBe(true);
  const s = getSettings()!;
  expect(s.name).toBe("Ana");
  expect(s.units).toBe("imperial");
  expect(s.keepTrack).toMatchObject({ meals: true, water: true, workouts: true, habits: false, cycle: false });
  expect(s.connected.appleHealth).toBe(true);
  // Confirmed plan is POSTed and cached (kv is the offline display source);
  // program was declined → nothing persisted.
  expect(getCachedPlan()!.meals.length).toBeGreaterThan(0);
  expect(getCachedProgram()).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith("/home");
});

test("skippable paths: plan and program left unanswered land cleanly on Home", async () => {
  await render(<Onboarding />);
  await fireEvent.changeText(screen.getByLabelText("Your name"), "Lu");
  await next(); // → keep track
  await next(); // → plan (skip)
  await next(); // → program (skip)
  await next(); // → connect (skip)
  await next(); // → all set
  await fireEvent.press(screen.getByText("Start"));
  expect(isOnboarded()).toBe(true);
  expect(getCachedPlan()).toBeNull();
  expect(getCachedProgram()).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith("/home");
});

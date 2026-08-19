import { fireEvent, render, screen } from "@testing-library/react-native";
import "../i18n";
import Onboarding from "../../app/onboarding";
import { resetDbForTests } from "../db/db";
import { getDomains } from "../db/domains";
import { getSettings, isOnboarded } from "../db/settings";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: (href: string) => mockReplace(href) }),
}));

beforeEach(() => {
  resetDbForTests();
  mockReplace.mockClear();
});

test("two steps: name → what Vita keeps → the Day panel (APP-105)", async () => {
  await render(<Onboarding />);

  // Step 1 — name only; no plan, no program, no "connect apps"
  expect(screen.getByText("Welcome to Vita")).toBeOnTheScreen();
  expect(screen.getByText("What should we call you?")).toBeOnTheScreen();
  expect(
    screen.getByText("Two steps — that's the whole setup. Plans, programs and habits come later, when you need them."),
  ).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText("Your name"), "Ana");
  await fireEvent.press(screen.getByText("Continue"));

  // Step 2 — the five real composition rows, every one on by default
  expect(screen.getByText("What should Vita keep?")).toBeOnTheScreen();
  expect(screen.getByText("Your day is built from exactly this — anything you skip won't appear anywhere.")).toBeOnTheScreen();
  expect(
    screen.getByText("Change this anytime in the Library — turning something off hides it, it never deletes history."),
  ).toBeOnTheScreen();
  expect(screen.getByText("Meals & eating plan")).toBeOnTheScreen();
  expect(screen.getByText("morning readings · a weight trend")).toBeOnTheScreen();

  // Skipping one hides it — it is written as a real flag, not a preference blob
  await fireEvent.press(screen.getByText("Habits"));
  await fireEvent.press(screen.getByText("Open Vita →"));

  expect(isOnboarded()).toBe(true);
  expect(getSettings()!.name).toBe("Ana");
  expect(getDomains()).toEqual({ meals: true, water: true, move: true, habits: false, weight: true });
  expect(mockReplace).toHaveBeenCalledWith("/day");
});

test("the CTA waits for a name, and Back returns to step 1", async () => {
  await render(<Onboarding />);
  // No name yet → pressing the CTA must not advance
  await fireEvent.press(screen.getByText("Continue"));
  expect(screen.getByText("What should we call you?")).toBeOnTheScreen();

  await fireEvent.changeText(screen.getByLabelText("Your name"), "Lu");
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.press(screen.getByLabelText("Back"));
  expect(screen.getByText("What should we call you?")).toBeOnTheScreen();

  // Straight through with everything kept
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.press(screen.getByText("Open Vita →"));
  expect(getDomains()).toEqual({ meals: true, water: true, move: true, habits: true, weight: true });
  expect(mockReplace).toHaveBeenCalledWith("/day");
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import "../i18n";
import i18n from "../i18n";
import Account from "../../app/(main)/account";
import { resetDbForTests } from "../db/db";
import { getSettings, saveSettings, type Settings } from "../db/settings";
import { setNotifier, stubNotifier } from "../habits/notifier";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/account",
}));

const base: Settings = {
  name: "Sam",
  units: "metric",
  keepTrack: { meals: true, water: true, workouts: true, habits: true, cycle: false },
  connected: { appleHealth: false, healthConnect: false },
};

beforeEach(() => {
  resetDbForTests();
  saveSettings(base);
  setNotifier(stubNotifier());
});

const t = (k: string) => i18n.t(k);

test("renders the account sections, name and export entry", async () => {
  await render(<Account />);
  expect(screen.getByText("Sam")).toBeOnTheScreen();
  expect(screen.getByText(t("account.yourSetup"))).toBeOnTheScreen();
  expect(screen.getByText(t("account.exportTo"))).toBeOnTheScreen();
  expect(screen.getByText(t("account.signOut"))).toBeOnTheScreen();
  expect(screen.getByText(t("account.vacationMode"))).toBeOnTheScreen();
});

test("changing units in the profile applies everywhere (local settings updated)", async () => {
  await render(<Account />);
  await fireEvent.press(screen.getByText("Sam")); // expand profile
  await fireEvent.press(screen.getByText(t("onboarding.welcome.imperial")));
  expect(getSettings()!.units).toBe("imperial");
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import "../i18n";
import i18n from "../i18n";
import Account from "../../app/(main)/account";
import { resetDbForTests } from "../db/db";
import { saveSettings, type Settings } from "../db/settings";
import { isVacationActive, saveVacation } from "../db/vacation";
import { setNotifier, stubNotifier } from "../habits/notifier";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/account",
}));

const base: Settings = {
  name: "Sam",
  keepTrack: { meals: true, water: true, workouts: true, habits: true, cycle: false },
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

test("ending vacation asks for confirmation before actually ending it (APP-046)", async () => {
  const dayOffset = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  saveVacation({ ranges: [{ start: dayOffset(-1), end: dayOffset(1) }], keepCheckins: false, tripHabitIds: [] });
  expect(isVacationActive()).toBe(true);

  await render(<Account />);
  await fireEvent.press(screen.getByText(t("account.end"))); // the "End" button on the vacation card

  // confirm sheet is up; the trip must still be active — no immediate end
  expect(screen.getByText(t("account.endVacationConfirmTitle"))).toBeOnTheScreen();
  expect(isVacationActive()).toBe(true);

  // confirm (the sheet's own confirm button is also labelled "End") calls through
  const endButtons = screen.getAllByText(t("account.end"));
  await fireEvent.press(endButtons[endButtons.length - 1]);
  expect(isVacationActive()).toBe(false);
});

/**
 * APP-103 acceptance: the Library shows only real surfaces, gates on the
 * composition flags, and never loses anything without an Undo or a confirm.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import "../../i18n";
import i18n from "../../i18n";
import { LibraryPanel } from "../LibraryPanel";
import { resetDbForTests } from "../../db/db";
import { createHabit, listHabits } from "../../db/habits";
import { saveSettings, type Settings } from "../../db/settings";
import { setNotifier, stubNotifier } from "../../notify/notifier";
import { getToast, runToastUndo } from "../../ui/toast";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/library",
}));

const base: Settings = {
  name: "Sam",
  domains: { meals: true, water: true, move: true, habits: true, weight: true },
};

beforeEach(() => {
  resetDbForTests();
  saveSettings(base);
  setNotifier(stubNotifier());
  setPlatform("android");
});

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string;
/** Platform.OS is a plain readonly field in the RN mock — redefine it, don't assign. */
const setPlatform = (os: "android" | "ios") => Object.defineProperty(Platform, "OS", { value: os, configurable: true });

test("renders every section, and the on-device footer", async () => {
  await render(<LibraryPanel />);
  for (const key of [
    "library.keeps.title",
    "library.plan.title",
    "library.programs.title",
    "library.habits.title", // also a "what Vita keeps" row label — hence getAllByText
    "library.sources.title",
    "library.away.title",
    "library.account.title",
  ]) {
    expect(screen.getAllByText(t(key)).length).toBeGreaterThan(0);
  }
  expect(screen.getByText(t("library.footer"))).toBeOnTheScreen();
});

// The v3 Integrations screen listed sources Vita cannot read. v4 has exactly one.
test("no fake source row — Health Connect is the only one, and it is Android-only", async () => {
  await render(<LibraryPanel />);
  expect(screen.getByText(t("library.sources.healthConnect"))).toBeOnTheScreen();
  for (const fake of ["Garmin", "Strava", "Flo", "Apple Health"]) {
    expect(screen.queryByText(fake)).toBeNull();
  }

});

// CEO Q3: hidden entirely on iOS — not an empty section, not an Apple Health placeholder.
test("on iOS the Connected-sources section is not rendered at all", async () => {
  setPlatform("ios");
  await render(<LibraryPanel />);
  expect(screen.queryByText(t("library.sources.title"))).toBeNull();
  expect(screen.queryByText(t("library.sources.healthConnect"))).toBeNull();
  expect(screen.getByText(t("library.footer"))).toBeOnTheScreen(); // the rest still renders
});

test("a domain turned off hides its section here too (it never deletes it)", async () => {
  saveSettings({ ...base, domains: { meals: false, water: true, move: false, habits: false, weight: true } });
  await render(<LibraryPanel />);
  expect(screen.queryByText(t("library.plan.yourPlan"))).toBeNull();
  expect(screen.queryByText(t("library.programs.import"))).toBeNull();
  expect(screen.queryByText(t("library.habits.new"))).toBeNull();
  // …while the toggles that control them are still right there.
  expect(screen.getByText(t("library.keeps.title"))).toBeOnTheScreen();
  expect(screen.getByText(t("library.keeps.note"))).toBeOnTheScreen();
});

test("removing a habit is undoable and says history stays", async () => {
  createHabit({ name: "Walk the dog", days: Array(7).fill(true), time: "08:00", enabled: true });
  await render(<LibraryPanel />);

  await fireEvent.press(screen.getByLabelText(t("library.habits.removeLabel", { name: "Walk the dog" })));
  expect(listHabits()).toHaveLength(0);
  expect(getToast()?.text).toBe(t("library.habits.removedToast", { name: "Walk the dog" }));

  await act(async () => runToastUndo());
  expect(listHabits().map((h) => h.name)).toEqual(["Walk the dog"]);
});

test("deleting your data is a confirm with a way out, never a single tap", async () => {
  await render(<LibraryPanel />);
  await fireEvent.press(screen.getByText(t("library.account.delete")));
  expect(screen.getByText(t("library.account.deleteTitle"))).toBeOnTheScreen();
  // three ways out, exactly as the CEO specified
  expect(screen.getByText(t("library.account.keepIt"))).toBeOnTheScreen();
  expect(screen.getByText(t("library.account.exportFirst"))).toBeOnTheScreen();
  expect(screen.getByText(t("library.account.deleteConfirm"))).toBeOnTheScreen();
});

// The add form is the only place a habit is born — Vita never suggests one.
test("the add-habit form creates a real habit with Mon-first weekday circles", async () => {
  await render(<LibraryPanel />);
  await fireEvent.press(screen.getByText(t("library.habits.new")));

  // seven circles, Mon-first, all on by default. "S" is both Saturday and Sunday —
  // Mon-first means Sunday is the LAST of the two, which is the one dropped here.
  const letters = i18n.t("library.habits.dayLetters", { returnObjects: true }) as string[];
  expect(letters).toHaveLength(7);
  const sundays = screen.getAllByLabelText(letters[0]!);
  await fireEvent.press(sundays[sundays.length - 1]!);

  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(t("library.habits.nameLabel")), "Read 20 pages");
  });
  await fireEvent.press(screen.getByText(t("library.habits.save")));

  const [habit] = listHabits();
  expect(habit!.name).toBe("Read 20 pages");
  expect(habit!.days[0]).toBe(false); // storage stays Sunday-first
  expect(habit!.days.slice(1).every(Boolean)).toBe(true);
  expect(getToast()?.text).toBe(t("library.habits.addedToast", { name: "Read 20 pages" }));
});

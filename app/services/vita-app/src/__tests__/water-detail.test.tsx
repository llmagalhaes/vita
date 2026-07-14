import { render, screen } from "@testing-library/react-native";
import "../i18n";
import i18n from "../i18n";
import WaterDetailScreen from "../../app/(main)/water/[id]";
import { formatVolume } from "../lib/units";
import { addLocalEntry } from "../db/entries";
import { resetDbForTests } from "../db/db";

let mockEntryId = "";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: mockEntryId }),
}));

beforeEach(() => resetDbForTests());

const t = (k: string) => i18n.t(k);

test("formatVolume: metric ml/L and imperial oz", () => {
  expect(formatVolume(250, "metric", t)).toBe("250 ml");
  expect(formatVolume(1250, "metric", t)).toBe("1.25 L");
  expect(formatVolume(250, "imperial", t)).toBe("8 oz"); // 250 / 29.5735 ≈ 8.5 → 8 rounded? 8.45 → 8
});

test("Water detail shows the entry and that day's water log with method", async () => {
  addLocalEntry({
    type: "water",
    occurredAt: new Date().toISOString(),
    inputMethod: "voice",
    isEstimate: false,
    detail: { amountMl: 500 },
  });
  const e = addLocalEntry({
    type: "water",
    occurredAt: new Date().toISOString(),
    inputMethod: "tap",
    isEstimate: false,
    detail: { amountMl: 250 },
  });
  mockEntryId = e.id;

  await render(<WaterDetailScreen />);

  // hero amount + eyebrow
  expect(screen.getAllByText("250 ml").length).toBeGreaterThan(0);
  expect(screen.getByText("Water")).toBeOnTheScreen();
  // both of the day's entries in the log, with method labels
  expect(screen.getByText("500 ml")).toBeOnTheScreen();
  expect(screen.getByText("quick add")).toBeOnTheScreen();
  expect(screen.getByText("logged by voice")).toBeOnTheScreen();
  // day total 750 shown
  expect(screen.getByText("750 ml")).toBeOnTheScreen();
});

test("Water detail shows a fallback when the entry is missing", async () => {
  mockEntryId = "does-not-exist";
  await render(<WaterDetailScreen />);
  expect(screen.getByText("This entry isn't available.")).toBeOnTheScreen();
});

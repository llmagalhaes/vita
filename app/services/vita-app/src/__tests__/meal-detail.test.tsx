import { render, screen } from "@testing-library/react-native";
import "../i18n";
import MealDetailScreen from "../../app/(main)/meal/[id]";
import { addLocalEntry } from "../db/entries";
import { resetDbForTests } from "../db/db";

let mockEntryId = "";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: mockEntryId }),
}));

beforeEach(() => resetDbForTests());

function seedMeal() {
  const e = addLocalEntry({
    type: "meal",
    occurredAt: new Date().toISOString(),
    inputMethod: "voice",
    sourcePhrase: "Yogurt with granola after the gym",
    isEstimate: true,
    detail: {
      title: "Yogurt & granola",
      items: [
        {
          name: "Yogurt",
          quantity: 170,
          unit: "g",
          kcal: 100,
          proteinG: 10,
          carbsG: 8,
          fatG: 2.5,
          micros: [{ name: "Calcium", amount: 210, unit: "mg", percentDaily: 16 }],
        },
        {
          name: "Granola",
          quantity: 30,
          unit: "g",
          kcal: 140,
          proteinG: 4.8,
          carbsG: 25,
          fatG: 4.2,
          micros: [{ name: "Calcium", amount: 40, unit: "mg", percentDaily: 3 }],
        },
      ],
      totals: { kcal: 240, proteinG: 14.8, carbsG: 33, fatG: 6.7 },
    },
  });
  mockEntryId = e.id;
}

test("Meal detail renders phrase, items, macros and micros from SQLite", async () => {
  seedMeal();
  await render(<MealDetailScreen />);

  expect(screen.getByText("Yogurt & granola")).toBeOnTheScreen();
  // original phrase quoted with input method
  expect(screen.getByText(/Yogurt with granola after the gym/)).toBeOnTheScreen();
  expect(screen.getByText(/logged by voice/)).toBeOnTheScreen();
  // total kcal (hero + donut centre)
  expect(screen.getAllByText("240").length).toBeGreaterThan(0);
  // item breakdown
  expect(screen.getByText("Yogurt")).toBeOnTheScreen();
  expect(screen.getByText("Granola")).toBeOnTheScreen();
  // micros aggregated across items (Calcium 210 + 40 = 250 mg)
  expect(screen.getByText("Calcium")).toBeOnTheScreen();
  expect(screen.getByText("250 mg")).toBeOnTheScreen();
  // estimate labeled + footer
  expect(screen.getByText("estimate")).toBeOnTheScreen();
  expect(screen.getByText("Estimated by Vita from your description.")).toBeOnTheScreen();
});

test("Meal detail shows a fallback when the entry is missing", async () => {
  mockEntryId = "does-not-exist";
  await render(<MealDetailScreen />);
  expect(screen.getByText("This entry isn't available.")).toBeOnTheScreen();
});

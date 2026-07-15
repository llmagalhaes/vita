import { render, screen } from "@testing-library/react-native";
import "../i18n";
import Home from "../tabs/Home";
import { addLocalEntry } from "../db/entries";
import { resetDbForTests } from "../db/db";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/home",
}));

beforeEach(() => resetDbForTests());

test("Home renders today's entries from SQLite with labeled estimates", async () => {
  addLocalEntry({
    type: "meal",
    occurredAt: new Date().toISOString(),
    inputMethod: "voice",
    sourcePhrase: "banana and peanuts",
    isEstimate: true,
    detail: {
      title: "Banana & peanuts",
      items: [{ name: "Banana", kcal: 105 }],
      totals: { kcal: 265, proteinG: 8.3, carbsG: 32, fatG: 14.4 },
    },
  });
  addLocalEntry({
    type: "water",
    occurredAt: new Date().toISOString(),
    inputMethod: "tap",
    isEstimate: false,
    detail: { amountMl: 250 },
  });

  await render(<Home />);

  // kcal hero: meal totals only, labeled as estimates ("265" also shows in the energy card)
  expect(screen.getAllByText("265").length).toBeGreaterThan(0);
  expect(screen.getByText("estimates")).toBeOnTheScreen();
  // timeline v2: meal card title + kcal badge (labeled an estimate with ~)
  expect(screen.getByText("Banana & peanuts")).toBeOnTheScreen();
  expect(screen.getByText("~265 kcal")).toBeOnTheScreen();
  expect(screen.getAllByText("250 ml").length).toBeGreaterThan(0); // water card total + timeline marker
  // pending entries visibly unsynced (v2 rows keep the sync note)
  expect(screen.getAllByText(/waiting to sync/).length).toBeGreaterThan(0);
});

test("Home shows the calm empty state when nothing is logged", async () => {
  await render(<Home />);
  expect(screen.getByText("Nothing logged yet today. Tell Vita below.")).toBeOnTheScreen();
  expect(screen.getAllByText("0").length).toBeGreaterThan(0);
});

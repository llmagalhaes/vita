/**
 * Wiring smoke for the v4 shell: all three panels mount at once (the session-6
 * lesson — nothing to grow mid-gesture), the tabs render, and the swipe hint is
 * present until `nav.swiped` is set.
 */
import { render, screen } from "@testing-library/react-native";
import "../../i18n";
import { PanelShell } from "../PanelShell";
import { resetDbForTests } from "../../db/db";
import { setNavSwiped } from "../../db/plan";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/day",
}));

beforeEach(() => resetDbForTests());

test("mounts Trends, Day and Library together, with the tabs and the hint", async () => {
  await render(<PanelShell />);
  // Placeholder panels still show their title next to the tab label; the Day panel
  // is real now (APP-097) — it opens on the scenic greeting, not a "Today" heading,
  // so its proof of mounting is the Overview zone label.
  expect(screen.getAllByText("Trends").length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText("Library").length).toBeGreaterThanOrEqual(2);
  // Two "Today"s on screen since APP-099: the panel tab and the dock's day label.
  expect(screen.getAllByText("Today").length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText("Overview")).toBeTruthy(); // the Day panel
  expect(screen.getByText(/swipe from an edge/i)).toBeTruthy();
});

test("the hint is retired once the user has swiped", async () => {
  setNavSwiped();
  await render(<PanelShell />);
  expect(screen.queryByText(/swipe from an edge/i)).toBeNull();
});

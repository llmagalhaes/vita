/**
 * Wiring smoke for the v4 shell: all three panels mount at once (the session-6
 * lesson — nothing to grow mid-gesture), the tabs render, and the swipe hint is
 * present until `nav.swiped` is set.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../../i18n";
import { PopHost } from "../../ui/popHost";
import { PanelShell } from "../PanelShell";
import { resetDbForTests } from "../../db/db";
import { setNavSwiped } from "../../db/plan";

const mockReplace = jest.fn();
let mockPathname = "/day";
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => mockPathname,
}));

beforeEach(() => {
  resetDbForTests();
  mockReplace.mockClear();
  mockPathname = "/day";
});

test("mounts Trends, Day and Library together, with the tabs and the hint", async () => {
  await render(<><PanelShell /><PopHost /></>);
  // Placeholder panels still show their title next to the tab label; the Day panel
  // is real now (APP-097) — it opens on the scenic greeting, not a "Today" heading,
  // so its proof of mounting is the Overview zone label.
  expect(screen.getAllByText("Trends").length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText("Library").length).toBeGreaterThanOrEqual(2);
  // Two "Today"s on screen since APP-099: the panel tab and the dock's day label.
  expect(screen.getAllByText("Today").length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText("Overview")).toBeTruthy(); // the Day panel
  expect(screen.getByText(/swipe left or right/i)).toBeTruthy();
});

test("the hint is retired once the user has swiped", async () => {
  setNavSwiped();
  await render(<><PanelShell /><PopHost /></>);
  expect(screen.queryByText(/swipe left or right/i)).toBeNull();
});

/**
 * CEO batch #1 — the tabs were dead on device: `settle()` wrote `idxRef` before
 * `router.replace`, so the route→panel effect saw "already there" and the row never
 * translated. A tap must still reach the route, and must NOT retire the swipe hint
 * (that belongs to a real swipe).
 *
 * R18-A: the URL commit now waits out the 300ms snap (it used to land a whole React
 * tree on the UI thread mid-tween — the CEO's "leve travadinha"), hence the waitFor.
 * The highlighted chip no longer comes from the URL at all: `mockPathname` is still
 * "/day" here, so a chip on Library proves it follows the row (`shown`), not the route.
 *
 * ponytail: the row's translateX is a Reanimated value that this environment never
 * advances, so the motion itself is proven on the device, not here.
 */
test("a tab tap routes (after the snap), highlights ahead of the URL, and is not a swipe", async () => {
  await render(<><PanelShell /><PopHost /></>);
  fireEvent.press(screen.getAllByRole("tab")[2]!); // Trends · Day · Library
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/library"));
  expect(mockPathname).toBe("/day"); // the mock router never moves it — the chip can't be reading it
  expect(screen.getAllByRole("tab").map((tab) => tab.props.accessibilityState.selected)).toEqual([false, false, true]);
  expect(screen.getByText(/swipe left or right/i)).toBeTruthy();
});

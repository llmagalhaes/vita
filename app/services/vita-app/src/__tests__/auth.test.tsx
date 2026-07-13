import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../i18n";
import Auth from "../../app/auth";
import { _resetForTests } from "../auth/session";
import * as SecureStore from "expo-secure-store";

// Redirect renders its target so we can assert where the auth gate sends the user.
jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  return { Redirect: ({ href }: { href: string }) => <Text>redirect:{href}</Text> };
});

// Controllable deep-link source. getInitialURL is the cold-start injection point.
// `mock`-prefixed so jest.mock's hoisting allows the reference.
const mockLink: { initialUrl: string | null } = { initialUrl: null };
jest.mock("expo-linking", () => ({
  parse: (url: string) => {
    const [scheme, rest = ""] = url.split("://");
    const [hostname, query = ""] = rest.split("?");
    const queryParams = Object.fromEntries(new URLSearchParams(query));
    return { scheme, hostname, path: null, queryParams };
  },
  createURL: (path: string, opts: { queryParams?: Record<string, string> }) =>
    `vita://${path}?${new URLSearchParams(opts?.queryParams).toString()}`,
  getInitialURL: () => Promise.resolve(mockLink.initialUrl),
  addEventListener: () => ({ remove: () => {} }),
  openURL: () => Promise.resolve(),
}));

beforeEach(() => {
  (SecureStore as unknown as { __clear: () => void }).__clear();
  _resetForTests();
  mockLink.initialUrl = null;
});

// Unmount, then let the mock api's pending timers settle so their state updates
// don't bleed into the next test as an overlapping act().
afterEach(async () => {
  cleanup();
  await act(() => new Promise((r) => setTimeout(r, 350)));
});

test("idle sign-in shows both providers and the email link path", async () => {
  await render(<Auth />);
  expect(screen.getByText("Continue with Google")).toBeOnTheScreen();
  expect(screen.getByText("Continue with Apple")).toBeOnTheScreen();
  expect(screen.getByText("Send link")).toBeOnTheScreen();
  expect(screen.getByText("No passwords — ever. The link signs you in.")).toBeOnTheScreen();
});

test("tapping a provider shows the consent step with the 'nothing else' copy", async () => {
  await render(<Auth />);
  fireEvent.press(screen.getByRole("button", { name: "Continue with Google" }));
  await waitFor(() =>
    expect(
      screen.getByText("Vita receives your name and email — nothing else. No posting, no contacts."),
    ).toBeOnTheScreen(),
  );
});

test("email flow lands on the check-your-inbox state", async () => {
  await render(<Auth />);
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText("you@email.com"), "ana@example.com");
  });
  fireEvent.press(screen.getByRole("button", { name: "Send link" }));
  await waitFor(() => expect(screen.getByText("Check your inbox")).toBeOnTheScreen());
  expect(screen.getByText("ana@example.com")).toBeOnTheScreen();
});

// Documented deep-link injection: a cold start on vita://auth?token=… exchanges
// the token and the gate redirects to onboarding (fresh account, not onboarded).
test("magic-link deep link exchanges the token and leaves the sign-in screen", async () => {
  mockLink.initialUrl = "vita://auth?token=ok";
  await render(<Auth />);
  await waitFor(() => expect(screen.getByText("redirect:/onboarding")).toBeOnTheScreen());
});

test("an expired deep-link token shows calm error copy, staying on sign-in", async () => {
  mockLink.initialUrl = "vita://auth?token=expired";
  await render(<Auth />);
  await waitFor(() =>
    expect(
      screen.getByText(
        "That sign-in link didn't work — it may have expired or already been used. Ask for a fresh one below.",
      ),
    ).toBeOnTheScreen(),
  );
});

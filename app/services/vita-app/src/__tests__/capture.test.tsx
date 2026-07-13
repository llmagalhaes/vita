import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../i18n";
import { CaptureProvider } from "../capture/CaptureContext";
import { CapturePill } from "../capture/CapturePill";
import { CaptureSheet } from "../capture/CaptureSheet";
import { resetDbForTests } from "../db/db";
import { entriesForDay } from "../db/entries";
import { pendingCount } from "../db/outbox";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => "/home",
}));

beforeEach(() => resetDbForTests());

function Harness() {
  return (
    <CaptureProvider>
      <CapturePill />
      <CaptureSheet />
    </CaptureProvider>
  );
}

test("text capture: phrase → making sense → confirmation card → confirm writes via outbox", async () => {
  await render(<Harness />);

  const input = screen.getByLabelText("Tell Vita what you had…");
  await fireEvent.changeText(input, "Had a banana and a handful of peanuts around 4");
  await fireEvent(input, "submitEditing");

  // parsing state, phrase quoted verbatim
  expect(screen.getByText("Making sense of it…")).toBeOnTheScreen();
  expect(screen.getByText("“Had a banana and a handful of peanuts around 4”")).toBeOnTheScreen();

  // confirmation card with estimate tag
  await waitFor(() => expect(screen.getByText("Banana & Peanuts")).toBeOnTheScreen(), { timeout: 3000 });
  expect(screen.getByText("estimate")).toBeOnTheScreen();
  expect(screen.getByText("Confirm")).toBeOnTheScreen();
  expect(screen.getByText("Adjust")).toBeOnTheScreen();

  // nothing entered the log before confirmation
  expect(entriesForDay(new Date())).toHaveLength(0);

  await fireEvent.press(screen.getByText("Confirm"));
  const entries = entriesForDay(new Date());
  expect(entries).toHaveLength(1);
  expect(entries[0]!.sourcePhrase).toBe("Had a banana and a handful of peanuts around 4");

  // background sync drains the outbox (mock api succeeds)
  await waitFor(() => expect(pendingCount()).toBe(0), { timeout: 3000 });
});

test("multiple drafts stack: meal + water confirmed one by one", async () => {
  await render(<Harness />);

  const input = screen.getByLabelText("Tell Vita what you had…");
  await fireEvent.changeText(input, "had a sandwich and a big glass of water");
  await fireEvent(input, "submitEditing");

  await waitFor(() => expect(screen.getByText("1 of 2")).toBeOnTheScreen(), { timeout: 3000 });
  await fireEvent.press(screen.getByText("Confirm"));
  expect(screen.getByText("2 of 2")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Confirm"));

  const entries = entriesForDay(new Date());
  expect(entries.map((e) => e.type).sort()).toEqual(["meal", "water"]);

  // let the background sync settle before the db is reset
  await waitFor(() => expect(pendingCount()).toBe(0), { timeout: 3000 });
});

test("adjust returns the phrase to the field; nothing is logged", async () => {
  await render(<Harness />);

  const input = screen.getByLabelText("Tell Vita what you had…");
  await fireEvent.changeText(input, "banana");
  await fireEvent(input, "submitEditing");

  await waitFor(() => expect(screen.getByText("Adjust")).toBeOnTheScreen(), { timeout: 3000 });
  await fireEvent.press(screen.getByText("Adjust"));

  expect(screen.getByLabelText("Tell Vita what you had…").props.value).toBe("banana");
  expect(entriesForDay(new Date())).toHaveLength(0);
});

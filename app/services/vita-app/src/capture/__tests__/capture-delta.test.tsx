/**
 * APP-104 — the capture → plan-delta → day-record path, end to end through the
 * real pill + sheet + mock parse.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../../i18n";
import { handoffPlanV3 } from "../../api/mock";
import type { MealDetail } from "../../api/client";
import { CaptureProvider } from "../CaptureContext";
import { CapturePill } from "../CapturePill";
import { CaptureSheet } from "../CaptureSheet";
import { dayKey } from "../../day/record";
import { resetDbForTests } from "../../db/db";
import { entriesForDay, getEntry } from "../../db/entries";
import { adoptServerPlan } from "../../db/plan";
import { getToast, runToastUndo } from "../../ui/toast";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => "/day",
}));

const FIELD = "e.g. lunch as planned, rice → sweet potato";

beforeEach(() => {
  resetDbForTests();
  // A saved plan (0.8.0 "m-N" meal ids) is what makes the delta path reachable.
  const doc = handoffPlanV3();
  adoptServerPlan({ ...doc, meals: doc.meals.map((m, i) => ({ ...m, id: m.id ?? `m-${i + 1}` })) });
});

const Harness = () => (
  <CaptureProvider>
    <CapturePill />
    <CaptureSheet />
  </CaptureProvider>
);

async function say(phrase: string) {
  await render(<Harness />);
  await fireEvent.press(screen.getByLabelText("Type what happened"));
  const input = await screen.findByLabelText(FIELD);
  await fireEvent.changeText(input, phrase);
  await fireEvent(input, "submitEditing");
}

test("a swap is a plan delta, not a loose meal — Record it writes ONE day record", async () => {
  await say("lunch as planned, but I swapped the steamed corn for sweet potato");

  await waitFor(() => expect(screen.getByText("Matched to your plan")).toBeOnTheScreen(), { timeout: 3000 });
  expect(screen.getByText("Lunch")).toBeOnTheScreen();
  expect(screen.getByText("adjusted")).toBeOnTheScreen();
  expect(screen.getByText("everything else as planned — an estimate, labelled as one")).toBeOnTheScreen();
  expect(entriesForDay(new Date())).toHaveLength(0); // nothing recorded before the tap

  await fireEvent.press(screen.getByText("Record it"));

  const entries = entriesForDay(new Date());
  expect(entries).toHaveLength(1);
  const detail = entries[0]!.detail as MealDetail;
  expect(entries[0]!.id).toBe(`meal:${dayKey()}:${detail.planMealId}`); // deterministic = idempotent
  expect(detail.planStatus).toBe("adjusted");
  expect(detail.items.every((i) => i.replacesItemId != null)).toBe(true);
});

test("Undo removes a record the meal did not have before", async () => {
  await say("had lunch");
  await waitFor(() => expect(screen.getByText("Record it")).toBeOnTheScreen(), { timeout: 3000 });
  await fireEvent.press(screen.getByText("Record it"));

  const id = entriesForDay(new Date())[0]!.id;
  expect(getToast()?.undo).toBeDefined();
  runToastUndo();
  expect(getEntry(id)).toBeNull();
  expect(entriesForDay(new Date())).toHaveLength(0);
});

test("an off-plan meal keeps the v3 loose card and is still recordable", async () => {
  await say("had a banana");
  await waitFor(() => expect(screen.getByText("Confirm")).toBeOnTheScreen(), { timeout: 3000 });
  expect(screen.queryByText("Matched to your plan")).toBeNull();

  await fireEvent.press(screen.getByText("Confirm"));
  expect(entriesForDay(new Date())).toHaveLength(1);
});

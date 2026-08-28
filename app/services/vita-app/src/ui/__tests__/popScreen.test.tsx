/**
 * R19 (APP-142) — the two rules that make the OS-presented pop safe.
 *
 * 1. The entry is id-OWNED. A Day timeline renders one `<PopOverlay native>` per meal,
 *    so on every render four CLOSED pops run alongside the open one; if any of them
 *    could clear the store the open card would blank out mid-pop.
 * 2. The screen's unmount closes the owner. Android hardware back / iOS swipe dismiss
 *    the screen without ever calling the backdrop's `onClose`, so `visible` would stay
 *    true and the pop could never be reopened. And the close it fires must be the
 *    CURRENT one — the stale closure from the open render would re-apply its write.
 */
import { act, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { Text } from "react-native";
import { PopScreenContent, isPopScreenOpen, setPopScreen } from "../popScreen";

const closeRef = (fn: () => void) => {
  const r = createRef<() => void>() as { current: () => void };
  r.current = fn;
  return r;
};

it("renders the open owner's card and ignores a closed sibling's clear", async () => {
  const noop = closeRef(() => {});
  setPopScreen("meal-2", <Text>Oats</Text>, noop);
  setPopScreen("meal-1", null, noop); // a sibling MealNode unmounting — not its entry
  await render(<PopScreenContent />);
  expect(screen.getByText("Oats")).toBeOnTheScreen();
});

it("closes the owner when the screen goes away, with the latest close", async () => {
  const calls: string[] = [];
  const ref = closeRef(() => calls.push("stale"));
  setPopScreen("meal-2", <Text>Oats</Text>, ref);
  const view = await render(<PopScreenContent />);
  expect(isPopScreenOpen()).toBe(true);

  ref.current = () => calls.push("fresh"); // the owner re-rendered while the pop was up
  await view.unmount(); // hardware back / swipe dismiss
  expect(calls).toEqual(["fresh"]);
  expect(isPopScreenOpen()).toBe(false); // so the owner's close path won't pop the panel too
});

/**
 * 3. A pop reopened INSIDE the previous screen's fade-out (React Navigation keeps a
 *    popped screen mounted until its dismissal animation ends). The old screen's
 *    unmount lands last and must not touch the new pop — otherwise the card blanks and
 *    an empty `/pop` route stays on the stack with the panels frozen under it (F1).
 *    Same owner id on purpose: the id is the owner's, so a stamp per OPEN is the only
 *    thing that tells the two apart.
 */
it("a pop reopened during the old screen's fade-out survives that screen's unmount", async () => {
  const calls: string[] = [];
  setPopScreen("meal-2", <Text>A</Text>, closeRef(() => calls.push("closeA")), true);
  const first = await render(<PopScreenContent />);

  // Closed → the screen is popped but still drawing; B opens before it goes away.
  await act(async () => {
    setPopScreen("meal-2", <Text>B</Text>, closeRef(() => calls.push("closeB")), true);
  });
  const second = await render(<PopScreenContent />);
  expect(second.getByText("B")).toBeTruthy();

  await first.unmount(); // the old fade finally ends
  expect(calls).toEqual([]); // B is untouched — nothing closed
  expect(isPopScreenOpen()).toBe(true); // and /pop is still up, so back() still works
  expect(second.getByText("B")).toBeTruthy();

  await second.unmount();
  expect(calls).toEqual(["closeB"]);
  expect(isPopScreenOpen()).toBe(false);
});

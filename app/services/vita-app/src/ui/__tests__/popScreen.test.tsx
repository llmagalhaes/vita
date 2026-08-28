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
import { render, screen } from "@testing-library/react-native";
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

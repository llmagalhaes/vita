/**
 * APP-118 — the meal skeleton (handoff v4.2 §2.2, criterion 4) and the count
 * row's ceiling logic (criteria 3 and 15).
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CountChips, MSLOT, skel } from "../parts";

const names = (n: number) => skel(n).map(([name]) => name);

describe("skel", () => {
  it("gives n = 7 the handoff's exact list, in clock order (criterion 4)", () => {
    expect(skel(7)).toEqual([
      ["Breakfast", "07:00"],
      ["Morning snack", "09:30"],
      ["Lunch", "12:30"],
      ["Afternoon snack", "16:00"],
      ["Pre-workout", "17:30"],
      ["Dinner", "19:30"],
      ["Supper", "21:30"],
    ]);
  });

  it("adds one recognisable slot per count, 3 → 10", () => {
    expect(names(3)).toEqual(["Breakfast", "Lunch", "Dinner"]);
    expect(names(4)).toEqual(["Breakfast", "Lunch", "Afternoon snack", "Dinner"]);
    expect(names(5)).toEqual(["Breakfast", "Morning snack", "Lunch", "Afternoon snack", "Dinner"]);
    expect(names(6)).toEqual(["Breakfast", "Morning snack", "Lunch", "Afternoon snack", "Dinner", "Supper"]);
    expect(names(8)).toEqual([...names(7).slice(0, 6), "Post-workout", "Supper"]);
    expect(names(9)).toEqual(["Breakfast", "Morning snack", "Late morning", "Lunch", "Afternoon snack", "Pre-workout", "Dinner", "Post-workout", "Supper"]);
    expect(names(10)).toEqual(MSLOT.map(([name]) => name));
  });

  it("never returns nothing and never goes past ten", () => {
    expect(names(0)).toEqual(["Breakfast"]);
    expect(names(-3)).toEqual(["Breakfast"]);
    expect(skel(99)).toHaveLength(10);
  });

  it("leaves MSLOT alone — the sorts run on a copy", () => {
    const before = MSLOT.map(([name]) => name);
    skel(7);
    expect(MSLOT.map(([name]) => name)).toEqual(before);
  });
});

describe("CountChips", () => {
  it("shows the current value as an extra chip once it is past the base row", async () => {
    await render(<CountChips values={[3, 4, 5, 6]} value={8} onChange={jest.fn()} />);
    expect(screen.getByLabelText("8")).toBeTruthy();
    expect(screen.getByLabelText("8").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("4").props.accessibilityState.selected).toBe(false);
  });

  it("climbs by one and stops at the ceiling", async () => {
    const onChange = jest.fn();
    const { rerender } = await render(<CountChips values={[3, 4, 5, 6]} value={9} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText("+"));
    expect(onChange).toHaveBeenCalledWith(10);
    await rerender(<CountChips values={[3, 4, 5, 6]} value={10} onChange={onChange} />);
    expect(screen.queryByLabelText("+")).toBeNull(); // the + is gone at 10
  });
});

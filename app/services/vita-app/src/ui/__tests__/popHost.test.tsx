/**
 * R18-B — the portal host must key its nodes by portal id, not by array position.
 *
 * `usePortal(null)` DELETES a key and reopening APPENDS it, so the Map reorders in
 * normal use (a sheet opens over the panel tabs, the tabs unmount, the sheet slides
 * from index 1 to index 0). Unkeyed, React reconciled the survivor against its
 * neighbour's fiber: same element type, different content → the whole subtree is
 * torn down and rebuilt, which drops a focused TextInput and replays the sheet's
 * entrance animation. The check is simply "state survives a sibling leaving".
 */
import { render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { PopHost, usePortal } from "../popHost";

/** Holds state in the PORTALED tree, so a remount is visible as a reset. */
function Counter({ label }: { label: string }) {
  const [n] = useState(() => `${label}-${++seq}`);
  return (
    <View>
      <Text>{n}</Text>
    </View>
  );
}
let seq = 0;

function Portal({ on, label }: { on: boolean; label: string }) {
  return usePortal(on ? <Counter label={label} /> : null);
}

function Harness({ first }: { first: boolean }) {
  return (
    <>
      <Portal on={first} label="a" />
      <Portal on label="b" />
      <PopHost />
    </>
  );
}

it("keeps a portal's subtree mounted when an earlier portal closes", async () => {
  seq = 0;
  const { rerender } = await render(<Harness first />);
  const b = screen.getByText(/^b-/).props.children as string;

  await rerender(<Harness first={false} />); // "a" closes → "b" shifts from index 1 to 0
  expect(screen.queryByText(/^a-/)).toBeNull();
  expect(screen.getByText(b)).toBeOnTheScreen(); // same instance, never remounted
});

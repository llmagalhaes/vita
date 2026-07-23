import { getToast, runToastUndo, showToast } from "../toast";

// The non-trivial bits of the toast store: auto-hide timing (2200 plain / 3600 with
// undo), replacement re-timing + cancelling the prior undo, and the undo callback.
test("showToast shows, a later toast replaces it, and it auto-hides at 2200ms", () => {
  jest.useFakeTimers();
  try {
    showToast("first");
    expect(getToast()?.text).toBe("first");

    jest.advanceTimersByTime(2199); // just shy of "first" expiring
    showToast("second"); // replaces → resets the 2200ms timer
    expect(getToast()?.text).toBe("second");

    jest.advanceTimersByTime(2199); // "first"'s window would be long gone; "second" still up
    expect(getToast()?.text).toBe("second");

    jest.advanceTimersByTime(1); // cross 2200ms since "second"
    expect(getToast()).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test("a toast with undo stays 3600ms, not 2200ms", () => {
  jest.useFakeTimers();
  try {
    showToast("undoable", { undo: () => {} });
    jest.advanceTimersByTime(2200);
    expect(getToast()?.text).toBe("undoable"); // plain window passed, still up
    jest.advanceTimersByTime(1400); // cross 3600
    expect(getToast()).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test("runToastUndo runs the callback once and dismisses", () => {
  jest.useFakeTimers();
  try {
    const undo = jest.fn();
    showToast("done · Meat", { undo });
    runToastUndo();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(getToast()).toBeNull();
    runToastUndo(); // nothing to undo now → no second call
    expect(undo).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test("a replacement toast cancels the prior undo window", () => {
  jest.useFakeTimers();
  try {
    const undo = jest.fn();
    showToast("first", { undo });
    showToast("second"); // replaces → the first's undo is gone
    runToastUndo(); // second has no undo
    expect(undo).not.toHaveBeenCalled();
    expect(getToast()).toBeNull(); // dismissed by runToastUndo
  } finally {
    jest.useRealTimers();
  }
});

import { getToast, showToast } from "../toast";

// The two non-trivial bits of the toast store: auto-hide after 2200ms, and a new
// toast replacing (and re-timing) the current one.
test("showToast shows, a later toast replaces it, and it auto-hides at 2200ms", () => {
  jest.useFakeTimers();
  try {
    showToast("first");
    expect(getToast()).toBe("first");

    jest.advanceTimersByTime(2199); // just shy of "first" expiring
    showToast("second"); // replaces → resets the 2200ms timer
    expect(getToast()).toBe("second");

    jest.advanceTimersByTime(2199); // "first"'s window would be long gone; "second" still up
    expect(getToast()).toBe("second");

    jest.advanceTimersByTime(1); // cross 2200ms since "second"
    expect(getToast()).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

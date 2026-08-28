/**
 * R18-D — the habit time picker. The wire format is the contract here: whatever the
 * OS dialog hands back has to land as the same "HH:MM" the free-text box produced.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import "../../i18n";
import i18n from "../../i18n";
import { TimeField, atTime, hhmm } from "../timeField";

const t = (k: string) => i18n.t(k) as string;

test("HH:MM survives the round trip, and junk falls back to 08:00", () => {
  expect(hhmm(new Date(2026, 0, 1, 7, 5))).toBe("07:05");
  expect(hhmm(new Date(2026, 0, 1, 21, 30))).toBe("21:30");
  expect(hhmm(atTime("06:45"))).toBe("06:45");
  for (const junk of ["", "6", "6:45", "25:00", "nonsense"]) expect(hhmm(atTime(junk))).toBe(junk === "6:45" ? "06:45" : "08:00");
});

test("tapping the field opens the picker, and picking a time writes HH:MM", async () => {
  const onChange = jest.fn();
  await render(<TimeField value="08:00" onChange={onChange} />);

  expect(screen.queryByTestId("habit-time-picker")).toBeNull();
  fireEvent.press(screen.getByLabelText(t("library.habits.timeLabel")));

  const picker = await screen.findByTestId("habit-time-picker");
  fireEvent(picker, "change", { type: "set" }, new Date(2026, 0, 1, 21, 5));
  expect(onChange).toHaveBeenCalledWith("21:05");
});

test("a dismissed picker changes nothing", async () => {
  const onChange = jest.fn();
  await render(<TimeField value="08:00" onChange={onChange} />);

  fireEvent.press(screen.getByLabelText(t("library.habits.timeLabel")));
  fireEvent(await screen.findByTestId("habit-time-picker"), "change", { type: "dismissed" }, undefined);
  expect(onChange).not.toHaveBeenCalled();
});

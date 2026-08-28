/**
 * APP-097 — the Day panel's Overview zone: the pure card maths, the domain gating
 * (a flag off HIDES the card, it never deletes), and the typed weight field
 * (R18-D: no slider, no 100 kg ceiling, comma decimals).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../../i18n";
import i18n from "../../i18n";
import { DayPanel } from "../DayPanel";
import { PopHost } from "../../ui/popHost";
import { resetDbForTests } from "../../db/db";
import { addLocalEntry, getEntry } from "../../db/entries";
import { saveSettings, type Settings } from "../../db/settings";
import { msUntilNextScene, sceneFor } from "../../ui/scene";
import { clampTypedMl, waterPct } from "../water";
import { parsedKg, roundKg, weightEntryId } from "../weight";
import { dayKey } from "../record";
import { macroPct } from "../overview/MacrosCard";
import { habitSub } from "../overview/HabitsCard";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/day",
}));

const ALL: Settings["domains"] = { meals: true, water: true, move: true, habits: true, weight: true };
const settings = (domains: Settings["domains"]): Settings => ({ name: "Sam", domains });

const t = (k: string, v?: Record<string, unknown>) => i18n.t(k, v ?? {});

// `fireEvent` doesn't settle the tree here — always assert the result with a
// `findBy*` (a bare `act()` flush leaves the renderer unusable for the next test).

// Real timers on purpose: with jest's fake ones the popHost pop never reaches the
// tree inside `waitFor`, so the modal could not be driven at all.
beforeEach(() => {
  resetDbForTests();
  saveSettings(settings(ALL));
});

// ── pure maths ───────────────────────────────────────────────────────────────

test("the vessel fills against 2500 ml and never overflows", () => {
  expect(waterPct(0)).toBe(0);
  expect(waterPct(1250)).toBe(50);
  expect(waterPct(4000)).toBe(100);
});

test("typed water is clamped 0–2000; typed weight parses 20–300 and rejects the rest", () => {
  expect(clampTypedMl(5000)).toBe(2000);
  expect(clampTypedMl(-40)).toBe(0);
  expect(roundKg(78.44)).toBe(78.4);
  // R18-D: no 100 kg ceiling any more, and a PT-BR comma is a decimal point.
  expect(parsedKg("118")).toBe(118);
  expect(parsedKg("104,6")).toBe(104.6);
  expect(parsedKg("78.44")).toBe(78.4);
  // Not readings: half-typed, empty, nonsense, out of range.
  expect(parsedKg("8")).toBeNull();
  expect(parsedKg("")).toBeNull();
  expect(parsedKg("abc")).toBeNull();
  expect(parsedKg("400")).toBeNull();
});

test("a macro bar with no plan behind it is empty, not a division by zero", () => {
  expect(macroPct(90, 180)).toBe(50);
  expect(macroPct(300, 180)).toBe(100);
  expect(macroPct(90, 0)).toBe(0);
});

test("the scene follows the clock and re-arms at the next boundary", () => {
  expect(sceneFor(7)).toBe("morning");
  expect(sceneFor(14)).toBe("afternoon");
  expect(sceneFor(21)).toBe("evening");
  expect(msUntilNextScene(new Date(2026, 7, 19, 11, 30))).toBe(30 * 60_000);
  expect(msUntilNextScene(new Date(2026, 7, 19, 23, 0))).toBe(60 * 60_000);
});

test("a habit's sub-line reads its own schedule", () => {
  const base = { id: "h", name: "Creatine", time: "21:00", enabled: true, kind: "plain" as const, createdAt: "" };
  expect(habitSub({ ...base, days: [true, true, true, true, true, true, true] })).toBe("21:00 · daily");
  expect(habitSub({ ...base, days: [false, true, false, true, false, true, false] })).toBe("21:00 · Mon Wed Fri");
});

// ── domain gating ────────────────────────────────────────────────────────────

test("every Overview card renders when its flag is on", async () => {
  await render(<DayPanel />);
  expect(screen.getByText(t("day.zones.overview"))).toBeOnTheScreen();
  expect(screen.getByText(t("overview.water.label"))).toBeOnTheScreen();
  expect(screen.getByText(t("overview.macros.label"))).toBeOnTheScreen();
  expect(screen.getByText(t("overview.weight.label"))).toBeOnTheScreen();
});

test("a flag turned off hides its card — and only its card", async () => {
  saveSettings(settings({ ...ALL, water: false, weight: false }));
  await render(<DayPanel />);
  expect(screen.queryByText(t("overview.water.label"))).toBeNull();
  expect(screen.queryByText(t("overview.weight.label"))).toBeNull();
  expect(screen.getByText(t("overview.macros.label"))).toBeOnTheScreen();
});

test("with every flag off the Overview zone label goes too", async () => {
  saveSettings(settings({ meals: false, water: false, move: false, habits: false, weight: false }));
  await render(<DayPanel />);
  expect(screen.queryByText(t("day.zones.overview"))).toBeNull();
});

// ── recording ────────────────────────────────────────────────────────────────

/**
 * One render for both recording paths: settling the tree after an interaction leaves
 * this renderer unusable for a *later* `render()` in the same file, so the quick-add
 * and the weight modal share a mount rather than being ordered by luck.
 */
test("quick-add logs a drink, and the weight modal accepts a comma decimal over 100 kg", async () => {
  addLocalEntry({
    type: "water",
    occurredAt: new Date().toISOString(),
    inputMethod: "tap",
    isEstimate: false,
    detail: { amountMl: 500 },
  });
  await render(
    <>
      <DayPanel />
      <PopHost />
    </>,
  );
  expect(screen.getByText(t("overview.water.value", { ml: "500" }))).toBeOnTheScreen();
  expect(screen.getByText(t("overview.weight.sourceNone"))).toBeOnTheScreen();

  fireEvent.press(screen.getByText(t("overview.water.quickAdd", { ml: 250 })));
  expect(await screen.findByText(t("overview.water.value", { ml: "750" }))).toBeOnTheScreen();

  fireEvent.press(screen.getByLabelText(t("overview.weight.modalTitle")));
  fireEvent.changeText(await screen.findByLabelText(t("overview.weight.typedLabel")), "104,6");
  // The typed value has to reach the pop's own tree before Save can carry it.
  expect(await screen.findByDisplayValue("104,6")).toBeOnTheScreen();
  fireEvent.press(screen.getByText(t("overview.weight.save")));

  await waitFor(() => expect(getEntry(weightEntryId(dayKey()))).not.toBeNull());
  const rec = getEntry(weightEntryId(dayKey()));
  expect(rec?.type).toBe("weight");
  expect((rec?.detail as { kg: number }).kg).toBe(104.6);
});

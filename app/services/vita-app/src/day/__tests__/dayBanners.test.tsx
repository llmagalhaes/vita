/**
 * M3 + m4 — the two surfaces the deleted v3 Home owned.
 *
 * M3: `openReview()` had no caller. A capture parked offline is parsed on reconnect and
 * auto-added WITHOUT the confirm sheet; the banner that gave that affordance back went
 * with Home, so CEO Round-12 #2 ("an entry Vita added on your behalf must be
 * reviewable") was silently gone.
 * m4: `mealPlanStatus()` was orphaned — nothing told a user who backgrounded the app
 * during the ~3-minute PDF parse that the plan had arrived.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import "../../i18n";
import i18n from "../../i18n";
import type { EatingPlanDraft, NewEntry } from "../../api/client";
import { resetDbForTests } from "../../db/db";
import { addLocalEntry } from "../../db/entries";
import { kvSet } from "../../db/kv";
import { DayBanners } from "../DayBanners";
import { useReviewSheetOpen, closeReview } from "../../review/ReviewSheet";

const pushed: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (h: string) => pushed.push(h), replace: jest.fn() }),
  usePathname: () => "/day",
}));

const t = (k: string, v?: Record<string, unknown>) => i18n.t(k, v ?? {});

const meal = (): NewEntry => ({
  type: "meal",
  occurredAt: new Date().toISOString(),
  inputMethod: "voice",
  isEstimate: true,
  sourcePhrase: "rice and beans",
  detail: { title: "Lunch", items: [], totals: { kcal: 500 } },
});

const PLAN: EatingPlanDraft = {
  summary: "s",
  status: "review",
  meals: [
    { id: "m-1", name: "Breakfast", items: [] },
    { id: "m-2", name: "Lunch", items: [] },
  ],
};

beforeEach(() => {
  resetDbForTests();
  pushed.length = 0;
  closeReview();
});

test("nothing waiting ⇒ no banner at all (the Day stays calm)", async () => {
  await render(<DayBanners />);
  expect(screen.toJSON()).toBeNull();
});

/** Stands in for the always-mounted <ReviewSheet />, which reads the same store. */
function SheetProbe() {
  return <Text>{useReviewSheetOpen() ? "sheet-open" : "sheet-closed"}</Text>;
}

test("an offline auto-added entry is reviewable again — the banner opens the review sheet", async () => {
  addLocalEntry(meal(), /* needsReview */ true);
  await render(
    <>
      <DayBanners />
      <SheetProbe />
    </>,
  );

  expect(screen.getByText(t("day.banner.reviewOne"))).toBeTruthy();
  expect(screen.getByText("sheet-closed")).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByLabelText(t("day.banner.reviewOne"))));
  expect(screen.getByText("sheet-open")).toBeTruthy();
});

test("the count is the number of entries awaiting review", async () => {
  addLocalEntry(meal(), true);
  addLocalEntry(meal(), true);
  await render(<DayBanners />);
  expect(screen.getByText(t("day.banner.reviewMany", { count: 2 }))).toBeTruthy();
  expect(screen.getByText("2")).toBeTruthy();
});

test("a plan still in review says so and leads to finish setup", async () => {
  kvSet("plan.current", PLAN);
  await render(<DayBanners />);
  expect(screen.getByText(t("day.banner.planTitle"))).toBeTruthy();
  expect(screen.getByText(t("day.banner.planSub", { n: 2 }))).toBeTruthy();

  fireEvent.press(screen.getByLabelText(t("day.banner.planTitle")));
  expect(pushed).toEqual(["/plan-setup"]);
});

test("a ready plan says nothing — the banner is the async-import safety net, not a nag", async () => {
  kvSet("plan.current", { ...PLAN, status: "ready" });
  await render(<DayBanners />);
  expect(screen.toJSON()).toBeNull();
});

test("'Not now' dismisses the plan banner for good", async () => {
  kvSet("plan.current", PLAN);
  const view = await render(<DayBanners />);
  fireEvent.press(screen.getByText(t("day.banner.dismiss")));
  view.unmount(); // the banner's FadeOut keeps it mounted through the exit tween
  await render(<DayBanners />);
  expect(screen.queryByText(t("day.banner.planTitle"))).toBeNull();
});

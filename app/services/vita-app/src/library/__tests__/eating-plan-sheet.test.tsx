/**
 * APP-129 acceptance (handoff v4.2 §6 criteria 1 and 2): the Meals card offers
 * ONE button, the sheet behind it offers three routes, and the PDF route is still
 * the import flow that already existed — a v4.2 entry point, not a second importer.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import "../../i18n";
import i18n from "../../i18n";
import { EatingPlan } from "../sections/EatingPlan";
import { PopHost } from "../../ui/popHost";
import { resetDbForTests } from "../../db/db";
import { importPdf } from "../../onboarding/planImport";
import { savePlan } from "../../db/plan";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: mockPush, canGoBack: () => true }),
  usePathname: () => "/library",
}));
jest.mock("../../onboarding/planImport", () => ({ importPdf: jest.fn() }));

const t = (k: string) => i18n.t(k) as string;
const mockedImportPdf = importPdf as jest.MockedFunction<typeof importPdf>;

beforeEach(() => {
  resetDbForTests();
  mockPush.mockClear();
  mockedImportPdf.mockReset();
  mockedImportPdf.mockResolvedValue({ status: "cancelled" });
});

const open = async () => {
  await render(<><EatingPlan /><PopHost /></>);
  await fireEvent.press(screen.getByText(t("build.eatingSheet.cardButton")));
};

// Criterion 1.
test("the card shows one button, not the old three", async () => {
  await render(<><EatingPlan /><PopHost /></>);
  expect(screen.getByText(t("build.eatingSheet.cardButton"))).toBeOnTheScreen();
  for (const gone of ["library.plan.addMeal", "library.plan.replacePdf", "common.importPdf"]) {
    expect(screen.queryByText(t(gone))).toBeNull();
  }
});

test("the button opens a sheet with the three routes", async () => {
  await open();
  expect(screen.getByText(t("build.eatingSheet.title"))).toBeOnTheScreen();
  for (const row of ["pdf", "here", "one"]) {
    expect(screen.getByText(t(`build.eatingSheet.${row}`))).toBeOnTheScreen();
    expect(screen.getByText(t(`build.eatingSheet.${row}Sub`))).toBeOnTheScreen();
  }
});

// Criterion 2: the PDF route still runs the existing importer, untouched.
test("Import a PDF hands off to the existing import flow", async () => {
  await open();
  await fireEvent.press(screen.getByText(t("build.eatingSheet.pdf")));
  expect(mockedImportPdf).toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled(); // cancelled pick goes nowhere
});

test("Import a PDF pushes plan-setup in parse mode once the file is up", async () => {
  mockedImportPdf.mockResolvedValue({ status: "ready", fileRef: "file-1", name: "plan.pdf" });
  await open();
  await fireEvent.press(screen.getByText(t("build.eatingSheet.pdf")));
  expect(mockPush).toHaveBeenCalledWith("/plan-setup?mode=parse&fileRef=file-1");
});

test("Build it here opens the builder route", async () => {
  await open();
  await fireEvent.press(screen.getByText(t("build.eatingSheet.here")));
  expect(mockPush).toHaveBeenCalledWith("/build-plan");
});

test("Add a single meal closes the sheet and opens the inline form that already existed", async () => {
  await open();
  await fireEvent.press(screen.getByText(t("build.eatingSheet.one")));
  expect(screen.getByText(t("library.plan.formTitle"))).toBeOnTheScreen();
  expect(screen.getByText(t("library.plan.addToPlan"))).toBeOnTheScreen();
  expect(mockPush).not.toHaveBeenCalled();
});

/**
 * APP-138 — the fourth route: edit the plan you already have. Absent while there
 * is nothing to edit, and honest about what a hand-rebuild costs a parsed plan.
 */
describe("Edit your plan", () => {
  const plain = { summary: "Mine", status: "ready" as const, meals: [{ name: "Lunch", items: [{ name: "Rice", quantity: 100, unit: "g", kcal: 130 }] }] };

  it("is not offered until there is a plan", async () => {
    await open();
    expect(screen.queryByText(t("build.eatingSheet.edit"))).toBeNull();
  });

  it("opens the builder in edit mode", async () => {
    await savePlan(plain, "manual");
    await open();
    expect(screen.getByText(t("build.eatingSheet.editSub"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(t("build.eatingSheet.edit")));
    expect(mockPush).toHaveBeenCalledWith("/build-plan?edit=1");
  });

  it("warns when the plan carries swaps or options a hand-rebuild would drop", async () => {
    await savePlan({ ...plain, meals: [{ ...plain.meals[0]!, items: [{ ...plain.meals[0]!.items[0]!, swaps: [{ name: "Pasta", quantity: 80 }] }] }] }, "pdf");
    await open();
    expect(screen.getByText(t("build.eatingSheet.editSubLossy"))).toBeOnTheScreen();
    expect(screen.queryByText(t("build.eatingSheet.editSub"))).toBeNull();
  });
});

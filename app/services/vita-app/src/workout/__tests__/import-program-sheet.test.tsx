/**
 * APP-130 (criterion 14) + APP-131 risk 6: the training sheet's second route is the
 * real builder, the PDF route is untouched, and a time-family exercise finally shows
 * the number the user typed instead of an empty string.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import "../../i18n";
import i18n from "../../i18n";
import { ImportProgramSheet } from "../ImportProgramSheet";
import { exerciseMeasure } from "../exerciseLabel";
import { PopHost } from "../../ui/popHost";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: mockPush, canGoBack: () => true }),
  usePathname: () => "/day",
}));

const mockImportPdf = jest.fn();
jest.mock("../../onboarding/planImport", () => ({ importPdf: () => mockImportPdf() }));

const t = (k: string) => i18n.t(k) as string;
const onClose = jest.fn();

beforeEach(() => {
  mockPush.mockClear();
  onClose.mockClear();
  mockImportPdf.mockReset();
});

const open = () => render(<><ImportProgramSheet onClose={onClose} /><PopHost /></>);

test("the second route is Build it here, and the fake parse is no longer offered", async () => {
  await open();
  expect(screen.getByText(t("build.trainingSheet.here"))).toBeOnTheScreen();
  expect(screen.getByText(t("build.trainingSheet.hereSub"))).toBeOnTheScreen();
  expect(screen.queryByText(t("common.typeOrSpeak"))).toBeNull();
});

test("Build it here closes the sheet and opens the builder in one transition", async () => {
  await open();
  await fireEvent.press(screen.getByText(t("build.trainingSheet.here")));
  expect(onClose).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/build-program");
});

test("the PDF route is untouched", async () => {
  await open();
  expect(screen.getByText(t("common.importPdf"))).toBeOnTheScreen();
});

/** APP-137: onboarding shows the two routes itself, so it opens this sheet on the
 *  PDF leg — and a cancel there must close it, not reveal a second chooser. */
test("autoPdf runs the picker on mount and a cancel closes the sheet", async () => {
  mockImportPdf.mockResolvedValue({ status: "cancelled" });
  await render(<><ImportProgramSheet onClose={onClose} autoPdf /><PopHost /></>);
  expect(mockImportPdf).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
  expect(screen.queryByText(t("build.trainingSheet.here"))).toBeNull();
});

describe("exerciseMeasure", () => {
  it("renders the time family's minutes instead of an empty string", () => {
    expect(exerciseMeasure({ durationMin: 30 })).toBe("30 min");
  });

  it("keeps the set family exactly as it read before", () => {
    expect(exerciseMeasure({ sets: 3, reps: 10 })).toBe("3 × 10");
    expect(exerciseMeasure({ sets: 3 })).toBe("3");
    expect(exerciseMeasure({})).toBe("");
  });

  it("prefers sets/reps when a document somehow carries both", () => {
    expect(exerciseMeasure({ sets: 3, reps: 10, durationMin: 30 })).toBe("3 × 10");
  });
});

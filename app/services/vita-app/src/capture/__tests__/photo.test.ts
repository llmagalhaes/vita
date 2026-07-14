jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async (uri: string) => ({ uri: `${uri}#jpeg`, width: 1568, height: 1176 })),
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { JPEG_QUALITY, MAX_EDGE, downscale, downscaleSize, pickPhoto } from "../photo";

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const manip = ImageManipulator as jest.Mocked<typeof ImageManipulator>;

beforeEach(() => jest.clearAllMocks());

describe("downscaleSize", () => {
  test("clamps the longest side to MAX_EDGE, preserving aspect", () => {
    expect(downscaleSize(4000, 3000)).toEqual({ width: MAX_EDGE, height: 1176 });
    expect(downscaleSize(3000, 4000)).toEqual({ width: 1176, height: MAX_EDGE });
  });
  test("returns null when already within budget (no needless resize)", () => {
    expect(downscaleSize(1000, 800)).toBeNull();
    expect(downscaleSize(MAX_EDGE, 900)).toBeNull();
    expect(downscaleSize(0, 0)).toBeNull();
  });
});

describe("downscale", () => {
  test("resizes large images to 1568px longest side at JPEG q0.8", async () => {
    await downscale({ uri: "file://big.heic", width: 4000, height: 3000 });
    expect(manip.manipulateAsync).toHaveBeenCalledWith(
      "file://big.heic",
      [{ resize: { width: MAX_EDGE, height: 1176 } }],
      { compress: JPEG_QUALITY, format: "jpeg" },
    );
  });
  test("small images skip the resize action but still re-encode to JPEG", async () => {
    await downscale({ uri: "file://small.png", width: 800, height: 600 });
    expect(manip.manipulateAsync).toHaveBeenCalledWith("file://small.png", [], {
      compress: JPEG_QUALITY,
      format: "jpeg",
    });
  });
});

describe("pickPhoto", () => {
  test("declined library access → denied (no picker launched)", async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false } as never);
    expect(await pickPhoto()).toEqual({ status: "denied" });
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  test("user backs out of the picker → cancelled (calm, no notice)", async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as never);
    expect(await pickPhoto()).toEqual({ status: "cancelled" });
  });

  test("picked asset is downscaled and returned", async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file://plate.jpg", width: 4000, height: 3000 }],
    } as never);
    const out = await pickPhoto();
    expect(out).toEqual({ status: "picked", photo: { uri: "file://plate.jpg#jpeg", width: 1568, height: 1176 } });
    expect(manip.manipulateAsync).toHaveBeenCalled();
  });

  test("unexpected failure → error (never throws)", async () => {
    picker.requestMediaLibraryPermissionsAsync.mockRejectedValue(new Error("boom"));
    expect(await pickPhoto()).toEqual({ status: "error" });
  });
});

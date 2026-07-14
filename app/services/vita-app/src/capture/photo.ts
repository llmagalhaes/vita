/**
 * Photo capture (APP-020, F3): pick from the library, downscale, hand a small
 * JPEG to the parse flow. Transport is multipart to POST /parse/photo (D3) —
 * the image never touches /uploads and is discarded server-side (ADR-0005).
 *
 * ponytail: library pick (not camera) — works on device AND simulator, so the
 * CEO can demo in Expo Go anywhere. Swap `launchImageLibraryAsync` →
 * `launchCameraAsync` (+ camera permission) once a live-capture flow is wanted.
 */
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

export const MAX_EDGE = 1568; // longest side, px (D3)
export const JPEG_QUALITY = 0.8; // D3

export type PickedPhoto = { uri: string; width: number; height: number };

export type PickOutcome =
  | { status: "picked"; photo: PickedPhoto }
  | { status: "denied" } // user declined library access — calm fallback
  | { status: "cancelled" } // user backed out of the picker — no notice
  | { status: "error" };

/**
 * Target dimensions so the longest side is MAX_EDGE, aspect preserved.
 * Returns null when the image is already within budget (skip the resize).
 */
export function downscaleSize(
  width: number,
  height: number,
): { width: number; height: number } | null {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE || longest === 0) return null;
  const scale = MAX_EDGE / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Resize (if needed) + re-encode to JPEG q0.8. Always yields a JPEG. */
export async function downscale(photo: PickedPhoto): Promise<PickedPhoto> {
  const target = downscaleSize(photo.width, photo.height);
  // ponytail: deprecated manipulateAsync, but it's the one-call path and still
  // ships in SDK 56. Move to ImageManipulator.manipulate(...) if it's removed.
  const out = await ImageManipulator.manipulateAsync(
    photo.uri,
    target ? [{ resize: target }] : [],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { uri: out.uri, width: out.width, height: out.height };
}

/** Full pick → downscale, mapping every branch to a calm outcome. */
export async function pickPhoto(): Promise<PickOutcome> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { status: "denied" };
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1, // we compress in downscale()
    });
    const asset = res.canceled ? null : res.assets?.[0];
    if (!asset) return { status: "cancelled" };
    const photo = await downscale({
      uri: asset.uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
    });
    return { status: "picked", photo };
  } catch {
    return { status: "error" };
  }
}

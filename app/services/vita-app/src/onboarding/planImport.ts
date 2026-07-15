/**
 * PDF import orchestration for the onboarding plan/program steps (APP-040).
 *
 * Two-phase upload (docs/contracts §uploads): pick a PDF → POST /uploads for a
 * presigned S3 target → PUT the bytes → hand the opaque `fileRef` back. The
 * caller then runs parse({ fileRef }), reusing the existing describe→answered
 * confirm card. Every branch maps to a calm typed outcome — no throws leak to UI.
 */
import * as DocumentPicker from "expo-document-picker";
import { api, putPresignedFile } from "../api";

export type ImportOutcome =
  | { status: "ready"; fileRef: string; name: string }
  | { status: "cancelled" } // user backed out of the file picker — no notice
  | { status: "pick-error" } // picker itself failed
  | { status: "upload-error" }; // /uploads or the S3 PUT failed

/** Injectable seam so the orchestration is unit-testable without touching the network. */
export type ImportDeps = {
  pick: () => Promise<{ uri: string; name: string } | null>; // null = cancelled
  requestUpload: () => Promise<{ fileRef: string; uploadUrl: string }>;
  putBytes: (uploadUrl: string, uri: string) => Promise<void>;
};

/** Pure state machine: pick → upload → fileRef, mapping each failure to a calm outcome. */
export async function importPlanPdf(deps: ImportDeps): Promise<ImportOutcome> {
  let picked: { uri: string; name: string } | null;
  try {
    picked = await deps.pick();
  } catch {
    return { status: "pick-error" };
  }
  if (!picked) return { status: "cancelled" };
  try {
    const { fileRef, uploadUrl } = await deps.requestUpload();
    await deps.putBytes(uploadUrl, picked.uri);
    return { status: "ready", fileRef, name: picked.name };
  } catch {
    return { status: "upload-error" };
  }
}

const pickPdf: ImportDeps["pick"] = async () => {
  const res = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true, // give us a stable local uri to read bytes from
    multiple: false,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  return asset ? { uri: asset.uri, name: asset.name } : null;
};

/** Wired defaults: real picker + real api. Import module composes; UI just awaits. */
export const importPdf = (): Promise<ImportOutcome> =>
  importPlanPdf({
    pick: pickPdf,
    requestUpload: () => api.requestUpload({ purpose: "plan_document", contentType: "application/pdf" }),
    putBytes: (uploadUrl, uri) => putPresignedFile(uploadUrl, uri),
  });

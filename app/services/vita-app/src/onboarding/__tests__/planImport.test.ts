jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

import { importPlanPdf, type ImportDeps } from "../planImport";

const ok: Pick<ImportDeps, "requestUpload" | "putBytes"> = {
  requestUpload: async () => ({ fileRef: "file-1", uploadUrl: "https://s3/put" }),
  putBytes: async () => {},
};

describe("importPlanPdf state machine", () => {
  test("ready: pick → upload → PUT → fileRef, and PUT gets the picked uri", async () => {
    const putBytes = jest.fn(async () => {});
    const out = await importPlanPdf({
      pick: async () => ({ uri: "file:///plan.pdf", name: "plan.pdf" }),
      requestUpload: ok.requestUpload,
      putBytes,
    });
    expect(out).toEqual({ status: "ready", fileRef: "file-1", name: "plan.pdf" });
    expect(putBytes).toHaveBeenCalledWith("https://s3/put", "file:///plan.pdf");
  });

  test("cancelled: pick returns null → no upload attempted", async () => {
    const requestUpload = jest.fn(ok.requestUpload);
    const out = await importPlanPdf({ pick: async () => null, requestUpload, putBytes: ok.putBytes });
    expect(out).toEqual({ status: "cancelled" });
    expect(requestUpload).not.toHaveBeenCalled();
  });

  test("pick-error: picker throws → mapped, no upload attempted", async () => {
    const requestUpload = jest.fn(ok.requestUpload);
    const out = await importPlanPdf({
      pick: async () => {
        throw new Error("picker blew up");
      },
      requestUpload,
      putBytes: ok.putBytes,
    });
    expect(out).toEqual({ status: "pick-error" });
    expect(requestUpload).not.toHaveBeenCalled();
  });

  test("upload-error: requestUpload throws → mapped", async () => {
    const out = await importPlanPdf({
      pick: async () => ({ uri: "file:///plan.pdf", name: "plan.pdf" }),
      requestUpload: async () => {
        throw new Error("uploads 500");
      },
      putBytes: ok.putBytes,
    });
    expect(out).toEqual({ status: "upload-error" });
  });

  test("upload-error: the S3 PUT throws → mapped", async () => {
    const out = await importPlanPdf({
      pick: async () => ({ uri: "file:///plan.pdf", name: "plan.pdf" }),
      requestUpload: ok.requestUpload,
      putBytes: async () => {
        throw new Error("PUT 403");
      },
    });
    expect(out).toEqual({ status: "upload-error" });
  });
});

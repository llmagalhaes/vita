/**
 * Typed API client for docs/contracts/vita-api-v0.yaml.
 * Types come from types.gen.ts — regenerate with `npm run api:gen`.
 */
import type { components } from "./types.gen";

export type Schemas = components["schemas"];
export type NewEntry = Schemas["NewEntry"];
export type LogEntry = Schemas["LogEntry"];
export type EntryDetail = Schemas["EntryDetail"];
export type MealDetail = Schemas["MealDetail"];
export type MealItem = Schemas["MealItem"];
export type Micro = Schemas["Micro"];
export type WaterDetail = Schemas["WaterDetail"];
export type WorkoutDetail = Schemas["WorkoutDetail"];
export type MacroTotals = Schemas["MacroTotals"];
export type EatingPlanDraft = Schemas["EatingPlanDraft"];
export type EatingPlanWithPortions = Schemas["EatingPlanWithPortions"];
export type PlanMeal = Schemas["PlanMeal"];
export type PlanItem = Schemas["PlanItem"];
export type MealOption = Schemas["MealOption"];
export type SwapOption = Schemas["SwapOption"];
export type Hydration = Schemas["Hydration"];
export type Supplement = Schemas["Supplement"];
export type MicrosPerUnit = Schemas["MicrosPerUnit"];
export type PortionBounds = Schemas["PortionBounds"];
export type PortionsMap = Schemas["PortionsMap"];
export type TrainingProgramDraft = Schemas["TrainingProgramDraft"];
export type ProgramDay = Schemas["ProgramDay"];
export type Exercise = Schemas["Exercise"];
export type ParseResult = Schemas["ParseResult"];
export type Problem = Schemas["Problem"];
export type User = Schemas["User"];
export type Units = Schemas["Units"];
export type VacationRange = Schemas["VacationRange"];
export type TokenPair = Schemas["TokenPair"];
export type Muscle = NonNullable<WorkoutDetail["muscles"]>[number];

export type EntriesPage = { items: LogEntry[]; nextCursor?: string };

/** POST /uploads → presigned target for a two-phase PDF import (plan/program). */
export type UploadTarget = { fileRef: string; uploadUrl: string; expiresAt: string };

export type OidcRequest = {
  provider: "google" | "apple";
  idToken: string;
  nonce?: string;
  name?: string;
};

export interface Api {
  // Auth (public endpoints — no bearer). See docs/contracts §auth.
  requestMagicLink(email: string): Promise<void>;
  verifyMagicLink(token: string): Promise<TokenPair>;
  oidc(body: OidcRequest): Promise<TokenPair>;
  refresh(refreshToken: string): Promise<TokenPair>;
  signOut(refreshToken: string): Promise<void>;
  // Authenticated
  parseText(body: { text: string; capturedAt?: string }): Promise<ParseResult>;
  /** Multipart POST /parse/photo (D3): field `image` is the downscaled JPEG. */
  parsePhoto(body: {
    image: { uri: string };
    caption?: string;
    capturedAt?: string;
  }): Promise<ParseResult>;
  /**
   * v3 async import (contract 0.7.0): POST /parse/eating-plan ACCEPTS (202 + jobId)
   * and parses in the background; on success the plan is saved server-side as
   * status "review". Poll {@link getEatingPlanJob}; on "done" GET /plan.
   */
  startEatingPlanImport(body: { text?: string; fileRef?: string }): Promise<{ jobId: string }>;
  /** Poll an eating-plan import job (running → keep polling; done → GET /plan; failed → failureReason). */
  getEatingPlanJob(jobId: string): Promise<{ state: "running" | "done" | "failed"; failureReason?: string }>;
  /**
   * Convenience: start the async import, poll to completion, then GET /plan and
   * return the saved review-status draft. Used by onboarding's simple describe
   * path; the animated Plan Setup screen drives start/poll/GET directly instead.
   */
  parseEatingPlan(body: { text?: string; fileRef?: string }): Promise<EatingPlanDraft>;
  /** Onboarding step 4: text (or PDF fileRef) → draft training program for confirmation. */
  parseTrainingProgram(body: { text?: string; fileRef?: string }): Promise<TrainingProgramDraft>;
  /** Phase 1 of PDF import: get a presigned S3 PUT target; then PUT bytes (putPresignedFile), then parse({ fileRef }). */
  requestUpload(body: { purpose: "plan_document"; contentType: "application/pdf" }): Promise<UploadTarget>;
  // Persisted eating plan (versioned server-side; PUT is full-doc replace, no patch).
  getPlan(): Promise<EatingPlanWithPortions>; // 404 if never set; may carry the portion overlay
  createPlan(doc: EatingPlanDraft): Promise<EatingPlanDraft>; // POST — new version
  updatePlan(doc: EatingPlanDraft): Promise<EatingPlanDraft>; // PUT — replace current
  /** Replace the sparse portion overlay for the current plan version (bare map body). */
  putPlanPortions(portions: PortionsMap): Promise<void>;
  getProgram(): Promise<TrainingProgramDraft>; // 404 if never set
  createProgram(doc: TrainingProgramDraft): Promise<TrainingProgramDraft>;
  updateProgram(doc: TrainingProgramDraft): Promise<TrainingProgramDraft>;
  createEntry(idempotencyKey: string, entry: NewEntry): Promise<LogEntry>;
  /** Update an entry (check-in re-answer replaces the whole detail — BE-024). */
  patchEntry(id: string, patch: { detail?: EntryDetail; occurredAt?: string }): Promise<LogEntry>;
  listEntries(params: {
    date?: string;
    tz?: string;
    cursor?: string;
    limit?: number;
  }): Promise<EntriesPage>;
  getMe(): Promise<User>;
  patchMe(patch: { name?: string }): Promise<User>;
  /** Vacation ranges (D1): device-owned, opaque to the server. Replace-on-write. */
  getVacations(): Promise<VacationRange[]>;
  putVacations(ranges: VacationRange[]): Promise<VacationRange[]>;
}

/** Token access for the http client: attach a bearer + refresh once on 401. */
export type AuthHooks = {
  getAccessToken: () => string | null;
  refresh: () => Promise<string | null>;
};

/** RFC 7807 error. `problem.detail` is developer-facing; the app owns user copy. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(problem.title);
    this.name = "ApiError";
  }
}

/**
 * The real backend's /parse endpoints return meal drafts with `items` but NO
 * `totals` — the contract says the server recomputes totals from items on write
 * (MacroTotals: "clients treat as read-mostly"). Every Home surface reads
 * `detail.totals.kcal ?? 0`, so a totals-less draft renders as ~0 kcal (APP-061).
 * Fill them at the API boundary so the confirmation card, the stored entry, and
 * the offline-interpret path all show real numbers. Idempotent: a draft that
 * already carries totals (the mock, or a future backend that sends them) is left
 * untouched. ponytail: same 4-line sum as capture/quantity.mealTotals, kept local
 * to avoid an api→capture import cycle.
 */
export function fillDraftTotals(result: ParseResult): ParseResult {
  return {
    ...result,
    drafts: result.drafts.map((d) => {
      if (d.type !== "meal") return d;
      const detail = d.detail as MealDetail;
      if (detail.totals || !detail.items?.length) return d;
      const totals = detail.items.reduce<MacroTotals>(
        (t, i) => ({
          kcal: t.kcal + (i.kcal ?? 0),
          proteinG: (t.proteinG ?? 0) + (i.proteinG ?? 0),
          carbsG: (t.carbsG ?? 0) + (i.carbsG ?? 0),
          fatG: (t.fatG ?? 0) + (i.fatG ?? 0),
        }),
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      );
      return { ...d, detail: { ...detail, totals } };
    }),
  };
}

/** Pull a running jobId out of a 409's problem.detail (uuid, else the last token). */
export function jobIdFromDetail(detail?: string): string | null {
  if (!detail) return null;
  const uuid = detail.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0];
  const last = detail.trim().split(/\s+/).pop();
  return last || null;
}

export function createHttpApi(baseUrl: string, auth?: AuthHooks): Api {
  async function request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string> } = {},
    canRetry = true,
  ): Promise<T> {
    const token = path.startsWith("/auth") ? null : auth?.getAccessToken();
    // FormData bodies set their own multipart boundary — never JSON-encode them.
    const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
      body:
        opts.body === undefined
          ? undefined
          : isForm
            ? (opts.body as FormData)
            : JSON.stringify(opts.body),
    });
    // Silent refresh: one authed call gets a 401 → rotate the token once and retry.
    if (res.status === 401 && canRetry && auth && !path.startsWith("/auth")) {
      const fresh = await auth.refresh();
      if (fresh) return request(method, path, opts, false);
    }
    if (!res.ok) {
      const problem: Problem = await res
        .json()
        .catch(() => ({ title: res.statusText, status: res.status, type: "about:blank" }));
      throw new ApiError(res.status, problem);
    }
    // 204 carries no body (sign-out). 202 may carry one (the async parse job id)
    // or be empty (magic-link request) — read it only when present.
    if (res.status === 204) return undefined as T;
    if (res.status === 202) {
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
    return (await res.json()) as T;
  }

  return {
    requestMagicLink: (email) => request("POST", "/auth/magic-link", { body: { email } }),
    verifyMagicLink: (token) => request("POST", "/auth/magic-link/verify", { body: { token } }),
    oidc: (body) => request("POST", "/auth/oidc", { body }),
    refresh: (refreshToken) => request("POST", "/auth/refresh", { body: { refreshToken } }),
    signOut: (refreshToken) => request("POST", "/auth/sign-out", { body: { refreshToken } }),
    parseText: (body) =>
      request<ParseResult>("POST", "/parse/text", { body }).then(fillDraftTotals),
    parsePhoto: ({ image, caption, capturedAt }) => {
      const form = new FormData();
      // React Native FormData file part — { uri, name, type }.
      form.append("image", { uri: image.uri, name: "photo.jpg", type: "image/jpeg" } as never);
      if (caption) form.append("caption", caption);
      if (capturedAt) form.append("capturedAt", capturedAt);
      return request<ParseResult>("POST", "/parse/photo", { body: form }).then(fillDraftTotals);
    },
    startEatingPlanImport: (body) => request("POST", "/parse/eating-plan", { body }),
    getEatingPlanJob: (jobId) => request("GET", `/parse/eating-plan/jobs/${jobId}`),
    async parseEatingPlan(body) {
      let jobId: string;
      try {
        ({ jobId } = await request<{ jobId: string }>("POST", "/parse/eating-plan", { body }));
      } catch (e) {
        // 409 = an import is already running for this user (contract §parse/eating-plan);
        // the running jobId is in problem.detail — adopt it rather than failing.
        const running = e instanceof ApiError && e.status === 409 ? jobIdFromDetail(e.problem.detail) : null;
        if (!running) throw e;
        jobId = running;
      }
      // Poll to completion (minutes-long on prod; a small plan resolves on the first
      // poll). Tolerate a few transient poll blips; a stuck `running` relies on the
      // server's stale-fail (contract: a job older than ~10 min is reported failed).
      let pollFails = 0;
      for (;;) {
        let job: { state: string; failureReason?: string };
        try {
          job = await request("GET", `/parse/eating-plan/jobs/${jobId}`);
          pollFails = 0;
        } catch (e) {
          if (++pollFails > 3) throw e;
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        if (job.state === "done") break;
        if (job.state === "failed") throw new ApiError(422, { type: "about:blank", title: job.failureReason ?? "parse failed", status: 422 });
        await new Promise((r) => setTimeout(r, 3000));
      }
      const { portions: _p, ...doc } = await request<EatingPlanWithPortions>("GET", "/plan");
      return doc;
    },
    parseTrainingProgram: (body) => request("POST", "/parse/training-program", { body }),
    requestUpload: (body) => request("POST", "/uploads", { body }),
    getPlan: () => request("GET", "/plan"),
    createPlan: (doc) => request("POST", "/plan", { body: doc }),
    updatePlan: (doc) => request("PUT", "/plan", { body: doc }),
    putPlanPortions: (portions) => request("PUT", "/plan/portions", { body: portions }),
    getProgram: () => request("GET", "/program"),
    createProgram: (doc) => request("POST", "/program", { body: doc }),
    updateProgram: (doc) => request("PUT", "/program", { body: doc }),
    createEntry: (idempotencyKey, entry) =>
      request("POST", "/entries", {
        body: entry,
        headers: { "Idempotency-Key": idempotencyKey },
      }),
    patchEntry: (id, patch) => request("PATCH", `/entries/${id}`, { body: patch }),
    listEntries: (params) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) q.set(k, String(v));
      }
      const qs = q.toString();
      return request("GET", `/entries${qs ? `?${qs}` : ""}`);
    },
    getMe: () => request("GET", "/me"),
    patchMe: (patch) => request("PATCH", "/me", { body: patch }),
    getVacations: () => request("GET", "/me/vacations"),
    putVacations: (ranges) => request("PUT", "/me/vacations", { body: ranges }),
  };
}

/**
 * Phase 2 of PDF import: raw PUT of the picked file's bytes straight to the
 * presigned S3 URL (no bearer, no baseUrl — it's S3, not our API). Content-Type
 * MUST match the one sent to POST /uploads or S3 rejects the signature.
 *
 * Uses expo-file-system's native binary upload rather than `fetch(fileUri).blob()`:
 * Android RN `fetch` can't read a `file://` cache uri, so the old path threw
 * "Network request failed" and the import silently died before ever hitting S3.
 * Lazy require (like api/index.ts) keeps the native module out of jest/module load.
 * ponytail: mock mode returns a non-https sentinel url — nothing to upload, skip.
 */
export async function putPresignedFile(
  uploadUrl: string,
  localUri: string,
  contentType = "application/pdf",
): Promise<void> {
  if (!/^https?:/i.test(uploadUrl)) return;
  const { uploadAsync, FileSystemUploadType } = require("expo-file-system/legacy");
  const res = await uploadAsync(uploadUrl, localUri, {
    httpMethod: "PUT",
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType },
  });
  if (res.status < 200 || res.status >= 300) {
    // Include S3's error body — it names the real cause (e.g. a 403 when the
    // task role can't KMS-encrypt the bucket). Without it, PDF import fails as a
    // blank "upload error" with nothing to act on (APP-060).
    throw new Error(`upload PUT failed: ${res.status} ${String(res.body ?? "").slice(0, 300)}`);
  }
}

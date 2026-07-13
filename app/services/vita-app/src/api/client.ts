/**
 * Typed API client for docs/contracts/vita-api-v0.yaml (v0.2.0).
 * Types come from types.gen.ts — regenerate with `npm run api:gen`.
 * Auth endpoints land with APP-008; v0 client covers parse + entries + me.
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
export type ParseResult = Schemas["ParseResult"];
export type Problem = Schemas["Problem"];
export type User = Schemas["User"];
export type Units = Schemas["Units"];
export type Muscle = NonNullable<WorkoutDetail["muscles"]>[number];

export type EntriesPage = { items: LogEntry[]; nextCursor?: string };

export interface Api {
  parseText(body: { text: string; capturedAt?: string }): Promise<ParseResult>;
  createEntry(idempotencyKey: string, entry: NewEntry): Promise<LogEntry>;
  listEntries(params: {
    date?: string;
    tz?: string;
    cursor?: string;
    limit?: number;
  }): Promise<EntriesPage>;
  getMe(): Promise<User>;
  patchMe(patch: { name?: string; units?: Units }): Promise<User>;
}

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

export function createHttpApi(baseUrl: string): Api {
  async function request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (!res.ok) {
      const problem: Problem = await res
        .json()
        .catch(() => ({ title: res.statusText, status: res.status, type: "about:blank" }));
      throw new ApiError(res.status, problem);
    }
    return (await res.json()) as T;
  }

  return {
    parseText: (body) => request("POST", "/parse/text", { body }),
    createEntry: (idempotencyKey, entry) =>
      request("POST", "/entries", {
        body: entry,
        headers: { "Idempotency-Key": idempotencyKey },
      }),
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
  };
}

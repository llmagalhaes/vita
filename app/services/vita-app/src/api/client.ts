/**
 * Typed API client for docs/contracts/vita-api-v0.yaml (v0.3.0).
 * Types come from types.gen.ts — regenerate with `npm run api:gen`.
 * Covers auth (APP-008) + parse + entries + me.
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
export type TokenPair = Schemas["TokenPair"];
export type Muscle = NonNullable<WorkoutDetail["muscles"]>[number];

export type EntriesPage = { items: LogEntry[]; nextCursor?: string };

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

export function createHttpApi(baseUrl: string, auth?: AuthHooks): Api {
  async function request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string> } = {},
    canRetry = true,
  ): Promise<T> {
    const token = path.startsWith("/auth") ? null : auth?.getAccessToken();
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
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
    // 202/204 carry no body (magic-link request, sign-out).
    if (res.status === 204 || res.status === 202) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    requestMagicLink: (email) => request("POST", "/auth/magic-link", { body: { email } }),
    verifyMagicLink: (token) => request("POST", "/auth/magic-link/verify", { body: { token } }),
    oidc: (body) => request("POST", "/auth/oidc", { body }),
    refresh: (refreshToken) => request("POST", "/auth/refresh", { body: { refreshToken } }),
    signOut: (refreshToken) => request("POST", "/auth/sign-out", { body: { refreshToken } }),
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

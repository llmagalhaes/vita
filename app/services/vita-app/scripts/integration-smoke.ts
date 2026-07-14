/**
 * Local integration smoke test: drives the REAL app HTTP client (src/api/client.ts,
 * generated types) against a locally-running vita-api. Not part of CI (Jest uses the
 * mock). Run with the backend up:
 *
 *   VITA_API_BASE_URL=http://localhost:8080/v1 \
 *   MAGIC_TOKEN=<token from backend console> \
 *   npx tsx scripts/integration-smoke.ts
 *
 * If MAGIC_TOKEN is omitted it requests a link and tells you to fetch it from the log.
 */
import { randomUUID } from "node:crypto";
import { type Api, createHttpApi } from "../src/api/client";

const base = process.env.VITA_API_BASE_URL ?? "http://localhost:8080/v1";
const email = process.env.EMAIL ?? "integ@local.dev";

let access: string | null = null;
let refreshTok: string | null = null;

const api: Api = createHttpApi(base, {
  getAccessToken: () => access,
  refresh: async () => {
    if (!refreshTok) return null;
    const p = await api.refresh(refreshTok);
    access = p.accessToken;
    refreshTok = p.refreshToken;
    return access;
  },
});

function ok(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`, extra ?? "");
  if (!cond) process.exitCode = 1;
}

async function main() {
  const token = process.env.MAGIC_TOKEN;
  if (!token) {
    await api.requestMagicLink(email);
    console.log("Requested magic link — grab the token from the backend console and re-run with MAGIC_TOKEN=…");
    return;
  }

  // (a) sign-in
  const pair = await api.verifyMagicLink(token);
  access = pair.accessToken;
  refreshTok = pair.refreshToken;
  ok("(a) verifyMagicLink -> tokens", !!access && pair.expiresIn > 0, { expiresIn: pair.expiresIn });

  // (c) profile
  const me = await api.getMe();
  ok("(c) getMe", !!me.id && me.email === email, { name: me.name, units: me.units });
  const patched = await api.patchMe({ name: "Integ Client", units: "metric" });
  ok("(c) patchMe", patched.name === "Integ Client", { name: patched.name });

  // (b) capture: parse -> confirm -> create -> timeline.
  // Real parse spends the Claude budget: gated behind RUN_PARSE=1 (cost-first guard).
  // Default reuses the golden draft the real Haiku call returned, so createEntry still
  // runs through the real client without a second paid call.
  let draft: import("../src/api/client").NewEntry;
  if (process.env.RUN_PARSE === "1") {
    const parsed = await api.parseText({ text: "Had a banana and a handful of peanuts around 4" });
    draft = parsed.drafts[0] as unknown as import("../src/api/client").NewEntry;
    ok("(b) parseText -> meal draft", draft?.type === "meal", { drafts: parsed.drafts.length });
  } else {
    draft = {
      type: "meal",
      occurredAt: "2026-07-14T16:00:00+02:00",
      inputMethod: "text",
      sourcePhrase: "Had a banana and a handful of peanuts around 4",
      isEstimate: true,
      detail: {
        title: "Banana and peanuts",
        items: [
          { name: "banana", quantity: 1, unit: "medium", kcal: 105, proteinG: 1, carbsG: 27, fatG: 0 },
          { name: "peanuts", quantity: 30, unit: "g", kcal: 170, proteinG: 7, carbsG: 6, fatG: 15 },
        ],
      },
    } as import("../src/api/client").NewEntry;
    console.log("SKIP  (b) parseText — using golden draft (set RUN_PARSE=1 to hit Claude)");
  }

  const idem = randomUUID();
  const created = await api.createEntry(idem, draft);
  ok("(b) createEntry 201", !!created.id, { id: created.id });

  const replay = await api.createEntry(idem, draft);
  ok("(b) idempotent replay -> same id", replay.id === created.id, { id: replay.id });

  const page = await api.listEntries({ date: "2026-07-14", tz: "Europe/Amsterdam" });
  const found = page.items.find((e) => e.id === created.id);
  const totals = (found?.detail as { totals?: { kcal?: number } })?.totals;
  ok("(b) timeline contains created entry", !!found, { count: page.items.length });
  ok("(b) server-computed totals present", !!totals?.kcal, totals);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});

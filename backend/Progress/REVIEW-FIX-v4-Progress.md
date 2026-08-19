# REVIEW-FIX-v4 — backend fix pass on `docs/reviews/2026-08-19-v4-backend-review.md`

Scope: M1, M2, M3 + the two LOW items explicitly assigned (cursor 400, Idempotency-Key bounds).
The other LOW items (L1 maxLength, L4 settings cap, L5 updatedAt, L6 digest escaping, L7/L8/L9,
L10 test gaps) were **out of scope** and are untouched follow-ups.

## M1 · capture parse token budget + `stop_reason`

`src/main/resources/application.yaml` — `vita.ai.max-output-tokens: 1024 → 4096`
(and the `@Value` fallback in `ClaudeClient` so a missing property is not a stale 1024).

Why 4096, from the repo's own precedent:

- 1024 is the 0.7.0 budget, set when a draft was a free-form meal and a matched meal did not exist.
- The plan-aware prompt asks for the matched meal's FULL composition — every item, changed or not,
  each with name/quantity/unit/kcal/macros/`replacesItemId`. The committed real plan's Almoço is
  7 base items ≈ 450 output tokens; "almocei e jantei como planejado" returns two matched meals,
  ~900+. That is the ~2× content widening BE-039 already priced once (2048→3072).
- Taking BE-039's shape (widening × the same headroom) on top of the 5-draft ceiling
  (`MAX_TOOL_DRAFTS`) lands at 4× the old budget = 4096. Only produced tokens are billed, so the
  margin costs nothing; the failure it prevents costs a whole capture.

`ClaudeClient.extractTyped` now reads `stop_reason` and WARNs on `max_tokens`. Placed there
deliberately: every model path funnels through it (text, photo, plan tool calls, async plan), so
one line covers the whole surface instead of one per caller. The client still gets the 422 — the
WARN only makes truncation distinguishable from a genuine no-match in CloudWatch, which the review
named as the second half of the defect.

Test: `PlanAwareParseTest · a truncated response (stop_reason max_tokens) still 422s but is WARNed
as truncation` — WireMock returns the shape the API actually produces on a cap trip (well-formed
envelope, tool `input` cut short); asserts the 422 is unchanged AND the WARN fires.

The golden byte-parity test keeps its client at `maxTokens = 1024` on purpose: the golden locks the
PROMPT shape (0.7.0 vs 0.8.0), and `max_tokens` is a config value, not part of that claim. Noted in
the test. `PlanAwareParseLiveEvalTest` moved to 4096 so the live eval runs the prod budget.

## M2 · unreadable plan degrades to a plan-less capture

`ParseService.planDigest` — `runCatching { … }.onFailure { WARN }.getOrNull()`.

Wraps `currentEatingPlan` **and** `PlanDigest.of`, so a decrypt failure, a missing DEK
(`CryptoService.dek` calls `error(...)`), or a doc that no longer types all land in the same
bucket the contract already promises: "no plan → identical behaviour to 0.7.0". The WARN carries
the exception **class name only** — the plan is C3 content and never goes near a log.

Test: `PlanAwareParseTest · an unreadable plan degrades to the plan-less prompt instead of failing
the capture` — `currentEatingPlan` throws; asserts the capture still succeeds, the request body is
byte-identical to the 0.7.0 golden, the WARN names `IllegalStateException`, and the INFO cost line
reports `plan=false`.

## M3 · privacy page corrected

`src/main/resources/privacy.html`, draft banner kept.

- **Photos and documents** — now says a meal photo is sent to the interpretation step and
  discarded, never stored (matches `/v1/parse/photo`: multipart → model → gone, no S3/disk/DB), and
  scopes the 30-day expiry to the imported plan PDF, which is the only thing `POST /v1/uploads`
  accepts (`purpose=plan_document` + `application/pdf`, everything else 400).
- **How it is stored** — the crypto-shred claim is scoped to health/log/plan/settings content
  under the per-user DEK. The email is stated for what it is: encrypted under a *service* key
  (Vita must find the account before you are signed in) and removed when the account rows are
  deleted. The word "every", which was the actual falsehood, is gone.

Test: `PrivacyPageTest · the page states what the code actually does about photos and the shred` —
positive assertions on the new text plus negative assertions on both retired claims, so a
regression re-introducing them fails.

## LOW-cursor · malformed cursor is a 400

`EntryService.decodeCursor` — `split("|", limit = 2)` then a size check before use. The
destructuring's `component2()` threw `IndexOutOfBoundsException`, a sibling of neither
`IllegalArgumentException` nor `DateTimeException`, and there is no `@ControllerAdvice` to catch it
→ 500. `badRequest` gives the same RFC 7807 shape as every other cursor error.

Test: `TimelineFlowTest · a malformed cursor is a 400, not a 500` — `cursor=YWJj` ("abc") and a
non-base64 cursor.

## LOW-idempotency · blank rejected, length capped at 200

`EntryService.create` (not the controller): it is the single write path and already holds the
sibling `inputMethod` guard and the `badRequest` shape, so the guard sits with the rules it belongs
to and any future caller is covered. Blank was silently colliding every write under one key (409s);
a key past Postgres' ~2704-byte btree entry limit was a 500 out of the UNIQUE index — a 4 KB header
is trivially sendable inside Tomcat's 8 KB budget. A UUID is 36 chars, so 200 is generous.

Test: `EntryFlowTest · a blank or oversized Idempotency-Key is a 400` — blank → 400, 201 chars →
400, 200 chars → 201 (the boundary is on the accept side too).

## Gates

- `./gradlew detekt ktlintCheck` — clean.
- Scoped suites for every touched file, then the full `./gradlew test`.

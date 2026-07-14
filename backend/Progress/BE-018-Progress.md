# BE-018 — POST /v1/parse/photo (Claude vision)

Asana: Vita backend board (project `1216519867368580`) — BE-018.
Slice 5 (F3 Photo capture) of `docs/backlog-local-100.md`. Coordinates with app APP-020.

## What it does

`POST /v1/parse/photo` — multipart image of a plate or gym whiteboard → the same
`ParseResult` (drafts) the app already confirms for `/parse/text`. Stateless: the image
is sent to Claude vision and **discarded — never persisted** (no S3, no disk, no DB;
ADR-0005). Nothing reaches the log until the user confirms → `POST /entries` (app's job).

## Contract (v0.4.0 — unchanged, implemented to spec)

`/parse/photo` was already specified in the contract. **Coordination point with APP-020:**

- **multipart field name: `image`** (required) — `Content-Type` of that part must be
  `image/jpeg`, `image/png`, or `image/webp`. Anything else → **415**.
- Optional form fields: `caption` (≤ 500 chars, carried through as the draft
  `sourcePhrase`) and `capturedAt` (RFC 3339; missing/unparseable → anchored to `now`).
- Request `Content-Type: multipart/form-data`.
- Response 200: `ParseResult` `{ drafts: NewEntry[] }`, `inputMethod = "photo"`,
  `isEstimate = true`, server-filled — byte-identical shape to `/parse/text`.

## Implementation (controller → service → client, ponytail)

- **`ClaudeClient.parsePhoto(imageBytes, mediaType, caption, capturedAt, model)`** —
  vision sibling of `parseText`. Reuses the existing `record_log_entries` tool + the
  `NUTRITION_PREAMBLE` (draft shapes); only a photo-specific system prompt differs. The
  image goes as a native base64 `image` content block; caption (if any) as a delimited
  `<caption>` text block (data, never instructions). Runs on the Sonnet-class vision
  model over the existing longer `planRest` RestClient (2048 max tokens, 25 s read).
- **`ParseService`** — added `parsePhoto(...)`; the text and photo paths now share one
  private `respond(...)` tail (draft mapping + token/cost metrics + 422) and one `call{}`
  error-metric wrapper. `toDraft` parameterized by `inputMethod`/`sourcePhrase`. New
  `@Value vita.ai.photo-model` (default `claude-sonnet-4-6`, pinned BE-023/ADR-0005).
- **`ParseController`** — `@PostMapping("/v1/parse/photo", consumes = multipart)` with
  `@RequestPart("image") MultipartFile` + `@RequestParam caption/capturedAt`. Validates
  empty image (400), unsupported type (415), caption length (400); reuses the **BE-014
  quota → 429 + Retry-After** before the model call and the shared `ParseMetrics`.
- **413**: `spring.servlet.multipart.max-file-size = 5MB` (request 6MB) as the server-side
  backstop; oversize → `MaxUploadSizeExceededException` → new `MultipartUploadAdvice`
  (`@RestControllerAdvice`) → RFC 7807 problem+json 413. (The exception is raised during
  multipart resolution, before the controller, so a global advice is required.)

## Multipart under Spring Boot 4 / Jackson 3 — verified (the flagged risk)

`PhotoParseFlowTest` is a full `@SpringBootTest(RANDOM_PORT)` over real HTTP (Testcontainers
Postgres + WireMock stubbing Claude via `@DynamicPropertySource vita.ai.base-url`). It posts
a **real multipart image part** and asserts:

- happy path → 200, `type=meal`, `inputMethod=photo`, `isEstimate=true`, caption →
  `sourcePhrase`; and WireMock received a request whose body contains `"type":"image"` +
  `"media_type":"image/jpeg"` → the image genuinely reached the vision model as a block.
- empty drafts → **422** problem+json; oversize (5 MB + 1) → **413** problem+json;
  non-image part → **415**; no bearer → **401**.

Gotchas hit and resolved:
- `MultipartBodyBuilder` drags in `org.reactivestreams.Publisher` (not on the test
  classpath) → built the body with a plain `LinkedMultiValueMap` + `HttpEntity` instead
  (no new dependency).
- Spring 7 renamed the status enums: 413 `PAYLOAD_TOO_LARGE` → **`CONTENT_TOO_LARGE`**,
  422 `UNPROCESSABLE_ENTITY` → **`UNPROCESSABLE_CONTENT`** (same codes); assertions use the
  canonical names. `.value()` is unchanged, so wire behaviour / the contract are unaffected.

## DoD

- `./gradlew check` green — **111 tests** (was 106; +5 `PhotoParseFlowTest`), detekt +
  ktlint clean.
- Contract untouched (redocly not needed — `/parse/photo` already in v0.4.0).
- Image never persisted: parse path has no repository/FileStore/S3 dependency; bytes live
  only in the request scope and the outbound Claude call.

## Files

- `services/vita-api/src/main/kotlin/com/llmagal/vita/ai/client/ClaudeClient.kt`
- `services/vita-api/src/main/kotlin/com/llmagal/vita/ai/service/ParseService.kt`
- `services/vita-api/src/main/kotlin/com/llmagal/vita/ai/controller/ParseController.kt`
- `services/vita-api/src/main/kotlin/com/llmagal/vita/ai/controller/MultipartUploadAdvice.kt` (new)
- `services/vita-api/src/main/resources/application.yaml` (multipart limits)
- `services/vita-api/src/test/kotlin/com/llmagal/vita/ai/PhotoParseFlowTest.kt` (new)
- constructor-arg fixups in `ParseFlowTest`, `ParseEvalTest`, `ParseLiveEvalTest`

## Questions for the CEO

None.

# BE-015 (implementation) — plan/program parse-import + uploads seam

Asana: Vita backend board `1216519867368580` — ticket BE-015 (contract half done in v0.3.0; this is the Kotlin implementation half).
ADRs: ADR-0005 (drafts never persisted), ADR-0011 (plan/program parse-import).

## What shipped (local; DoD = production, blocked on BE-004)

Three endpoints from contract v0.3.0, implemented Kotlin-side. No contract change (0.3.0 already specced these; my DTOs match field-for-field).

### POST /v1/parse/eating-plan · POST /v1/parse/training-program
- Synchronous, tool-forced Claude call; **nothing persisted** (ADR-0005 pattern of `/parse/text`).
- Body `PlanImportRequest` = exactly one of `text` or `fileRef` (validated in the controller — the trust boundary; `oneOf` violation → 400, text > 8000 → 400).
- Returns `EatingPlanDraft` / `TrainingProgramDraft` (structured shape + human `summary` for the read-back).
- **Text → Haiku**; **fileRef (PDF) → a native-document model (Sonnet-class)** — model ids in config, not code.
- Empty/unusable model output → 422; unknown/expired `fileRef` → 422.
- **BE-014 guardrails reused, not duplicated**: same `ParseQuota` daily ceiling (429 + Retry-After before the model call) and `ParseMetrics` token/cost counters. The 429 body is now a shared `tooManyRequests(...)` helper used by both `ParseController` and `PlanParseController`.

### POST /v1/uploads
- Vends a presigned S3 PUT URL + opaque `fileRef` (OPS-011). Purpose `plan_document` / contentType `application/pdf` enforced (else 400).

## The S3 seam (mirrors the BE-005 KMS seam)
`uploads/service/FileStore.kt`:
```
interface FileStore {
    fun presignPut(contentType: String): PresignedUpload   // {fileRef, uploadUrl, expiresAt}
    fun read(fileRef: String): ByteArray                    // throws UnknownFileRefException → 422
}
```
- `LocalFileStore` (the only impl, `@Component`): presign returns a **stub URL** nobody uploads to; `read` resolves the fileRef (validated as a UUID → also blocks path traversal) to a file under `vita.uploads.local-dir`. So `./gradlew check` runs with **no AWS**.
- Real S3 presigner drops in for prod as a replacement bean (devops OPS-011) — nothing else changes.
- When a parse request carries a `fileRef`, `PlanParseService` reads via this same interface and posts the bytes to Claude as a **native base64 PDF `document` block** (not our own OCR). Uploaded/described content is DATA — the system prompts forbid following instructions inside it (injection-safe).

## Files
Created:
- `ai/controller/PlanDtos.kt` — PlanImportRequest, EatingPlanDraft/PlanMeal/PlanItem, TrainingProgramDraft/ProgramDay/PlanExercise, MacroTotals, Micro (`@JsonInclude(NON_NULL)`; required fields non-null so malformed model output fails deserialization → 422).
- `ai/controller/PlanParseController.kt`, `ai/controller/RateLimitResponses.kt` (shared 429 helper).
- `ai/service/PlanParseService.kt`, `ai/service/PlanPrompts.kt` (system prompts + tool schemas).
- `uploads/service/FileStore.kt`, `uploads/controller/UploadsController.kt`.
- Tests: `ai/PlanParseFlowTest.kt` (6), `uploads/FileStoreTest.kt` (4), `uploads/UploadsControllerTest.kt` (3).

Changed:
- `ai/client/ClaudeClient.kt` — added a generic `callTool(model, system, tool, toolName, userContent, type)` that deserializes the tool input into a caller draft type; a second RestClient `planRest` with a longer read timeout (plan calls are bigger); refactored `post` to take a RestClient. `parseText` unchanged in behaviour. `@Suppress("LongParameterList")` (config + per-call args).
- `ai/controller/ParseController.kt` — now uses the shared `tooManyRequests(...)`.
- `application.yaml` — `vita.ai.plan-model`, `plan-pdf-model`, `plan-max-output-tokens`, `plan-timeout-seconds`; `vita.uploads.local-dir`, `url-ttl-seconds`.
- Test constructor calls for `ClaudeClient` (+2 params) in ParseFlowTest/ParseEvalTest/ParseLiveEvalTest.

## Exact model ids used (in config)
- `vita.ai.plan-model` = **`claude-haiku-4-5`** (text plan/program — cheapest that does the job).
- `vita.ai.plan-pdf-model` = **`claude-sonnet-4-6`** (native PDF document input; ADR-0005 reserves Sonnet-class/vision for photos + PDF import).
- (unchanged) `vita.ai.model` = `claude-haiku-4-5` for capture `/parse/text`.

## Verification
- `./gradlew check` **green — 84 tests** (was 71; +6 PlanParseFlowTest, +4 FileStoreTest, +3 UploadsControllerTest). WireMock goldens for Claude (no live API in the build; live eval still `@Tag("live")`). Testcontainers only where the DB is touched (these tests don't touch it).
- `redocly lint` exit 0 — contract v0.3.0 unchanged; only the pre-existing cosmetic operationId/tag-description warnings.

## Blocked / dependencies
- **Devops (OPS-011)**: real S3 bucket for plan-document uploads + presigned PUT + short lifecycle expiry, and the prod `FileStore` presigner bean. Until then, `fileRef` upload works only via the local stub.
- **Devops (ADR-0005 key)**: the zero-retention Anthropic key in Secrets Manager (already in local `secrets.yaml`); PDF import also spends on a Sonnet-class model — keep an eye on the $10/mo budget alarm (OPS-015).
- Production deploy still blocked on BE-004.

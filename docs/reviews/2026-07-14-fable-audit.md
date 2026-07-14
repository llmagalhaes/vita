# Fable audit — completed work (2026-07-14)

Read-only audit by a Fable review agent of everything built through session 3 (BE-005–016, app onboarding→capture→home). Verdict: **unusually clean**; crypto envelope, auth/refresh-rotation, idempotent write, and the product philosophy encoding are all correct. Findings ranked, with disposition.

## Correctness

| # | Sev | Where | Defect | Disposition |
|---|---|---|---|---|
| 1.1 | HIGH | `app .../db/entries.ts:62-72` | `entriesForDay` compares ISO timestamps lexicographically; offset-bearing (`+01:00`) timestamps from the real backend fall in the wrong local day → entries near day boundaries vanish. Invisible to tests (all use `Z`). | **APP fix batch** — normalize `occurredAt` to UTC instant on write in `addLocalEntry`. |
| 1.2 | HIGH | `app .../db/outbox.ts:47-53` | Outbox poison-pill: non-retryable 4xx (400/409/422) retries forever and blocks the ordered drain → one bad item stalls all sync. | **APP fix batch** — drop/park on 400/409/422, keep backoff for network/5xx. Overlaps ticketed APP-033. |
| 1.3 | MED | `backend EntryService.normalize` / `EntryDetail.kt:63` | Contract (v0.4.0 §915) promises muscle closed-vocab mapping (lats→back, abs→core); **not implemented** → contract-invalid muscles stored, violates app's generated `Muscle` enum. Bites slice 2 body-map. | **Feed to backend** as BE-017 fast-follow (same file area). |
| 1.4 | MED | `backend EntryService.normalize` | Contract minimums (kcal≥0, durationMin≥1, inputMethod enum) unvalidated → negative kcal stored silently; out-of-range/enum → Postgres CHECK 500 where contract implies 400. | **Feed to backend** — numeric-bounds check in `normalize()`. |
| 1.5 | LOW | `CryptoService.kt:78-91` | `shred` vs concurrent `dek()` cache-repopulation race; plaintext DEK usable up to 15min TTL. Near-nil in real purge path. | Note / one-line version-check. Debt. |
| 1.6 | LOW | `ClaudeClient.kt:141-158` | Retries every `RestClientException` incl. 4xx/429, ignores `Retry-After`. | Debt — limit retry to timeouts/5xx. |
| 1.7 | INFO | `TokenService.rotate` | Concurrent legit refresh replay revokes the family. App single-flight makes rare. Accepted tradeoff. | No action. |
| 1.8 | RESOLVED | `PlanParseService.kt:29` | `claude-sonnet-4-6` **is valid** (active, PDF-capable) — Next_session warning was half-right. `claude-sonnet-5` is current + cheaper ($2/$10 vs $3/$15). | **BE-023** (in flight) — switch worth doing, not a failure. |

## Product philosophy

| # | Sev | Where | Defect | Disposition |
|---|---|---|---|---|
| 2.1 | MED | `home.tsx:315,323,347` | Energy bars normalize against hardcoded **2500 kcal** — an unlabeled implicit daily target ("no goals/scores"). | **APP fix batch** — scale vs user's own recent max (like macros card), or max(consumed,spent). |
| 2.2 | MED | `home.tsx:344-355` | "Last 7 days" chart shows **fabricated** data (6 days hardcoded 6% stubs). Breaks "shows back what you tell it". | **APP fix batch** — query real prior 6 days via `entriesForDay`, or drop until trends (slice 6). |
| 2.3 | MED | `V002 auth_tokens` / `MagicLinkService` | Consumed/expired `magic_link_token` rows (encrypted email) never purged. "Store strictly what's necessary". | **BE-022** (already ticketed) — one-line periodic DELETE. Bump priority. |
| 2.4 | LOW | `users.email_enc` (service DEK) | Email uses service DEK, survives crypto-shred in 45-day backups (unlike per-user DEK data). Deliberate per comment. | Confirm ADR-0004 explicitly accepts the backup-retention exception; CEO note. |
| 2.5 | LOW | `EntryService.totalsOf` / `CaptureSheet.tsx:79` | Null macros render as "0 g" — asserts a value that's unknown. | **APP fix batch** (app side) — render "—" for null. Backend side minor. |

Verified clean: system prompts encode the philosophy, every AI draft forced `isEstimate=true`, estimates labeled across the app, dual input real (voice stubbed = ticketed APP-007), habits/trends honest placeholders.

## Over-engineering (ponytail)
- **3.1 LOW** `ClaudeClient.kt:72` builds its own Jackson 2 `ObjectMapper` while the service uses Boot's Jackson 3 — inject the Boot `JsonMapper`, delete a dep. Debt.
- **3.2 INFO** `outbox.ts:5` `op` column written, never read — kept only because local edit/delete sync is coming (APP-033-ish). Leave.

## Test gaps (map 1:1 to bugs)
1. `entriesForDay` with non-Z offsets / day-boundary (→1.1)
2. Outbox non-retryable 400/409 (→1.2)
3. Entry validation bounds: negative kcal, durationMin 0, out-of-enum inputMethod, unmappable muscle (→1.3/1.4)
4. Keyset tiebreaker at identical `occurred_at` (hand-rolled SQL, untested)
5. `RateLimiter` window-rollover direct unit test

## Orchestrator plan
- **Now (app fix batch):** 1.1, 1.2, 2.1, 2.2, 2.5(app) + tests 1, 2. Disjoint from the running backend agent.
- **Backend fast-follow (after BE-017/BE-023 land):** 1.3 muscle mapping + 1.4 validation + test 3; BE-023 already covers 1.8.
- **Bump priority:** BE-022 (2.3 token purge).
- **Debt (BE-028/APP-037 hygiene sweep):** 1.5, 1.6, 3.1, tests 4–5.
- **CEO note:** 2.4 backup email exception in ADR-0004.

# BE-034 — Magic-link email: embed a QR of the sign-in link

Asana: Vita backend `1216754230436881`. Session 16 (2026-07-21). Builds on BE-033 (real SES email).

CEO ask: the magic-link email must include a QR of the `vita://auth` link — the CEO reads email on
desktop and scans it with the phone to sign in. Email clients don't render `data:` URIs, so the QR
is an inline CID attachment, which means switching the SES send from `SendEmail` to `SendRawEmail`
with a MIME message.

## What was built (ponytail, shortest diff over BE-033)

- **`service/auth/Qr.kt`** (new) — `qrPng(text, size = 360): ByteArray`. QR via **zxing-core only**
  (`QRCodeWriter` → `BitMatrix`); the PNG is written with the **JDK's `ImageIO`/`BufferedImage`**, so
  we skip the zxing `javase` helper module (it does the same ~10 lines). Error-correction M, UTF-8,
  default (spec) margin. One new dep: `com.google.zxing:core:3.5.3`.
- **`service/auth/SesMailer.kt`** — now sends `SendRawEmail` with a **multipart/related** MIME built
  with **jakarta.mail (angus-mail)**:
  - `multipart/alternative` → `text/plain` (quiet copy + the raw `vita://auth` link, kept as
    fallback + accessibility) and `text/html` (short line + `<img src="cid:qr">`),
  - inline `image/png` part, `Content-ID: <qr>`, disposition INLINE — the 360px QR of the same link.
  - Dep: `org.eclipse.angus:angus-mail:2.0.3` (no `spring-boot-starter-mail`; MIME assembly only).
  - **Fail-safe UNCHANGED (BE-033 semantics):** the whole build+send is wrapped — any throw →
    WARN + delegate to the `LogMailer` fallback (the CloudWatch link recipe) so `/auth` never 500s.
- **`MailerConfig` / `Mailer` / `LogMailer` / `AwsClientsConfig` — untouched.** Selection contract
  (blank/sentinel `MAIL_FROM` → `LogMailer`; real address + SES bean → `SesMailer`) is unchanged;
  the SES bean already existed from BE-033.
- No contract change (mailer is internal; no OpenAPI, redocly N/A). No migration. IAM already allows
  `ses:SendRawEmail` (OPS-023 scoped both actions), so no devops dependency.

## Tests — `MailerTest` extended (7 tests, was 6)

- `qrPng renders a QR that decodes back to the link` — encode then decode with zxing-core only
  (`RGBLuminanceSource` + `HybridBinarizer` + `QRCodeReader`, no `javase`).
- `SesMailer sends a multipart-related MIME …` — captures the `SendRawEmailRequest`, parses the raw
  bytes back with jakarta.mail, asserts: content-type `multipart/related`, subject, a `text/plain`
  leaf containing the link, a `text/html` leaf containing `cid:qr`, an inline `image/png` leaf with
  `Content-ID: <qr>` and disposition INLINE, and that the **embedded QR decodes to the link**.
- Selection branches (4) + fail-safe (throw on `sendRawEmail` → logs, doesn't propagate) — kept.

## Gates

`./gradlew check` green — **155 tests, 0 failures** (was 154; +1 net in MailerTest), detekt + ktlint
clean. Note: `PhotoParseFlowTest`'s "an image over 5 MB is a 413" is a pre-existing **racy transport
flake** (server RSTs the oversized upload before the JDK HttpClient finishes streaming the body →
`chunked transfer encoding, state: READING_LENGTH`); it flipped red once during this session and
passed on rerun. Unrelated to BE-034 (auth mailer path, no shared code with `/parse/photo`).

## Deploy (same procedure as BE-033)

- Host `./gradlew bootJar` → staged a **minimal context** (jar + `Dockerfile.runtime`) in a temp dir,
  because `.dockerignore` excludes `build/` (first build failed on a missing jar checksum until
  staged) → `docker build --platform linux/arm64 -f Dockerfile.runtime` → push.
- Image: ECR `vita-api:be034`, digest
  **`sha256:b7c52fee78e55228a66f5ddf853d0d2e1bcb30d0428fd452d2d290556df1d0aa`**, linux/arm64.
- Registered task-def **`vita:6`** (clone of `vita:5` + new image **by digest**), service `vita`
  updated. Rollout **COMPLETED**, 1/1 running, old `vita:5` drained.

## Live verify (2026-07-21)

- `GET /health` → **200** (bare `/health`, as in BE-033; `/v1/health` 401 is the API-GW path-prefix +
  resource-server matcher, pre-existing and unrelated).
- `POST /v1/auth/magic-link {"email":"lucasmagalhaes2007@gmail.com"}` → **202**.
- **SES path confirmed, fail-safe NOT triggered:** no `Magic link for …` line and no
  WARN/ERROR/SesMailer/Exception in `/ecs/vita` for the send window. `SesMailer` logs nothing on
  success and only falls back (WARN + log line) on failure — its absence proves `SesMailer` was
  selected and the `SendRawEmail` did not throw → SES accepted the message.
- **Remaining confirmation belongs to the CEO** (no inbox access from here): open "Your Vita sign-in
  link", confirm the QR renders and scanning it on the phone opens `vita://auth` and signs in.

Retest command:

```
curl -sS -X POST https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/v1/auth/magic-link \
  -H 'content-type: application/json' -d '{"email":"lucasmagalhaes2007@gmail.com"}' -i
```

CloudWatch escape hatch (only logs the link if the SES send fails):
`aws logs tail /ecs/vita --region eu-west-1 --filter-pattern "Magic link" --follow`

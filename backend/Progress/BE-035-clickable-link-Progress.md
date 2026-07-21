# BE-035 — Clickable magic-link email (https redirect entry door)

Asana: Vita backend `1216766487530093`. Session 16b (2026-07-21). Builds on BE-033 (real SES) +
BE-034 (QR email).

## Problem (CEO)

The CEO can't click the magic link in the email. Root cause: email clients only auto-link / allow
`http(s)` URLs; a raw `vita://auth?token=...` link is dead text (and Gmail neuters custom-scheme
anchors). Sends themselves are healthy (202, SES path, no fallback logs — verified minutes before this
session). This implements the old OPS-016 backlog idea (magic-link redirect).

## What was built (ponytail, shortest diff)

The email now carries an **https** link to a new public redirect endpoint; the endpoint 302s to the
app scheme. `SesMailer` already embeds whatever `link` it's handed in the text part, the HTML anchor,
and the QR — so switching the link `MagicLinkService` builds flows through all three unchanged.

- **`controller/auth/AuthController.kt`** — new public `GET /v1/auth/link?token=...` → **302
  `Location: vita://auth?token=<token>`** plus a minimal `text/html` body (a tappable `vita://auth?...`
  anchor + one quiet line "Open this on the phone with Vita installed") for clients that don't follow
  custom-scheme redirects. Token is **opaque pass-through**: not verified, consumed, or logged (that's
  `/magic-link/verify`'s job). `@RequestParam` is re-encoded with `URLEncoder` into the query
  component (URLEncoder output is ASCII with no HTML metacharacters → the anchor can't break out, no
  HTML escaping needed). Injected `AuthProps` for `magicLinkBaseUrl`. No auth (covered by the existing
  `/v1/auth/**` permitAll in `SecurityConfig` — the JWT filter already excludes all `/auth/*`).
- **`service/auth/MagicLinkService.kt`** — the email link changed from `"${magicLinkBaseUrl}?token="`
  to **`"${publicBaseUrl}/v1/auth/link?token=$token"`**. One line. `SesMailer`/`Qr.kt` untouched — they
  embed `link` verbatim, so plain text, HTML button, and QR all now carry the https URL.
- **`config/AuthProps.kt`** + **`application.yaml`** — new `vita.auth.public-base-url` ←
  `PUBLIC_BASE_URL`, default `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com` (the API Gateway
  URL). `magic-link-base-url` stays `vita://auth` (now the redirect *target*, not the email link).
  Devops can later move `PUBLIC_BASE_URL` to SSM — not a blocker.
- **`docs/contracts/vita-api-v0.yaml`** — additive: public `GET /auth/link` (302 + text/html, opaque
  `token` query param). Not called by the app (the browser follows it from the email). redocly valid.
- No migration, no new dep, no devops dependency. BE-033 fail-safe + BE-034 QR/MIME all intact.

## Tests

- **`AuthFlowTest`** (+2): `link redirect bounces to the app scheme, serves html fallback, and passes
  the token through untouched` — a JDK `HttpClient` with `Redirect.NEVER` (the Location is a custom
  scheme the client can't resolve) asserts **302**, `Location: vita://auth?token=a%2Bb%2Fc%3Dd` (token
  `a+b/c=d` sent URL-encoded, decoded server-side, re-encoded untouched), the HTML anchor, and the
  quiet fallback line. Plus `magic-link email carries an https link to the redirect endpoint`
  (starts `https://`, contains `/v1/auth/link?token=`).
- **`MailerTest`** — link constants updated to the https redirect form; the existing QR-decode + MIME
  assertions now prove the QR/text/html carry the **https** URL.

## Gates

`./gradlew check` green — **157 tests, 0 failures** (was 155 at BE-034; +2 AuthFlowTest), detekt +
ktlint clean. redocly lint valid (pre-existing operationId warnings only).

**detekt gotcha (cost 2 rebuilds, save the next agent):** Kotlin supports **nested block comments**,
and the KDoc for the `link` method originally contained `/v1/auth/**` — the `/*` in `auth/**` opens a
nested comment, so detekt's parser treated the KDoc's closing `*/` as closing *that* nested comment
and swallowed the rest of the file, reporting every constructor property used after `link` as
"unused". kotlinc tolerates it (compile + tests passed), detekt doesn't. Fix = reword the KDoc to
avoid any `/*` sequence. Don't put a URL path ending in `/*`/`/**` inside a KDoc/block comment.

## Deploy (same procedure as BE-033/034)

- Host `./gradlew bootJar` → staged a minimal context (jar + `Dockerfile.runtime` in a temp dir,
  `.dockerignore` excludes `build/`) → `docker build --platform linux/arm64 -f Dockerfile.runtime`
  → push. **Docker credStore gotcha:** the host's `~/.docker/config.json` uses
  `credsStore: "desktop"`, whose helper **hangs** in this non-interactive shell (every `docker login`
  / registry auth blocks). Worked around with a **scoped `DOCKER_CONFIG` dir** holding the ECR auth
  token inline (`{"auths":{"<registry>":{"auth":"<base64 AWS:pw>"}}}`, no credStore) and
  `docker --config <dir> …` — touches nothing in the user's config.
- Image: ECR `vita-api:be035`, digest
  **`sha256:8142675bbc8aa7b314cccf9aa73da9ceecaf1bda60fb229a31d19e675b591f85`**, linux/arm64.
- Registered task-def **`vita:7`** (clone of `vita:6` + new image by digest), service `vita` updated.
  Rollout **COMPLETED, 1/1 running**, old `vita:6` drained.

## Live verify (2026-07-21)

- `GET /health` → **200**.
- `GET /v1/auth/link?token=TEST123` → **302**, `Location: vita://auth?token=TEST123`,
  `content-type: text/html`, body = the tappable `vita://auth?...` anchor + "Open this on the phone
  with Vita installed."
- Token pass-through incl. URL-encoding: `?token=a%2Bb%2Fc%3Dd` → `Location:
  vita://auth?token=a%2Bb%2Fc%3Dd` (decoded to `a+b/c=d`, re-encoded untouched).
- `POST /v1/auth/magic-link {lucasmagalhaes2007@gmail.com}` → **202**; no `Magic link` fallback line
  and no WARN/SesMailer/Exception in `/ecs/vita` for the window → SES path taken (`SendRawEmail` did
  not throw). The email now carries the https link (clickable + in the QR).
- **Remaining = CEO-side:** open the email, click the https link (should open Vita on the phone) or
  scan the QR. → then move BE-035 to Done.

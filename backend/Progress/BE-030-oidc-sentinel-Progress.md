# BE-030 — OIDC: treat SSM audience placeholder as unconfigured (503, not 401)

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216590099219043

## State: DONE locally (2026-07-15). Ships in the next image. Not yet in prod (image 909262c).

## Problem (root cause)
`OidcVerifier.configFor` failed closed only when the configured audience was
**blank**. The `google-client-config` / `apple-client-config` SSM params are
seeded with the non-blank sentinel `REPLACE_ME_IN_CONSOLE` until the CEO pastes
the real OAuth client id. Non-blank sentinel ⇒ the blank guard did not fire ⇒
the audience validator ran against a bogus client id ⇒ every id token returned
**401** instead of the correct **503** "provider not configured".

## Fix
One guard, at the single fail-closed check all providers route through:

```kotlin
if (cfg.props.audience.isBlank() || cfg.props.audience == SSM_PLACEHOLDER) {
    throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "$provider sign-in is not configured.")
}
```
Companion const `SSM_PLACEHOLDER = "REPLACE_ME_IN_CONSOLE"`. Files:
`service/auth/OidcVerifier.kt` (+ const + guard), test
`auth/OidcVerifierTest.kt` (+1: placeholder audience ⇒ 503).

## Impact now
The CEO has set the real **Google** client id in SSM
(`344224052120-...apps.googleusercontent.com`), so Google is genuinely
configured and unaffected. **Apple** is still on the placeholder → this fix makes
Apple sign-in return the clean 503 ("not configured") instead of a misleading 401
until its client id is set.

## Verification
`./gradlew check` green — **148 tests, 0 failures** (was 147; +1), detekt+ktlint
clean. No contract change, no new dep.

# BE-003 — CI + contract lint

Asana: https://app.asana.com/0/1216519867368580/1216519895242015

## 2026-07-13

- `.github/workflows/backend-ci.yml`: on push(main)/PR touching `backend/services/**` — JDK 21 (temurin) + gradle setup, `./gradlew check` (build, ktlint, detekt, tests incl. Testcontainers; ubuntu-latest has Docker). No secrets needed.
- `.github/workflows/contract-lint.yml`: on push(main)/PR touching `docs/contracts/**` — `npx @redocly/cli@2 lint docs/contracts/*.yaml`.
- **No GitHub remote exists yet** — workflows are written to activate on first push. Assumptions documented in the file headers: repo pushed as-is (workflows at root), ubuntu-latest runners, no environment secrets.
- **Verified locally**: redocly lint exit 0 on `vita-api-v0.yaml` (valid; 21 warnings — mostly missing `operationId`s, cosmetic; contract deliberately untouched while it awaits app-team review), both workflow files YAML-parse clean, and `./gradlew check` (the exact CI command) green.

Status: code complete; In progress (activates on first push; Done = in production).

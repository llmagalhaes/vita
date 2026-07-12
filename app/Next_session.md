# App Team — Next Session

## Current state (Phase 0 — Kickoff, done)

- Team folder structure created (`Backlog/` + `Wip/` + `Done/`, `Progress/`, `Doc/ADRs/`, `services/`).
- `Doc/kickoff-proposal.md` written and awaiting CEO review. Key content:
  - **Stack recommendation: React Native + Expo** (Reanimated 3 + react-native-skia + Gesture Handler core), compared honestly against Flutter and KMP/Compose on the CEO's criteria (fluidity, animation fidelity, future-proofing).
  - Architecture: TypeScript strict, Expo Router, TanStack Query + Zustand, offline-first via local SQLite + outbox queue with idempotency keys, `@vita/ui` design-system package from brief tokens, accent theming + vacation-mode sea-tone theme.
  - Platform: on-device voice transcription, expo-camera, actionable lock-screen check-in notifications, Apple Health / Health Connect device-side reads with daily summary sync-up.
  - QA: Jest + RNTL component tests, Maestro E2E, OpenAPI-generated client + MSW mocks.
  - 7 delivery waves (Foundations → Identity/Onboarding → Capture & Log → Plans/Habits/Notifications → Movement/Trends → Account/Modes/Export → Store release).

## Next steps (blocked on Phase 0 approval)

1. On CEO approval: write **ADR-001 (stack choice)** in `Doc/ADRs/`.
2. Phase 1: turn each wave's epics into `APP-NNN` tickets in `Backlog/` (start with Wave 0).
3. Coordinate with backend (via orchestrator) on the first contracts in `docs/contracts/`: auth, capture parsing, log CRUD with idempotency keys + `updatedAt` (offline outbox depends on it).
4. Request from DevOps: EAS (or self-hosted build) decision, store accounts, APNs/FCM.

## Blockers / open items

- CEO answers to the 9 questions in `Doc/kickoff-proposal.md` §7 (EAS budget, dark mode, tablets, min OS, localization, cycle chip in v1, capture-bar chrome variant, voice privacy posture, trends computation split).
- `docs/contracts/` is empty — no app implementation against APIs until contracts exist.
- No app code exists yet (`services/` is empty by design for Phase 0).

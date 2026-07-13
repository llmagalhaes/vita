# ADR-0008 — Local device notifications: no server push in v1

**Status:** Accepted — 2026-07-13 (CEO decision, post-kickoff #3)

## Context

Habit check-ins and plan digests need reminders. Server push means push infrastructure (SNS/FCM/APNs), stored device tokens, and a new identifier class — against the minimization premise and the cost ceiling.

## Decision

Notifications are **scheduled locally on the device**. The backend serves data only: habit schedules (days + time), plan-digest content, and the vacation-mode kept-notification set, via ordinary API endpoints the app reads after sync.

## Consequences

- **No push tokens stored anywhere** (data-minimization win, ADR-0003), no SNS/FCM/APNs, no push infra tickets to devops.
- Reminders work offline; the backend cannot trigger anything server-side — acceptable, v1 has no server-initiated events.
- Schedule fields already live in the habit model; the W5 notification epic shrinks to one read endpoint.
- v2 revisit only if a genuinely server-initiated notification appears.

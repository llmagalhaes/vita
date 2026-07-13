# App Team — Next Session

## Current state (Phase 2 — Implementation, session 1 done 2026-07-13)

- **ADR-0001 written** (`Doc/ADRs/ADR-0001-stack-react-native-expo.md`) — stack decision recorded.
- **`Doc/foundations.md` updated with CEO Round 5**: v2 pill only, light-only, phone-only iOS 16+/Android 10+, cycle chip v1 via health platforms only, display name TBD (single config constant).
- **APP-001 done-pending-ack**: `Doc/contract-review-v0.md` answers all 7 TBD-APP-REVIEW points. Two contract edits requested from backend (muscles → 11-value enum; `ParseResult.drafts` maxItems 5); `?updatedSince=` explicitly declined for v0. Hand to backend via orchestrator; close on their ack.
- **APP-002 built**: `services/vita-app/` — Expo SDK 57 + TS strict + Expo Router, `com.llmagal.vita` both platforms, scheme `vita://`, API base URL from `VITA_API_BASE_URL` build env (`src/config.ts`), light-only, phone-only. `tsc --noEmit` clean, Jest 5/5 green. Build quirks documented in `Progress/APP-002-expo-scaffold-Progress.md` (jest 29 pin, test-renderer + @react-native/jest-preset peers, .npmrc legacy-peer-deps).
- **APP-003 first slice**: `src/ui/` — full token set from the brief + Text/Card/Button/Chip with tests. Theming provider (accent options + vacation sea-tone swap) deliberately deferred.
- **APP-004 done-pending-prod**: react-i18next, `en.json` sole locale, all scaffold strings through `t()`.
- Asana: APP-001/002/003/004 all in "In progress" (nothing moved to Done — DoD is in production, tester builds blocked on store accounts).

## Next steps

1. APP-005 (whatever wave-0 remains per backlog) then APP-006: API client + auth flow against `vita-api-v0.yaml` (magic link via `vita://auth`, token pair storage in expo-secure-store, serialized refresh).
2. APP-011 capture pill (v2 only) — bring in Reanimated + Gesture Handler then; add motion tokens to `src/ui`.
3. Extend `src/ui` as screens demand (Bar, Donut, EstimateTag, WaveIllustration, theming provider).
4. When backend applies the two contract edits, regenerate/verify app-side types (codegen not set up yet — decide openapi-typescript when the API client starts).
5. Min-OS pinning (iOS 16 / Android 10) via expo-build-properties at first prebuild.

## Blockers / open items

- Apple Developer + Play Console accounts (CEO, deferred Round 5) — blocks APP-007 tester builds, and thus any ticket reaching Done.
- Backend ack of `Doc/contract-review-v0.md` + the two contract edits.
- API Gateway URL (devops) needed before the API client can be exercised against production.

## Key references

- `app/Doc/foundations.md` — fixed decisions (now includes Round 5).
- `app/Doc/contract-review-v0.md` — contract verdicts.
- `app/Doc/ADRs/ADR-0001-stack-react-native-expo.md`.
- Asana "Vita frontend" GID `1216519867368576`; In progress section GID `1216521805290095`, Backlog `1216523313289549`.

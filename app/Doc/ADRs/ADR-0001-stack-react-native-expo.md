# ADR-0001 — App stack: React Native + Expo

- **Status**: Accepted (CEO, decision log Round 4/kickoff)
- **Date**: 2026-07-13

## Context

The CEO delegated the app stack choice with three criteria, in order: (1) UI fluidity, (2) animation fidelity to the hi-fi prototype (an HTML/CSS/SVG artifact: 97 inline SVGs, 17 keyframe families, gesture-driven charts/sliders/card stacks), (3) future-proofing. Implementation language is irrelevant — AI writes all code. Candidates compared in `app/Doc/kickoff-proposal.md` §1: React Native + Expo, Flutter, Kotlin Multiplatform + Compose.

## Decision

**React Native with Expo (SDK 53+, New Architecture), with Reanimated 3 + react-native-gesture-handler + react-native-skia as the animation/graphics core.** Expo Router for navigation; TanStack Query + Zustand for state; expo-sqlite outbox for offline-first logging.

## Rationale (summary of the kickoff comparison)

- **Fluidity**: Reanimated worklets and Skia run on the UI thread — gestures/animations never block on JS. Flutter wins raw out-of-the-box frame consistency, but RN keeps truly native scroll physics, text input, and accessibility.
- **Prototype fidelity**: the prototype's SVG paths port near-1:1 into Skia; the declarative component + CSS-like styling model is the closest of the three to the prototype source — lowest translation loss when AI transcribes 26 screens.
- **Future-proofing**: largest ecosystem for health/voice/notification edge cases, store-blessed OTA updates, and the most reliable target for AI code generation. KMP's shared-Kotlin benefit is neutralized by OpenAPI contracts; its iOS maturity is the weakest.

## Consequences

- Manual release builds on the CEO's Mac must use `expo prebuild` + local builds (no EAS subscription) — kept as a documented one-command flow.
- New Architecture is mandatory from day one (Reanimated 3/Skia perform best there); no legacy-arch fallbacks.
- Flutter would have been the pick if criterion 1 alone decided; revisit only if RN's UI-thread stack fails a real fluidity target on low-end Android during Wave 6 profiling.

# APP-050 — Sheet entrance bounce fix (spec phase)

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216599815880737
Status: **Backlog — gated on CEO approval of the spec. No code changed.**

## 2026-07-15 — spec session
- CEO reported: sheets bounce on entrance ("parece que está tudo quebrado") — regression
  from session-10 `useSheetTransition` (commit `5c6974a`, APP-042).
- Root cause confirmed: `src/ui/useSheetDrag.ts:39` entrance `withSpring(damping 20,
  stiffness 210)` → ζ = 0.69 (underdamped) → ~5% overshoot ≈ 33px visible bounce, on all
  10 sheets (one shared hook). Drag-dismiss + 260ms programmatic close are correct — keep.
- Spec written: **`docs/reviews/2026-07-15-sheet-motion-fix-spec.md`** — physics, full
  call-site enumeration (SheetOverlay + Capture/Checkin/Review standalone; 7 SheetOverlay
  riders), recommended fix (entrance → `withTiming` 450ms `motion.unfold` bezier =
  prototype vtSheetUp; spring-back damping 18→30, ζ≈1), diff sketch, verification plan
  (emulator pass + one new no-overshoot regression test), risk analysis.
- Team: Fable lead (physics/motion judgment) + 1 Sonnet Explore sub-agent (mechanical
  call-site/test enumeration). No emulator booted; no `src/` touched.
- Open CEO questions (in the spec): 450ms vs faster 360ms; ship the spring-back damping
  bump together or not.

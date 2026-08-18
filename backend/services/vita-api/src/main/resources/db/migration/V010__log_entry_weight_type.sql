-- V010 — allow the `weight` entry type (BE-049, ADR-0019). Manually logged body
-- weight rides the log_entry write path as a new type; V006 widened the CHECK to
-- meal/water/workout/checkin. Expand-only (ADR-0002): widen the constraint in
-- place. The auto-named inline CHECK is log_entry_type_check.

ALTER TABLE log_entry DROP CONSTRAINT log_entry_type_check;
ALTER TABLE log_entry ADD CONSTRAINT log_entry_type_check
    CHECK (type IN ('meal', 'water', 'workout', 'checkin', 'weight'));

-- V006 — allow the `checkin` entry type (BE-024, ADR-0013). Check-ins ride the
-- log_entry write path as a new type; the V001 CHECK only listed meal/water/
-- workout. input_method already permits 'checkin' (V001). Expand-only (ADR-0002):
-- widen the constraint in place. The auto-named inline CHECK is log_entry_type_check.

ALTER TABLE log_entry DROP CONSTRAINT log_entry_type_check;
ALTER TABLE log_entry ADD CONSTRAINT log_entry_type_check
    CHECK (type IN ('meal', 'water', 'workout', 'checkin'));

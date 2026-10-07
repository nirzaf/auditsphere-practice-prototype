-- Preserve every displayed management metric with the immutable report cutoff.
ALTER TABLE profitability_snapshots ADD COLUMN pending_minutes INTEGER
  CHECK (pending_minutes IS NULL OR pending_minutes>=0);
ALTER TABLE profitability_snapshots ADD COLUMN billed_minor INTEGER
  CHECK (billed_minor IS NULL OR billed_minor>=0);
ALTER TABLE profitability_snapshots ADD COLUMN collected_minor INTEGER
  CHECK (collected_minor IS NULL OR collected_minor>=0);

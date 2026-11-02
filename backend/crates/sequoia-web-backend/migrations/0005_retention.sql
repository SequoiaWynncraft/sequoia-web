-- Retention (#125). Raw guild payloads become an optional diagnostic tier
-- and member presence is no longer recorded, so both may now be absent.
-- These are metadata-only changes; no existing row is rewritten.
ALTER TABLE guild_snapshots ALTER COLUMN raw_payload DROP NOT NULL;
ALTER TABLE member_raid_counters ALTER COLUMN online DROP NOT NULL;

-- Retention keeps any snapshot that a delta or an anomaly still references,
-- because deleting it would cascade into finalized scores or diagnostics.
CREATE INDEX member_raid_deltas_from_snapshot_idx ON member_raid_deltas (from_snapshot_id);
CREATE INDEX member_raid_deltas_to_snapshot_idx ON member_raid_deltas (to_snapshot_id);
CREATE INDEX tracker_anomalies_snapshot_idx ON tracker_anomalies (snapshot_id);

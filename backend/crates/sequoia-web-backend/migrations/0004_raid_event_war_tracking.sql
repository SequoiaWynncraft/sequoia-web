-- 'wars' events count war points from sequoia-backend's war-point read model,
-- fed by the Sequoia mod. Raid scoping stays mod-only (see 0003).
ALTER TABLE raid_events
    DROP CONSTRAINT raid_events_tracking_check;

ALTER TABLE raid_events
    ADD CONSTRAINT raid_events_tracking_check
    CHECK (tracking IN ('api', 'mod', 'wars'));

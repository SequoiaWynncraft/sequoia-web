-- Events choose their contribution source: 'api' diffs Wynncraft counter
-- snapshots, 'mod' uses in-game completions scraped by the Sequoia mod.
ALTER TABLE raid_events
    ADD COLUMN tracking TEXT NOT NULL DEFAULT 'api'
    CHECK (tracking IN ('api', 'mod'));

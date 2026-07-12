-- Mod-tracked events may scope their leaderboard to a single raid; API
-- counter diffs cannot attribute completions per raid, so 'api' events stay
-- unscoped (NULL means all guild raids count).
ALTER TABLE raid_events
    ADD COLUMN raid TEXT
    CHECK (raid IS NULL OR tracking = 'mod');

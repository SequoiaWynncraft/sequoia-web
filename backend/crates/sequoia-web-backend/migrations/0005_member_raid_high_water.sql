-- The highest current-guild raid count seen for each member of each guild. Every ingest needs
-- it as the baseline for new deltas, and reading it from member_raid_counters meant scanning
-- each member's whole history on every poll.
CREATE TABLE member_raid_high_water (
    guild_uuid UUID NOT NULL,
    player_uuid UUID NOT NULL,
    current_guild_raids BIGINT NOT NULL,
    PRIMARY KEY (guild_uuid, player_uuid)
);

INSERT INTO member_raid_high_water (guild_uuid, player_uuid, current_guild_raids)
SELECT snapshot.guild_uuid, counters.player_uuid, MAX(counters.current_guild_raids)
FROM member_raid_counters counters
JOIN guild_snapshots snapshot ON snapshot.id = counters.snapshot_id
WHERE counters.current_guild_raids IS NOT NULL
GROUP BY snapshot.guild_uuid, counters.player_uuid;

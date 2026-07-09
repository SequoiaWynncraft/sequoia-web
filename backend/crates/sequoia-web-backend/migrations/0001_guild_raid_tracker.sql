CREATE TABLE guild_snapshots (
    id BIGSERIAL PRIMARY KEY,
    fetched_at TIMESTAMPTZ NOT NULL,
    guild_uuid UUID NOT NULL,
    guild_name TEXT NOT NULL,
    guild_prefix TEXT NOT NULL,
    payload_hash TEXT NOT NULL UNIQUE,
    raw_payload JSONB NOT NULL
);

CREATE INDEX guild_snapshots_prefix_fetched_at_idx
    ON guild_snapshots (guild_prefix, fetched_at DESC);

CREATE TABLE member_raid_counters (
    id BIGSERIAL PRIMARY KEY,
    snapshot_id BIGINT NOT NULL REFERENCES guild_snapshots (id) ON DELETE CASCADE,
    player_uuid UUID NOT NULL,
    username TEXT NOT NULL,
    rank TEXT NOT NULL,
    online BOOLEAN NOT NULL,
    joined_at TIMESTAMPTZ,
    current_guild_raids BIGINT,
    total_guild_raids BIGINT,
    captured_at TIMESTAMPTZ NOT NULL,
    UNIQUE (snapshot_id, player_uuid)
);

CREATE INDEX member_raid_counters_player_captured_at_idx
    ON member_raid_counters (player_uuid, captured_at DESC);

CREATE TABLE member_raid_deltas (
    id BIGSERIAL PRIMARY KEY,
    from_snapshot_id BIGINT NOT NULL REFERENCES guild_snapshots (id) ON DELETE CASCADE,
    to_snapshot_id BIGINT NOT NULL REFERENCES guild_snapshots (id) ON DELETE CASCADE,
    player_uuid UUID NOT NULL,
    username TEXT NOT NULL,
    rank TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    raid_delta BIGINT NOT NULL CHECK (raid_delta > 0),
    previous_current_guild_raids BIGINT NOT NULL,
    current_guild_raids BIGINT NOT NULL
);

CREATE INDEX member_raid_deltas_observed_at_idx
    ON member_raid_deltas (observed_at DESC);

CREATE INDEX member_raid_deltas_player_observed_at_idx
    ON member_raid_deltas (player_uuid, observed_at DESC);

CREATE TABLE raid_events (
    id UUID PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

CREATE INDEX raid_events_window_idx
    ON raid_events (starts_at, ends_at);

CREATE TABLE tracker_anomalies (
    id BIGSERIAL PRIMARY KEY,
    snapshot_id BIGINT REFERENCES guild_snapshots (id) ON DELETE CASCADE,
    player_uuid UUID,
    username TEXT,
    anomaly_type TEXT NOT NULL,
    details JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tracker_anomalies_created_at_idx
    ON tracker_anomalies (created_at DESC);

CREATE TABLE oauth_users (
    player_uuid UUID PRIMARY KEY,
    username TEXT NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE oauth_states (
    state TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE web_sessions (
    session_id TEXT PRIMARY KEY,
    player_uuid UUID NOT NULL REFERENCES oauth_users (player_uuid) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

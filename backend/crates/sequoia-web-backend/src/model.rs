use serde::Serialize;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct GuildSnapshot {
    pub guild_uuid: Uuid,
    pub guild_name: String,
    pub guild_prefix: String,
    pub fetched_at: OffsetDateTime,
    pub payload_hash: String,
    pub raw_payload: serde_json::Value,
    pub members: Vec<MemberRaidCounter>,
}

#[derive(Clone, Debug, Serialize)]
pub struct MemberRaidCounter {
    pub player_uuid: Uuid,
    pub username: String,
    pub rank: String,
    pub online: bool,
    pub joined_at: Option<OffsetDateTime>,
    pub current_guild_raids: Option<i64>,
    pub total_guild_raids: Option<i64>,
    pub captured_at: OffsetDateTime,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MemberRaidDelta {
    pub player_uuid: Uuid,
    pub username: String,
    pub rank: String,
    pub observed_at: OffsetDateTime,
    pub raid_delta: i64,
    pub previous_current_guild_raids: i64,
    pub current_guild_raids: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct TrackerAnomaly {
    pub player_uuid: Option<Uuid>,
    pub username: Option<String>,
    pub anomaly_type: String,
    pub details: serde_json::Value,
}

#[derive(Clone, Debug, Serialize)]
pub struct RaidEvent {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub starts_at: OffsetDateTime,
    pub ends_at: OffsetDateTime,
}

#[derive(Clone, Debug, Serialize)]
pub struct RaidLeaderboardEntry {
    pub player_uuid: Uuid,
    pub username: String,
    pub raids: i64,
    pub rank: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct SessionUser {
    pub player_uuid: Uuid,
    pub username: String,
}

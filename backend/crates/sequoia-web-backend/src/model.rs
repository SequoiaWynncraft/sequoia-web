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
    #[serde(with = "time::serde::rfc3339::option")]
    pub joined_at: Option<OffsetDateTime>,
    pub current_guild_raids: Option<i64>,
    pub total_guild_raids: Option<i64>,
    #[serde(with = "time::serde::rfc3339")]
    pub captured_at: OffsetDateTime,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MemberRaidDelta {
    pub player_uuid: Uuid,
    pub username: String,
    pub rank: String,
    #[serde(with = "time::serde::rfc3339")]
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
    #[serde(with = "time::serde::rfc3339")]
    pub starts_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
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
pub struct MemberRaidHistoryPoint {
    #[serde(with = "time::serde::rfc3339")]
    pub captured_at: OffsetDateTime,
    pub current_guild_raids: Option<i64>,
    pub total_guild_raids: Option<i64>,
}

#[derive(Clone, Debug, Serialize)]
pub struct SessionUser {
    pub player_uuid: Uuid,
    pub username: String,
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use time::macros::datetime;
    use uuid::Uuid;

    use super::RaidEvent;

    #[test]
    fn raid_event_timestamps_serialize_as_rfc3339_strings() -> anyhow::Result<()> {
        let event = RaidEvent {
            id: Uuid::nil(),
            slug: "test".to_owned(),
            name: "Test".to_owned(),
            starts_at: datetime!(2026-07-09 10:00 UTC),
            ends_at: datetime!(2026-07-09 12:00 UTC),
        };

        let value = serde_json::to_value(event)?;

        assert_eq!(
            value,
            json!({
                "id": "00000000-0000-0000-0000-000000000000",
                "slug": "test",
                "name": "Test",
                "starts_at": "2026-07-09T10:00:00Z",
                "ends_at": "2026-07-09T12:00:00Z",
            })
        );
        Ok(())
    }
}

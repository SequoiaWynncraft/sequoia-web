use std::collections::BTreeMap;

use anyhow::{Context, bail};
use reqwest::StatusCode;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use uuid::Uuid;

use crate::model::{GuildSnapshot, MemberRaidCounter};

#[derive(Clone)]
pub struct WynnClient {
    http: reqwest::Client,
    base_url: String,
    access_token: String,
}

impl WynnClient {
    pub fn new(base_url: String, access_token: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: base_url.trim_end_matches('/').to_owned(),
            access_token,
        }
    }

    pub async fn fetch_guild_snapshot(&self, prefix: &str) -> anyhow::Result<GuildSnapshot> {
        let url = format!("{}/guild/prefix/{}", self.base_url, prefix);
        // Stamped before the request goes out: the payload can only reflect
        // server state from before this instant, so ordering snapshots by a
        // request-start time keeps a stalled older request older than any
        // faster later one - stamping on receipt would let it leapfrog the
        // monotonic admission check.
        let fetched_at = OffsetDateTime::now_utc();
        let response = self
            .http
            .get(url)
            .bearer_auth(&self.access_token)
            .query(&[("identifier", "uuid")])
            .send()
            .await
            .context("failed to request Wynncraft guild snapshot")?;

        let status = response.status();
        if status == StatusCode::TOO_MANY_REQUESTS {
            bail!("Wynncraft guild snapshot request was rate limited");
        }
        if !status.is_success() {
            bail!("Wynncraft guild snapshot request failed with status {status}");
        }

        let raw_payload = response
            .json::<serde_json::Value>()
            .await
            .context("failed to decode Wynncraft guild snapshot JSON")?;
        parse_guild_snapshot(raw_payload, fetched_at)
    }
}

pub fn parse_guild_snapshot(
    raw_payload: serde_json::Value,
    fetched_at: OffsetDateTime,
) -> anyhow::Result<GuildSnapshot> {
    let payload_hash = hash_payload(&raw_payload)?;
    let response: WynnGuildResponse =
        serde_json::from_value(raw_payload.clone()).context("invalid Wynncraft guild payload")?;

    let mut members = Vec::new();
    response
        .members
        .push_members("owner", fetched_at, &mut members);
    response
        .members
        .push_members("chief", fetched_at, &mut members);
    response
        .members
        .push_members("strategist", fetched_at, &mut members);
    response
        .members
        .push_members("captain", fetched_at, &mut members);
    response
        .members
        .push_members("recruiter", fetched_at, &mut members);
    response
        .members
        .push_members("recruit", fetched_at, &mut members);

    Ok(GuildSnapshot {
        guild_uuid: response.uuid,
        guild_name: response.name,
        guild_prefix: response.prefix,
        fetched_at,
        payload_hash,
        raw_payload,
        members,
    })
}

fn hash_payload(raw_payload: &serde_json::Value) -> anyhow::Result<String> {
    let encoded = serde_json::to_vec(raw_payload).context("failed to re-encode payload")?;
    let hash = Sha256::digest(encoded);
    Ok(hex::encode(hash))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WynnGuildResponse {
    uuid: Uuid,
    name: String,
    prefix: String,
    members: WynnMembers,
}

#[derive(Deserialize)]
struct WynnMembers {
    #[serde(default)]
    owner: MemberMap,
    #[serde(default)]
    chief: MemberMap,
    #[serde(default)]
    strategist: MemberMap,
    #[serde(default)]
    captain: MemberMap,
    #[serde(default)]
    recruiter: MemberMap,
    #[serde(default)]
    recruit: MemberMap,
}

type MemberMap = BTreeMap<Uuid, WynnMember>;

impl WynnMembers {
    fn push_members(
        &self,
        rank: &str,
        captured_at: OffsetDateTime,
        members: &mut Vec<MemberRaidCounter>,
    ) {
        let rank_members = match rank {
            "owner" => &self.owner,
            "chief" => &self.chief,
            "strategist" => &self.strategist,
            "captain" => &self.captain,
            "recruiter" => &self.recruiter,
            "recruit" => &self.recruit,
            _ => return,
        };

        members.extend(rank_members.iter().map(|(player_uuid, member)| {
            MemberRaidCounter {
                player_uuid: *player_uuid,
                username: member.username.clone(),
                rank: rank.to_owned(),
                online: member.online,
                joined_at: member.joined.as_deref().and_then(parse_rfc3339),
                current_guild_raids: member
                    .global_data
                    .as_ref()
                    .and_then(|data| data.current_guild_raids.as_ref())
                    .map(|raids| raids.total),
                total_guild_raids: member
                    .global_data
                    .as_ref()
                    .and_then(|data| data.guild_raids.as_ref())
                    .map(|raids| raids.total),
                captured_at,
            }
        }));
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WynnMember {
    username: String,
    #[serde(default)]
    online: bool,
    joined: Option<String>,
    global_data: Option<WynnGlobalData>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WynnGlobalData {
    current_guild_raids: Option<RaidTotals>,
    guild_raids: Option<RaidTotals>,
}

#[derive(Deserialize)]
struct RaidTotals {
    total: i64,
}

fn parse_rfc3339(value: &str) -> Option<OffsetDateTime> {
    OffsetDateTime::parse(value, &Rfc3339).ok()
}

#[cfg(test)]
mod tests {
    use anyhow::Context;
    use serde_json::json;
    use time::macros::datetime;

    use super::parse_guild_snapshot;

    #[test]
    fn parses_current_guild_raid_totals_from_rank_maps() -> anyhow::Result<()> {
        let snapshot = parse_guild_snapshot(
            json!({
                "uuid": "0f2f6f50-4a56-4ebd-aef7-a22a4cf8fd53",
                "name": "Sequoia",
                "prefix": "SEQ",
                "members": {
                    "total": 1,
                    "chief": {
                        "070af99c-cd21-4923-92e4-8809b3d99f0d": {
                            "username": "OwORawr",
                            "online": false,
                            "joined": "2025-08-08T22:29:03.502000Z",
                            "globalData": {
                                "guildRaids": { "total": 7000, "list": {} },
                                "currentGuildRaids": { "total": 6760, "list": {} }
                            }
                        }
                    }
                }
            }),
            datetime!(2026-07-09 10:00 UTC),
        )?;

        let member = snapshot
            .members
            .first()
            .context("expected parsed guild member")?;
        assert_eq!(member.username, "OwORawr");
        assert_eq!(member.rank, "chief");
        assert_eq!(member.current_guild_raids, Some(6760));
        assert_eq!(member.total_guild_raids, Some(7000));
        Ok(())
    }
}

use std::collections::BTreeMap;

use serde_json::json;
use uuid::Uuid;

use crate::model::{MemberRaidCounter, MemberRaidDelta, TrackerAnomaly};

#[derive(Debug, Default, PartialEq, Eq)]
pub struct DeltaReport {
    pub deltas: Vec<MemberRaidDelta>,
    pub anomalies: Vec<TrackerAnomaly>,
}

pub fn calculate_deltas(
    previous: &[MemberRaidCounter],
    current: &[MemberRaidCounter],
) -> DeltaReport {
    let previous_by_uuid = previous
        .iter()
        .map(|member| (member.player_uuid, member))
        .collect::<BTreeMap<Uuid, &MemberRaidCounter>>();

    let mut report = DeltaReport::default();
    for current_member in current {
        let Some(previous_member) = previous_by_uuid.get(&current_member.player_uuid) else {
            continue;
        };

        match (
            previous_member.current_guild_raids,
            current_member.current_guild_raids,
        ) {
            (Some(previous_raids), Some(current_raids)) if current_raids > previous_raids => {
                report.deltas.push(MemberRaidDelta {
                    player_uuid: current_member.player_uuid,
                    username: current_member.username.clone(),
                    rank: current_member.rank.clone(),
                    observed_at: current_member.captured_at,
                    raid_delta: current_raids - previous_raids,
                    previous_current_guild_raids: previous_raids,
                    current_guild_raids: current_raids,
                });
            }
            (Some(previous_raids), Some(current_raids)) if current_raids < previous_raids => {
                report.anomalies.push(TrackerAnomaly {
                    player_uuid: Some(current_member.player_uuid),
                    username: Some(current_member.username.clone()),
                    anomaly_type: "counter_decreased".to_owned(),
                    details: json!({
                        "previous_current_guild_raids": previous_raids,
                        "current_guild_raids": current_raids,
                    }),
                });
            }
            (Some(previous_raids), None) => {
                report.anomalies.push(TrackerAnomaly {
                    player_uuid: Some(current_member.player_uuid),
                    username: Some(current_member.username.clone()),
                    anomaly_type: "counter_missing".to_owned(),
                    details: json!({
                        "previous_current_guild_raids": previous_raids,
                    }),
                });
            }
            _ => {}
        }
    }

    report
}

#[cfg(test)]
mod tests {
    use time::macros::datetime;
    use uuid::Uuid;

    use super::calculate_deltas;
    use crate::model::MemberRaidCounter;

    #[test]
    fn positive_counter_changes_create_deltas() -> anyhow::Result<()> {
        let player_uuid = Uuid::parse_str("070af99c-cd21-4923-92e4-8809b3d99f0d")?;
        let previous = vec![counter(player_uuid, Some(10))];
        let current = vec![counter(player_uuid, Some(13))];

        let report = calculate_deltas(&previous, &current);

        assert_eq!(report.deltas.len(), 1);
        assert_eq!(report.deltas[0].raid_delta, 3);
        assert!(report.anomalies.is_empty());
        Ok(())
    }

    #[test]
    fn missing_current_counter_is_not_zero() -> anyhow::Result<()> {
        let player_uuid = Uuid::parse_str("070af99c-cd21-4923-92e4-8809b3d99f0d")?;
        let previous = vec![counter(player_uuid, Some(10))];
        let current = vec![counter(player_uuid, None)];

        let report = calculate_deltas(&previous, &current);

        assert!(report.deltas.is_empty());
        assert_eq!(report.anomalies.len(), 1);
        assert_eq!(report.anomalies[0].anomaly_type, "counter_missing");
        Ok(())
    }

    #[test]
    fn negative_counter_changes_are_anomalies() -> anyhow::Result<()> {
        let player_uuid = Uuid::parse_str("070af99c-cd21-4923-92e4-8809b3d99f0d")?;
        let previous = vec![counter(player_uuid, Some(13))];
        let current = vec![counter(player_uuid, Some(10))];

        let report = calculate_deltas(&previous, &current);

        assert!(report.deltas.is_empty());
        assert_eq!(report.anomalies.len(), 1);
        assert_eq!(report.anomalies[0].anomaly_type, "counter_decreased");
        Ok(())
    }

    fn counter(player_uuid: Uuid, current_guild_raids: Option<i64>) -> MemberRaidCounter {
        MemberRaidCounter {
            player_uuid,
            username: "OwORawr".to_owned(),
            rank: "chief".to_owned(),
            online: false,
            joined_at: None,
            current_guild_raids,
            total_guild_raids: current_guild_raids,
            captured_at: datetime!(2026-07-09 10:00 UTC),
        }
    }
}

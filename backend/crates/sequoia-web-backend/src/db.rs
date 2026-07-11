use anyhow::Context;
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    deltas::calculate_deltas,
    model::{
        GuildSnapshot, MemberRaidCounter, MemberRaidHistoryPoint, RaidEvent, RaidLeaderboardEntry,
    },
};

#[derive(Clone)]
pub struct Database {
    pool: PgPool,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct IngestSummary {
    pub inserted: bool,
    pub snapshot_id: Option<i64>,
    pub member_count: usize,
    pub delta_count: usize,
    pub anomaly_count: usize,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct StoredAnomaly {
    pub id: i64,
    pub snapshot_id: Option<i64>,
    pub player_uuid: Option<Uuid>,
    pub username: Option<String>,
    pub anomaly_type: String,
    pub details: serde_json::Value,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
}

impl Database {
    pub async fn connect(database_url: &str) -> anyhow::Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await
            .context("failed to connect to tracker database")?;

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .context("failed to run tracker migrations")?;

        Ok(Self { pool })
    }

    pub async fn ingest_snapshot(&self, snapshot: GuildSnapshot) -> anyhow::Result<IngestSummary> {
        let mut tx = self.pool.begin().await.context("failed to begin ingest")?;
        sqlx::query("SELECT pg_advisory_xact_lock(1845692265, hashtext($1))")
            .bind(&snapshot.guild_prefix)
            .execute(&mut *tx)
            .await
            .context("failed to acquire guild ingest lock")?;

        let previous_snapshot_id = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT id
            FROM guild_snapshots
            WHERE guild_prefix = $1
            ORDER BY id DESC
            LIMIT 1
            "#,
        )
        .bind(&snapshot.guild_prefix)
        .fetch_optional(&mut *tx)
        .await
        .context("failed to load previous snapshot id")?;

        let snapshot_row = sqlx::query(
            r#"
            INSERT INTO guild_snapshots (
                fetched_at,
                guild_uuid,
                guild_name,
                guild_prefix,
                payload_hash,
                raw_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (payload_hash) DO NOTHING
            RETURNING id
            "#,
        )
        .bind(snapshot.fetched_at)
        .bind(snapshot.guild_uuid)
        .bind(&snapshot.guild_name)
        .bind(&snapshot.guild_prefix)
        .bind(&snapshot.payload_hash)
        .bind(&snapshot.raw_payload)
        .fetch_optional(&mut *tx)
        .await
        .context("failed to insert guild snapshot")?;

        let Some(snapshot_row) = snapshot_row else {
            tx.commit()
                .await
                .context("failed to commit duplicate snapshot ingest")?;
            return Ok(IngestSummary {
                inserted: false,
                snapshot_id: None,
                member_count: snapshot.members.len(),
                delta_count: 0,
                anomaly_count: 0,
            });
        };

        let snapshot_id = snapshot_row
            .try_get::<i64, _>("id")
            .context("snapshot id missing")?;

        for member in &snapshot.members {
            sqlx::query(
                r#"
                INSERT INTO member_raid_counters (
                    snapshot_id,
                    player_uuid,
                    username,
                    rank,
                    online,
                    joined_at,
                    current_guild_raids,
                    total_guild_raids,
                    captured_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                "#,
            )
            .bind(snapshot_id)
            .bind(member.player_uuid)
            .bind(&member.username)
            .bind(&member.rank)
            .bind(member.online)
            .bind(member.joined_at)
            .bind(member.current_guild_raids)
            .bind(member.total_guild_raids)
            .bind(member.captured_at)
            .execute(&mut *tx)
            .await
            .context("failed to insert member raid counter")?;
        }

        let Some(previous_snapshot_id) = previous_snapshot_id else {
            tx.commit()
                .await
                .context("failed to commit baseline snapshot ingest")?;
            return Ok(IngestSummary {
                inserted: true,
                snapshot_id: Some(snapshot_id),
                member_count: snapshot.members.len(),
                delta_count: 0,
                anomaly_count: 0,
            });
        };

        let previous_members = member_counters_in_tx(&mut tx, previous_snapshot_id).await?;
        let report = calculate_deltas(&previous_members, &snapshot.members);
        for delta in &report.deltas {
            sqlx::query(
                r#"
                INSERT INTO member_raid_deltas (
                    from_snapshot_id,
                    to_snapshot_id,
                    player_uuid,
                    username,
                    rank,
                    observed_at,
                    raid_delta,
                    previous_current_guild_raids,
                    current_guild_raids
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                "#,
            )
            .bind(previous_snapshot_id)
            .bind(snapshot_id)
            .bind(delta.player_uuid)
            .bind(&delta.username)
            .bind(&delta.rank)
            .bind(delta.observed_at)
            .bind(delta.raid_delta)
            .bind(delta.previous_current_guild_raids)
            .bind(delta.current_guild_raids)
            .execute(&mut *tx)
            .await
            .context("failed to insert member raid delta")?;
        }

        for anomaly in &report.anomalies {
            sqlx::query(
                r#"
                INSERT INTO tracker_anomalies (
                    snapshot_id,
                    player_uuid,
                    username,
                    anomaly_type,
                    details
                )
                VALUES ($1, $2, $3, $4, $5)
                "#,
            )
            .bind(snapshot_id)
            .bind(anomaly.player_uuid)
            .bind(&anomaly.username)
            .bind(&anomaly.anomaly_type)
            .bind(&anomaly.details)
            .execute(&mut *tx)
            .await
            .context("failed to insert tracker anomaly")?;
        }

        tx.commit()
            .await
            .context("failed to commit snapshot ingest")?;

        Ok(IngestSummary {
            inserted: true,
            snapshot_id: Some(snapshot_id),
            member_count: snapshot.members.len(),
            delta_count: report.deltas.len(),
            anomaly_count: report.anomalies.len(),
        })
    }

    pub async fn list_raid_events(&self) -> anyhow::Result<Vec<RaidEvent>> {
        let rows = sqlx::query(
            r#"
            SELECT id, slug, name, starts_at, ends_at, tracking
            FROM raid_events
            ORDER BY starts_at DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .context("failed to list raid events")?;

        rows.into_iter().map(row_to_raid_event).collect()
    }

    pub async fn raid_event(&self, event_id: Uuid) -> anyhow::Result<Option<RaidEvent>> {
        let row = sqlx::query(
            r#"
            SELECT id, slug, name, starts_at, ends_at, tracking
            FROM raid_events
            WHERE id = $1
            "#,
        )
        .bind(event_id)
        .fetch_optional(&self.pool)
        .await
        .context("failed to load raid event")?;

        row.map(row_to_raid_event).transpose()
    }

    pub async fn create_raid_event(
        &self,
        slug: &str,
        name: &str,
        starts_at: OffsetDateTime,
        ends_at: OffsetDateTime,
        tracking: &str,
    ) -> anyhow::Result<RaidEvent> {
        let id = Uuid::new_v4();
        let row = sqlx::query(
            r#"
            INSERT INTO raid_events (id, slug, name, starts_at, ends_at, tracking)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, slug, name, starts_at, ends_at, tracking
            "#,
        )
        .bind(id)
        .bind(slug)
        .bind(name)
        .bind(starts_at)
        .bind(ends_at)
        .bind(tracking)
        .fetch_one(&self.pool)
        .await
        .context("failed to create raid event")?;

        row_to_raid_event(row)
    }

    pub async fn raid_event_leaderboard(
        &self,
        event_id: Uuid,
    ) -> anyhow::Result<Vec<RaidLeaderboardEntry>> {
        let rows = sqlx::query(
            r#"
            SELECT
                d.player_uuid,
                COALESCE(
                    (
                        SELECT latest.username
                        FROM member_raid_counters latest
                        WHERE latest.player_uuid = d.player_uuid
                        ORDER BY latest.captured_at DESC
                        LIMIT 1
                    ),
                    max(d.username)
                ) AS username,
                COALESCE(
                    (
                        SELECT latest.rank
                        FROM member_raid_counters latest
                        WHERE latest.player_uuid = d.player_uuid
                        ORDER BY latest.captured_at DESC
                        LIMIT 1
                    ),
                    max(d.rank)
                ) AS rank,
                sum(d.raid_delta)::BIGINT AS raids
            FROM member_raid_deltas d
            JOIN raid_events e
                ON e.id = $1
                AND d.observed_at >= e.starts_at
                AND d.observed_at <= e.ends_at
            GROUP BY d.player_uuid
            ORDER BY raids DESC, username ASC
            "#,
        )
        .bind(event_id)
        .fetch_all(&self.pool)
        .await
        .context("failed to load raid event leaderboard")?;

        rows.into_iter()
            .map(|row| {
                Ok(RaidLeaderboardEntry {
                    player_uuid: row.try_get("player_uuid")?,
                    username: row.try_get("username")?,
                    rank: row.try_get("rank")?,
                    raids: row.try_get("raids")?,
                })
            })
            .collect()
    }

    pub async fn member_raid_history(
        &self,
        player_uuid: Uuid,
    ) -> anyhow::Result<Vec<MemberRaidHistoryPoint>> {
        let rows = sqlx::query(
            r#"
            SELECT captured_at, current_guild_raids, total_guild_raids
            FROM member_raid_counters
            WHERE player_uuid = $1
            ORDER BY captured_at ASC
            "#,
        )
        .bind(player_uuid)
        .fetch_all(&self.pool)
        .await
        .context("failed to load member raid history")?;

        rows.into_iter()
            .map(|row| {
                Ok(MemberRaidHistoryPoint {
                    captured_at: row.try_get("captured_at")?,
                    current_guild_raids: row.try_get("current_guild_raids")?,
                    total_guild_raids: row.try_get("total_guild_raids")?,
                })
            })
            .collect()
    }

    pub async fn list_anomalies(&self, limit: i64) -> anyhow::Result<Vec<StoredAnomaly>> {
        let rows = sqlx::query(
            r#"
            SELECT id, snapshot_id, player_uuid, username, anomaly_type, details, created_at
            FROM tracker_anomalies
            ORDER BY created_at DESC
            LIMIT $1
            "#,
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .context("failed to list tracker anomalies")?;

        rows.into_iter()
            .map(|row| {
                Ok(StoredAnomaly {
                    id: row.try_get("id")?,
                    snapshot_id: row.try_get("snapshot_id")?,
                    player_uuid: row.try_get("player_uuid")?,
                    username: row.try_get("username")?,
                    anomaly_type: row.try_get("anomaly_type")?,
                    details: row.try_get("details")?,
                    created_at: row.try_get("created_at")?,
                })
            })
            .collect()
    }
}

/// Loads a snapshot's counters with dropout healing: the Wynncraft API sometimes
/// reports a member's `currentGuildRaids` as 0, a stale lower value, or omits it
/// for a few polls before restoring the real total. Diffing against the dip would
/// book the restored amount as new raids, so each counter is raised to the highest
/// value observed up to that snapshot within the same guild - `currentGuildRaids`
/// only counts raids with the current guild, and it never legitimately decreases
/// there, which makes that the true baseline.
async fn member_counters_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    snapshot_id: i64,
) -> anyhow::Result<Vec<MemberRaidCounter>> {
    let rows = sqlx::query(
        r#"
        SELECT
            counters.player_uuid,
            counters.username,
            counters.rank,
            counters.online,
            counters.joined_at,
            GREATEST(counters.current_guild_raids, highest_prior.current_guild_raids)
                AS current_guild_raids,
            counters.total_guild_raids,
            counters.captured_at
        FROM member_raid_counters counters
        JOIN guild_snapshots snapshot ON snapshot.id = counters.snapshot_id
        LEFT JOIN LATERAL (
            SELECT MAX(history.current_guild_raids) AS current_guild_raids
            FROM member_raid_counters history
            JOIN guild_snapshots history_snapshot ON history_snapshot.id = history.snapshot_id
            WHERE history.player_uuid = counters.player_uuid
              AND history.captured_at <= counters.captured_at
              AND history_snapshot.guild_uuid = snapshot.guild_uuid
        ) highest_prior ON true
        WHERE counters.snapshot_id = $1
        "#,
    )
    .bind(snapshot_id)
    .fetch_all(&mut **tx)
    .await
    .context("failed to load member raid counters")?;

    rows.into_iter()
        .map(|row| {
            Ok(MemberRaidCounter {
                player_uuid: row.try_get("player_uuid")?,
                username: row.try_get("username")?,
                rank: row.try_get("rank")?,
                online: row.try_get("online")?,
                joined_at: row.try_get("joined_at")?,
                current_guild_raids: row.try_get("current_guild_raids")?,
                total_guild_raids: row.try_get("total_guild_raids")?,
                captured_at: row.try_get("captured_at")?,
            })
        })
        .collect()
}

fn row_to_raid_event(row: sqlx::postgres::PgRow) -> anyhow::Result<RaidEvent> {
    Ok(RaidEvent {
        id: row.try_get("id")?,
        slug: row.try_get("slug")?,
        name: row.try_get("name")?,
        starts_at: row.try_get("starts_at")?,
        ends_at: row.try_get("ends_at")?,
        tracking: row.try_get("tracking")?,
    })
}

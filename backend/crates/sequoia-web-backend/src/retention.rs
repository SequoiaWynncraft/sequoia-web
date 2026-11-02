//! Retention for tracker history; the policy is documented in docs/raid-tracking.md.
//!
//! New rows never store presence, and store raw upstream payloads only in an
//! optional diagnostic tier. Historical pruning is explicit: nothing is deleted
//! unless `TRACKER_RETENTION=apply` or the `retention --apply` command asks.

use std::{sync::Arc, time::Duration};

use anyhow::{Context, bail};
use time::OffsetDateTime;

use crate::db::{Database, INGEST_LOCK_CLASS};

/// Whether the scheduled retention pass runs, and whether it changes anything.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RetentionMode {
    /// No scheduled pass. The default, so a deploy never prunes history by itself.
    Off,
    /// Runs daily and logs what it would remove, then rolls back.
    DryRun,
    /// Runs daily and applies the policy.
    Apply,
}

/// How long each kind of history is kept in full.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RetentionPolicy {
    /// Days a raw upstream payload is kept. 0 means raw payloads are not stored.
    pub raw_payload_days: u16,
    /// Counter samples older than this many days are thinned to at most 3 per
    /// member, guild and UTC day: the day's first and last sample and the one
    /// with the most guild raids (the dropout high-water mark). Runs of
    /// identical samples then keep only their ends.
    pub counter_compaction_days: u16,
    /// Days a tracker anomaly is kept.
    pub anomaly_days: u16,
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        Self {
            raw_payload_days: 0,
            counter_compaction_days: 7,
            anomaly_days: 90,
        }
    }
}

impl RetentionPolicy {
    /// Reads `TRACKER_RAW_PAYLOAD_DAYS`, `TRACKER_COUNTER_COMPACTION_DAYS` and
    /// `TRACKER_ANOMALY_DAYS`, falling back to [`RetentionPolicy::default`].
    ///
    /// # Errors
    ///
    /// Returns an error when a value is not an integer in its allowed range.
    pub fn from_env() -> anyhow::Result<Self> {
        let defaults = Self::default();
        Ok(Self {
            raw_payload_days: days_from_env(
                "TRACKER_RAW_PAYLOAD_DAYS",
                defaults.raw_payload_days,
                0..=30,
            )?,
            counter_compaction_days: days_from_env(
                "TRACKER_COUNTER_COMPACTION_DAYS",
                defaults.counter_compaction_days,
                1..=3650,
            )?,
            anomaly_days: days_from_env("TRACKER_ANOMALY_DAYS", defaults.anomaly_days, 1..=3650)?,
        })
    }

    /// Whether new snapshots keep their raw upstream payload.
    pub fn stores_raw_payloads(&self) -> bool {
        self.raw_payload_days > 0
    }

    /// The instants before which each kind of history is pruned.
    pub fn cutoffs(&self, now: OffsetDateTime) -> RetentionCutoffs {
        let days = |count: u16| now - time::Duration::days(i64::from(count));
        RetentionCutoffs {
            raw_payloads: days(self.raw_payload_days),
            counter_compaction: days(self.counter_compaction_days),
            anomalies: days(self.anomaly_days),
        }
    }
}

/// Absolute cutoffs derived from a [`RetentionPolicy`] at one instant.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RetentionCutoffs {
    pub raw_payloads: OffsetDateTime,
    pub counter_compaction: OffsetDateTime,
    pub anomalies: OffsetDateTime,
}

/// What one retention pass removed, or would remove in a dry run.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize)]
pub struct RetentionReport {
    pub applied: bool,
    pub raw_payloads_cleared: u64,
    pub presence_cleared: u64,
    pub daily_excess_counters_deleted: u64,
    pub redundant_counters_deleted: u64,
    pub anomalies_deleted: u64,
    pub orphan_snapshots_deleted: u64,
}

impl RetentionMode {
    /// Reads `TRACKER_RETENTION` (`off`, `dry-run` or `apply`; default `off`).
    ///
    /// # Errors
    ///
    /// Returns an error for any other value.
    pub fn from_env() -> anyhow::Result<Self> {
        match std::env::var("TRACKER_RETENTION").as_deref().map(str::trim) {
            Err(_) | Ok("") | Ok("off") => Ok(Self::Off),
            Ok("dry-run") => Ok(Self::DryRun),
            Ok("apply") => Ok(Self::Apply),
            Ok(other) => bail!("TRACKER_RETENTION must be off, dry-run or apply, not {other:?}"),
        }
    }
}

/// First pass after startup, so it never competes with the initial poll.
const FIRST_PASS_DELAY: Duration = Duration::from_secs(10 * 60);
const PASS_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

/// Runs the policy daily in the background when `mode` is not [`RetentionMode::Off`].
pub fn spawn_retention_loop(db: Arc<Database>, policy: RetentionPolicy, mode: RetentionMode) {
    let apply = match mode {
        RetentionMode::Off => return,
        RetentionMode::DryRun => false,
        RetentionMode::Apply => true,
    };
    tokio::spawn(async move {
        tokio::time::sleep(FIRST_PASS_DELAY).await;
        loop {
            match db
                .enforce_retention(&policy, OffsetDateTime::now_utc(), apply)
                .await
            {
                Ok(report) => tracing::info!(?report, "tracker retention pass completed"),
                Err(error) => tracing::warn!(%error, "tracker retention pass failed"),
            }
            tokio::time::sleep(PASS_INTERVAL).await;
        }
    });
}

fn days_from_env(
    name: &str,
    default: u16,
    allowed: std::ops::RangeInclusive<u16>,
) -> anyhow::Result<u16> {
    let Ok(raw) = std::env::var(name) else {
        return Ok(default);
    };
    let days = raw
        .trim()
        .parse::<u16>()
        .with_context(|| format!("{name} must be a whole number of days"))?;
    if !allowed.contains(&days) {
        bail!(
            "{name} must be between {} and {} days",
            allowed.start(),
            allowed.end()
        );
    }
    Ok(days)
}

/// Serializes retention passes, e.g. the daily loop and the CLI.
const RETENTION_LOCK_CLASS: i32 = 1845692266;

impl Database {
    /// Applies `policy` as of `now` in one transaction, or reports what it
    /// would change and rolls back when `apply` is false.
    ///
    /// Finalized results are never touched: deltas are never deleted, and a
    /// snapshot is deleted only when no delta, counter or anomaly refers to
    /// it and its raw payload, if any, has expired. Each guild's latest snapshot keeps all its counters, and every day
    /// keeps its highest counter, so the next ingest's baseline and its
    /// dropout high-water mark stay the same.
    ///
    /// # Errors
    ///
    /// Returns an error when a statement fails; the transaction is then
    /// rolled back and nothing changes.
    pub async fn enforce_retention(
        &self,
        policy: &RetentionPolicy,
        now: OffsetDateTime,
        apply: bool,
    ) -> anyhow::Result<RetentionReport> {
        let cutoffs = policy.cutoffs(now);
        let mut tx = self
            .pool()
            .begin()
            .await
            .context("failed to begin retention")?;

        sqlx::query("SELECT pg_advisory_xact_lock($1, 0)")
            .bind(RETENTION_LOCK_CLASS)
            .execute(&mut *tx)
            .await
            .context("failed to acquire retention lock")?;
        let prefixes: Vec<String> =
            sqlx::query_scalar("SELECT DISTINCT guild_prefix FROM guild_snapshots ORDER BY 1")
                .fetch_all(&mut *tx)
                .await
                .context("failed to list tracked guilds")?;
        for prefix in &prefixes {
            sqlx::query("SELECT pg_advisory_xact_lock($1, hashtext($2))")
                .bind(INGEST_LOCK_CLASS)
                .bind(prefix)
                .execute(&mut *tx)
                .await
                .context("failed to acquire guild ingest lock")?;
        }

        let raw_payloads_cleared = sqlx::query(
            "UPDATE guild_snapshots SET raw_payload = NULL WHERE raw_payload IS NOT NULL AND fetched_at < $1",
        )
        .bind(cutoffs.raw_payloads)
        .execute(&mut *tx)
        .await
        .context("failed to clear raw payloads")?
        .rows_affected();

        // Presence is no longer collected, so none of it is kept.
        let presence_cleared = sqlx::query(
            r#"
            UPDATE member_raid_counters
            SET online = NULL, joined_at = NULL
            WHERE online IS NOT NULL OR joined_at IS NOT NULL
            "#,
        )
        .execute(&mut *tx)
        .await
        .context("failed to clear member presence")?
        .rows_affected();

        let anomalies_deleted = sqlx::query("DELETE FROM tracker_anomalies WHERE created_at < $1")
            .bind(cutoffs.anomalies)
            .execute(&mut *tx)
            .await
            .context("failed to delete expired anomalies")?
            .rows_affected();

        // Series are per guild, matching the ingest's healing. A day's last
        // sample is also the last of its series once the day is past, so a
        // guild's latest snapshot keeps its counters.
        let daily_excess_counters_deleted = sqlx::query(
            r#"
            WITH ranked AS (
                SELECT
                    counters.id,
                    ROW_NUMBER() OVER (member_day ORDER BY counters.captured_at, counters.id)
                        AS from_start,
                    ROW_NUMBER() OVER (member_day ORDER BY counters.captured_at DESC, counters.id DESC)
                        AS from_end,
                    ROW_NUMBER() OVER (
                        member_day
                        ORDER BY counters.current_guild_raids DESC NULLS LAST,
                                 counters.captured_at, counters.id
                    ) AS by_raids
                FROM member_raid_counters counters
                JOIN guild_snapshots snapshot ON snapshot.id = counters.snapshot_id
                WHERE counters.captured_at < $1
                WINDOW member_day AS (
                    PARTITION BY snapshot.guild_uuid, counters.player_uuid,
                        date_trunc('day', counters.captured_at AT TIME ZONE 'UTC')
                )
            )
            DELETE FROM member_raid_counters counters
            USING ranked
            WHERE counters.id = ranked.id
              AND ranked.from_start > 1
              AND ranked.from_end > 1
              AND ranked.by_raids > 1
            "#,
        )
        .bind(cutoffs.counter_compaction)
        .execute(&mut *tx)
        .await
        .context("failed to thin historical member raid counters")?
        .rows_affected();

        // Of what remains, a sample equal to both neighbours in its member's series is
        // redundant: history still shows the same steps, and the first sample
        // of every run, which carries its value into the high-water mark, stays.
        let redundant_counters_deleted = sqlx::query(
            r#"
            WITH series AS (
                SELECT
                    counters.id,
                    ROW(counters.current_guild_raids, counters.total_guild_raids,
                        counters.username, counters.rank) AS sample,
                    LAG(counters.id) OVER member_series AS previous_id,
                    LAG(ROW(counters.current_guild_raids, counters.total_guild_raids,
                            counters.username, counters.rank)) OVER member_series AS previous_sample,
                    LEAD(counters.id) OVER member_series AS next_id,
                    LEAD(ROW(counters.current_guild_raids, counters.total_guild_raids,
                             counters.username, counters.rank)) OVER member_series AS next_sample
                FROM member_raid_counters counters
                JOIN guild_snapshots snapshot ON snapshot.id = counters.snapshot_id
                WHERE counters.captured_at < $1
                WINDOW member_series AS (
                    PARTITION BY snapshot.guild_uuid, counters.player_uuid
                    ORDER BY counters.captured_at, counters.id
                )
            )
            DELETE FROM member_raid_counters counters
            USING series
            WHERE counters.id = series.id
              AND series.previous_id IS NOT NULL
              AND series.next_id IS NOT NULL
              AND series.sample IS NOT DISTINCT FROM series.previous_sample
              AND series.sample IS NOT DISTINCT FROM series.next_sample
            "#,
        )
        .bind(cutoffs.counter_compaction)
        .execute(&mut *tx)
        .await
        .context("failed to compact member raid counters")?
        .rows_affected();

        let orphan_snapshots_deleted = sqlx::query(
            r#"
            DELETE FROM guild_snapshots snapshot
            WHERE snapshot.fetched_at < $1
              AND snapshot.id <> (
                  SELECT newest.id FROM guild_snapshots newest
                  WHERE newest.guild_prefix = snapshot.guild_prefix
                  ORDER BY newest.fetched_at DESC, newest.id DESC
                  LIMIT 1
              )
              AND NOT EXISTS (SELECT 1 FROM member_raid_counters c WHERE c.snapshot_id = snapshot.id)
              AND NOT EXISTS (SELECT 1 FROM member_raid_deltas d WHERE d.from_snapshot_id = snapshot.id)
              AND NOT EXISTS (SELECT 1 FROM member_raid_deltas d WHERE d.to_snapshot_id = snapshot.id)
              AND NOT EXISTS (SELECT 1 FROM tracker_anomalies a WHERE a.snapshot_id = snapshot.id)
              -- Expired raw payloads were cleared above; what is left is still in its window.
              AND snapshot.raw_payload IS NULL
            "#,
        )
        .bind(cutoffs.counter_compaction)
        .execute(&mut *tx)
        .await
        .context("failed to delete unreferenced snapshots")?
        .rows_affected();

        let report = RetentionReport {
            applied: apply,
            raw_payloads_cleared,
            presence_cleared,
            daily_excess_counters_deleted,
            redundant_counters_deleted,
            anomalies_deleted,
            orphan_snapshots_deleted,
        };
        if apply {
            tx.commit().await.context("failed to commit retention")?;
        } else {
            tx.rollback()
                .await
                .context("failed to roll back retention dry run")?;
        }
        Ok(report)
    }
}

/// These run against a real PostgreSQL server named by `TEST_DATABASE_URL`,
/// each in a database of its own: `cargo test -- --include-ignored`.
#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use anyhow::Context;
    use serde_json::json;
    use sqlx::{Connection, Executor, PgConnection, Row, postgres::PgConnectOptions};
    use time::{Duration, OffsetDateTime};
    use uuid::Uuid;

    use super::{RetentionPolicy, RetentionReport};
    use crate::{
        db::Database,
        model::{GuildSnapshot, MemberRaidCounter, MemberRaidHistoryPoint, RaidLeaderboardEntry},
        poller::{PollerHealth, RaidTracker},
        wynn::WynnClient,
    };

    const GUILD: Uuid = Uuid::from_u128(0x0f2f_6f50_4a56_4ebd_aef7_a22a_4cf8_fd53);
    const ALICE: Uuid = Uuid::from_u128(0x070a_f99c_cd21_4923_92e4_8809_b3d9_9f0d);
    const BOB: Uuid = Uuid::from_u128(0x1b0b_0000_0000_4000_8000_0000_0000_0b0b);

    struct TestDatabase {
        admin: PgConnectOptions,
        name: String,
        db: Database,
    }

    impl TestDatabase {
        async fn create() -> anyhow::Result<Self> {
            let url = std::env::var("TEST_DATABASE_URL")
                .context("TEST_DATABASE_URL must name a disposable PostgreSQL server")?;
            let admin = url.parse::<PgConnectOptions>()?;
            let name = format!("retention_test_{}", Uuid::new_v4().simple());
            let mut connection = PgConnection::connect_with(&admin).await?;
            connection
                .execute(format!(r#"CREATE DATABASE "{name}""#).as_str())
                .await?;
            connection.close().await?;
            let db = Database::connect_with(admin.clone().database(&name)).await?;
            Ok(Self { admin, name, db })
        }

        /// A new pool on the same database, as after a restart.
        async fn restart(self) -> anyhow::Result<Self> {
            self.db.pool().close().await;
            let db = Database::connect_with(self.admin.clone().database(&self.name)).await?;
            Ok(Self { db, ..self })
        }

        async fn remove(self) -> anyhow::Result<()> {
            self.db.pool().close().await;
            let mut connection = PgConnection::connect_with(&self.admin).await?;
            connection
                .execute(format!(r#"DROP DATABASE "{}" WITH (FORCE)"#, self.name).as_str())
                .await?;
            connection.close().await?;
            Ok(())
        }
    }

    fn snapshot(fetched_at: OffsetDateTime, members: &[(Uuid, Option<i64>)]) -> GuildSnapshot {
        GuildSnapshot {
            guild_uuid: GUILD,
            guild_name: "Sequoia".to_owned(),
            guild_prefix: "SEQ".to_owned(),
            fetched_at,
            payload_hash: Uuid::new_v4().to_string(),
            raw_payload: Some(json!({ "legacy": true })),
            members: members
                .iter()
                .map(|&(player_uuid, current_guild_raids)| MemberRaidCounter {
                    player_uuid,
                    username: if player_uuid == ALICE { "Alice" } else { "Bob" }.to_owned(),
                    rank: "captain".to_owned(),
                    current_guild_raids,
                    total_guild_raids: current_guild_raids.map(|raids| raids + 1000),
                    captured_at: fetched_at,
                })
                .collect(),
        }
    }

    /// Ingests a series of daily snapshots the way the poller would have,
    /// then backdates what the old schema kept: presence and anomaly times.
    async fn ingest_history(
        db: &Database,
        polls: &[(OffsetDateTime, Option<i64>, Option<i64>)],
    ) -> anyhow::Result<()> {
        for &(fetched_at, alice, bob) in polls {
            db.ingest_snapshot(snapshot(fetched_at, &[(ALICE, alice), (BOB, bob)]))
                .await?;
        }
        sqlx::query(
            r#"
            UPDATE member_raid_counters
            SET online = true, joined_at = captured_at - interval '1 year'
            "#,
        )
        .execute(db.pool())
        .await?;
        sqlx::query(
            r#"
            UPDATE tracker_anomalies anomaly
            SET created_at = snapshot.fetched_at
            FROM guild_snapshots snapshot
            WHERE snapshot.id = anomaly.snapshot_id
            "#,
        )
        .execute(db.pool())
        .await?;
        Ok(())
    }

    /// One poll per day, `days_ago` before `now`.
    fn daily(
        now: OffsetDateTime,
        days: &[(i64, Option<i64>, Option<i64>)],
    ) -> Vec<(OffsetDateTime, Option<i64>, Option<i64>)> {
        days.iter()
            .map(|&(days_ago, alice, bob)| (now - Duration::days(days_ago), alice, bob))
            .collect()
    }

    async fn create_event(
        db: &Database,
        slug: &str,
        starts_at: OffsetDateTime,
        ends_at: OffsetDateTime,
    ) -> anyhow::Result<Uuid> {
        Ok(db
            .create_raid_event(slug, slug, starts_at, ends_at, "api", None)
            .await?
            .id)
    }

    fn standings(entries: &[RaidLeaderboardEntry]) -> Vec<(Uuid, String, i64)> {
        entries
            .iter()
            .map(|entry| (entry.player_uuid, entry.username.clone(), entry.raids))
            .collect()
    }

    async fn count(db: &Database, sql: &str) -> anyhow::Result<i64> {
        Ok(sqlx::query_scalar(sql).fetch_one(db.pool()).await?)
    }

    /// Every row of every tracker table, so a dry run can be shown to change nothing.
    async fn fingerprint(db: &Database) -> anyhow::Result<Vec<Option<String>>> {
        let mut tables = Vec::new();
        for table in [
            "guild_snapshots",
            "member_raid_counters",
            "member_raid_deltas",
            "tracker_anomalies",
        ] {
            let sql = format!("SELECT md5(string_agg(t::text, '|' ORDER BY id)) FROM {table} t");
            tables.push(sqlx::query(&sql).fetch_one(db.pool()).await?.try_get(0)?);
        }
        Ok(tables)
    }

    /// Each sample still has an identical sample at or before it and at or
    /// after it, so the history draws the same steps.
    fn assert_same_steps(before: &[MemberRaidHistoryPoint], after: &[MemberRaidHistoryPoint]) {
        let value =
            |point: &MemberRaidHistoryPoint| (point.current_guild_raids, point.total_guild_raids);
        for point in before {
            assert!(
                after.iter().any(
                    |kept| kept.captured_at <= point.captured_at && value(kept) == value(point)
                ),
                "no kept sample starts the run at {}",
                point.captured_at
            );
            assert!(
                after.iter().any(
                    |kept| kept.captured_at >= point.captured_at && value(kept) == value(point)
                ),
                "no kept sample ends the run at {}",
                point.captured_at
            );
        }
    }

    #[tokio::test]
    #[ignore = "needs TEST_DATABASE_URL"]
    async fn pruning_keeps_scores_baselines_and_dropout_high_water() -> anyhow::Result<()> {
        let test = TestDatabase::create().await?;
        let now = OffsetDateTime::now_utc();
        // Alice's counter reads 0 from day 26 and again from day 9 on, so the
        // only samples holding her high-water mark of 100 are 20 to 29 days
        // old. Bob's last raids land on day 8, the finished event's last day.
        let mut days = vec![
            (30, Some(90), Some(50)),
            (29, Some(100), Some(50)),
            (28, Some(100), Some(52)),
            (27, Some(100), Some(52)),
            (26, Some(0), Some(52)),
        ];
        days.extend(
            (20..=25)
                .rev()
                .map(|days_ago| (days_ago, Some(100), Some(52))),
        );
        days.extend([
            (9, None, None),
            (8, None, Some(55)),
            (2, Some(0), Some(55)),
            (1, Some(0), Some(55)),
        ]);
        ingest_history(&test.db, &daily(now, &days)).await?;
        sqlx::query(
            "INSERT INTO tracker_anomalies (anomaly_type, details, created_at) VALUES ('out_of_order_snapshot', '{}', $1)",
        )
        .bind(now - Duration::days(120))
        .execute(test.db.pool())
        .await?;

        let finished = create_event(
            &test.db,
            "finished",
            now - Duration::days(31),
            now - Duration::days(8),
        )
        .await?;
        let active = create_event(
            &test.db,
            "active",
            now - Duration::days(29),
            now + Duration::days(5),
        )
        .await?;
        let finished_before = standings(&test.db.raid_event_leaderboard(finished).await?);
        let active_before = standings(&test.db.raid_event_leaderboard(active).await?);
        assert_eq!(
            finished_before,
            vec![(ALICE, "Alice".to_owned(), 10), (BOB, "Bob".to_owned(), 5)]
        );
        let deltas_before = count(&test.db, "SELECT count(*) FROM member_raid_deltas").await?;
        let alice_before = test.db.member_raid_history(ALICE).await?;
        let bob_before = test.db.member_raid_history(BOB).await?;

        let report = test
            .db
            .enforce_retention(&RetentionPolicy::default(), now, true)
            .await?;
        assert!(report.redundant_counters_deleted > 0, "{report:?}");
        assert!(report.orphan_snapshots_deleted > 0, "{report:?}");
        assert_eq!(report.anomalies_deleted, 1, "{report:?}");
        assert_eq!(report.raw_payloads_cleared, days.len() as u64, "{report:?}");

        assert_eq!(
            standings(&test.db.raid_event_leaderboard(finished).await?),
            finished_before
        );
        assert_eq!(
            standings(&test.db.raid_event_leaderboard(active).await?),
            active_before
        );
        assert_eq!(
            count(&test.db, "SELECT count(*) FROM member_raid_deltas").await?,
            deltas_before
        );
        assert_same_steps(&alice_before, &test.db.member_raid_history(ALICE).await?);
        assert_same_steps(&bob_before, &test.db.member_raid_history(BOB).await?);
        assert_eq!(
            count(
                &test.db,
                "SELECT count(*) FROM guild_snapshots WHERE raw_payload IS NOT NULL"
            )
            .await?,
            0
        );
        assert_eq!(
            count(
                &test.db,
                "SELECT count(*) FROM member_raid_counters WHERE online IS NOT NULL OR joined_at IS NOT NULL"
            )
            .await?,
            0
        );

        // After a restart the next poll diffs against the kept baseline:
        // Alice's restored counter counts one raid past her high-water mark,
        // not 101 raids from the dip or 11 from her first sample.
        let test = test.restart().await?;
        let mut next_poll = snapshot(now, &[(ALICE, Some(101)), (BOB, Some(55))]);
        next_poll.raw_payload = None;
        let summary = test.db.ingest_snapshot(next_poll).await?;
        assert_eq!(summary.delta_count, 1);
        let active_after = standings(&test.db.raid_event_leaderboard(active).await?);
        assert_eq!(
            active_after,
            vec![(ALICE, "Alice".to_owned(), 11), (BOB, "Bob".to_owned(), 5)]
        );

        let second = test
            .db
            .enforce_retention(&RetentionPolicy::default(), now, true)
            .await?;
        assert_eq!(
            second,
            RetentionReport {
                applied: true,
                ..RetentionReport::default()
            }
        );
        test.remove().await
    }

    /// Per member and UTC day before the full-resolution window: sample count,
    /// then the first, last and highest guild raid counter.
    async fn old_days(
        db: &Database,
        now: OffsetDateTime,
    ) -> anyhow::Result<Vec<(Uuid, time::Date, i64, Option<i64>, Option<i64>, Option<i64>)>> {
        Ok(sqlx::query_as(
            r#"
            SELECT
                player_uuid,
                (captured_at AT TIME ZONE 'UTC')::date AS day,
                count(*),
                (array_agg(current_guild_raids ORDER BY captured_at))[1],
                (array_agg(current_guild_raids ORDER BY captured_at DESC))[1],
                max(current_guild_raids)
            FROM member_raid_counters
            WHERE captured_at < $1
            GROUP BY 1, 2
            ORDER BY 1, 2
            "#,
        )
        .bind(now - Duration::days(7))
        .fetch_all(db.pool())
        .await?)
    }

    #[tokio::test]
    #[ignore = "needs TEST_DATABASE_URL"]
    async fn busy_history_keeps_a_bounded_daily_shape() -> anyhow::Result<()> {
        let test = TestDatabase::create().await?;
        let now = OffsetDateTime::now_utc();
        let midnight = now.replace_time(time::Time::MIDNIGHT);
        // Ten old days of 12 polls, with both members raiding on every poll:
        // 120 distinct samples each. On the last old day Alice peaks mid-day
        // and then reads 0, as she does on every recent poll, so her
        // high-water mark is in a sample that neither opens nor closes a day.
        let mut polls = Vec::new();
        let mut raids = 1000;
        let mut alice_peak = 0;
        for days_ago in (21..=30).rev() {
            for poll in 0..12 {
                raids += 1;
                let alice = if days_ago == 21 && poll > 6 { 0 } else { raids };
                alice_peak = alice_peak.max(alice);
                let at = midnight - Duration::days(days_ago) + Duration::hours(1 + 2 * poll);
                polls.push((at, Some(alice), Some(2 * raids)));
            }
        }
        polls.extend(
            (1..=6)
                .rev()
                .map(|days_ago| (now - Duration::days(days_ago), Some(0), Some(2 * raids))),
        );
        ingest_history(&test.db, &polls).await?;

        let event = create_event(
            &test.db,
            "season",
            now - Duration::days(31),
            now + Duration::days(5),
        )
        .await?;
        let standings_before = standings(&test.db.raid_event_leaderboard(event).await?);
        let deltas_before = count(&test.db, "SELECT count(*) FROM member_raid_deltas").await?;
        let recent = "SELECT count(*) FROM member_raid_counters WHERE captured_at >= now() - interval '7 days'";
        let recent_before = count(&test.db, recent).await?;
        let days_before = old_days(&test.db, now).await?;
        assert_eq!(days_before.len(), 20);
        assert!(days_before.iter().all(|day| day.2 == 12));

        let report = test
            .db
            .enforce_retention(&RetentionPolicy::default(), now, true)
            .await?;
        // Each member's ordinary days keep their first and last sample; Alice's
        // last old day also keeps its peak.
        assert_eq!(
            report.daily_excess_counters_deleted,
            2 * 10 * 12 - (20 * 2 + 1),
            "{report:?}"
        );

        let days_after = old_days(&test.db, now).await?;
        assert_eq!(days_after.len(), days_before.len());
        for (before, after) in days_before.iter().zip(&days_after) {
            assert!(after.2 <= 3, "{after:?}");
            assert_eq!(
                (before.0, before.1, before.3, before.4, before.5),
                (after.0, after.1, after.3, after.4, after.5)
            );
        }
        assert_eq!(count(&test.db, recent).await?, recent_before);
        assert_eq!(
            count(&test.db, "SELECT count(*) FROM member_raid_deltas").await?,
            deltas_before
        );
        assert_eq!(
            standings(&test.db.raid_event_leaderboard(event).await?),
            standings_before
        );

        // Alice's next real reading counts one raid past her peak.
        let test = test.restart().await?;
        let mut next_poll = snapshot(
            now,
            &[(ALICE, Some(alice_peak + 1)), (BOB, Some(2 * raids))],
        );
        next_poll.raw_payload = None;
        assert_eq!(test.db.ingest_snapshot(next_poll).await?.delta_count, 1);
        let mut expected = standings_before;
        for entry in &mut expected {
            if entry.0 == ALICE {
                entry.2 += 1;
            }
        }
        assert_eq!(
            standings(&test.db.raid_event_leaderboard(event).await?),
            expected
        );

        let second = test
            .db
            .enforce_retention(&RetentionPolicy::default(), now, true)
            .await?;
        assert_eq!(
            second,
            RetentionReport {
                applied: true,
                ..RetentionReport::default()
            }
        );
        test.remove().await
    }

    #[tokio::test]
    #[ignore = "needs TEST_DATABASE_URL"]
    async fn raw_payloads_outlive_counter_compaction_until_they_expire() -> anyhow::Result<()> {
        let raw_tier = RetentionPolicy {
            raw_payload_days: 30,
            ..RetentionPolicy::default()
        };
        // Identical daily polls 40..35 and 20..10 days ago; Bob's 2 raids land
        // on day 20. Compaction empties the middle snapshots of both runs, but
        // only days 39..36 are past the 30-day raw window.
        let now = OffsetDateTime::now_utc();
        let mut days: Vec<_> = (35..=40)
            .rev()
            .map(|days_ago| (days_ago, Some(5), Some(50)))
            .collect();
        days.extend(
            (10..=20)
                .rev()
                .map(|days_ago| (days_ago, Some(5), Some(52))),
        );
        let raw = "SELECT count(*) FROM guild_snapshots WHERE raw_payload IS NOT NULL";

        let test = TestDatabase::create().await?;
        ingest_history(&test.db, &daily(now, &days)).await?;
        let event = create_event(&test.db, "all", now - Duration::days(41), now).await?;
        let standings_before = standings(&test.db.raid_event_leaderboard(event).await?);
        assert_eq!(standings_before, vec![(BOB, "Bob".to_owned(), 2)]);

        let before = fingerprint(&test.db).await?;
        let preview = test.db.enforce_retention(&raw_tier, now, false).await?;
        assert_eq!(fingerprint(&test.db).await?, before);
        let applied = test.db.enforce_retention(&raw_tier, now, true).await?;
        assert_eq!(
            applied,
            RetentionReport {
                applied: true,
                ..preview
            }
        );
        assert_eq!(
            (
                applied.raw_payloads_cleared,
                applied.orphan_snapshots_deleted
            ),
            (6, 4),
            "{applied:?}"
        );
        assert_eq!(count(&test.db, raw).await?, 11);
        assert_eq!(
            test.db.enforce_retention(&raw_tier, now, true).await?,
            RetentionReport {
                applied: true,
                ..RetentionReport::default()
            }
        );

        // Three weeks on, the rest of the window has passed.
        let later = now + Duration::days(21);
        let expired = test.db.enforce_retention(&raw_tier, later, true).await?;
        assert_eq!(
            (
                expired.raw_payloads_cleared,
                expired.orphan_snapshots_deleted
            ),
            (11, 9),
            "{expired:?}"
        );
        assert_eq!(count(&test.db, raw).await?, 0);
        assert_eq!(
            standings(&test.db.raid_event_leaderboard(event).await?),
            standings_before
        );
        test.remove().await?;

        // Without the diagnostic tier, the same history is pruned in one pass.
        let test = TestDatabase::create().await?;
        ingest_history(&test.db, &daily(now, &days)).await?;
        let event = create_event(&test.db, "all", now - Duration::days(41), now).await?;
        let minimal = test
            .db
            .enforce_retention(&RetentionPolicy::default(), now, true)
            .await?;
        assert_eq!(
            (
                minimal.raw_payloads_cleared,
                minimal.orphan_snapshots_deleted
            ),
            (17, 13),
            "{minimal:?}"
        );
        assert_eq!(count(&test.db, raw).await?, 0);
        assert_eq!(
            standings(&test.db.raid_event_leaderboard(event).await?),
            standings_before
        );
        test.remove().await
    }

    #[tokio::test]
    #[ignore = "needs TEST_DATABASE_URL"]
    async fn dry_run_reports_without_changing_anything() -> anyhow::Result<()> {
        let test = TestDatabase::create().await?;
        let now = OffsetDateTime::now_utc();
        let days: Vec<_> = (10..=20)
            .rev()
            .map(|days_ago| (days_ago, Some(5), Some(7)))
            .collect();
        ingest_history(&test.db, &daily(now, &days)).await?;
        let before = fingerprint(&test.db).await?;

        let report = test
            .db
            .enforce_retention(&RetentionPolicy::default(), now, false)
            .await?;
        assert!(!report.applied);
        assert_eq!(report.redundant_counters_deleted, 2 * 9, "{report:?}");
        assert_eq!(report.orphan_snapshots_deleted, 9, "{report:?}");
        assert_eq!(fingerprint(&test.db).await?, before);
        test.remove().await
    }

    #[tokio::test]
    #[ignore = "needs TEST_DATABASE_URL"]
    async fn polling_stores_raw_payloads_only_in_the_diagnostic_tier() -> anyhow::Result<()> {
        let payload = json!({
            "uuid": GUILD,
            "name": "Sequoia",
            "prefix": "SEQ",
            "members": {
                "total": 1,
                "chief": {
                    "070af99c-cd21-4923-92e4-8809b3d99f0d": {
                        "username": "Alice",
                        "online": true,
                        "server": "EU1",
                        "joined": "2025-08-08T22:29:03.502000Z",
                        "globalData": {
                            "guildRaids": { "total": 7, "list": {} },
                            "currentGuildRaids": { "total": 6, "list": {} }
                        }
                    }
                }
            }
        });
        let app = axum::Router::new().route(
            "/guild/prefix/SEQ",
            axum::routing::get(move || {
                let payload = payload.clone();
                async move { axum::Json(payload) }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let base_url = format!("http://{}", listener.local_addr()?);
        tokio::spawn(axum::serve(listener, app).into_future());

        let test = TestDatabase::create().await?;
        let db = Arc::new(test.db.clone());
        for store_raw_payloads in [false, true] {
            let tracker = RaidTracker::new(
                db.clone(),
                Some(WynnClient::new(base_url.clone(), "token".to_owned())?),
                "SEQ".to_owned(),
                Arc::new(PollerHealth::new()),
                store_raw_payloads,
            );
            sqlx::query("TRUNCATE guild_snapshots CASCADE")
                .execute(db.pool())
                .await?;
            assert!(tracker.poll_once().await?.inserted);
            let row = sqlx::query(
                r#"
                SELECT snapshot.raw_payload, counters.online, counters.joined_at IS NULL AS no_join
                FROM guild_snapshots snapshot
                JOIN member_raid_counters counters ON counters.snapshot_id = snapshot.id
                "#,
            )
            .fetch_one(db.pool())
            .await?;
            let raw: Option<serde_json::Value> = row.try_get("raw_payload")?;
            assert_eq!(raw.is_some(), store_raw_payloads);
            assert_eq!(row.try_get::<Option<bool>, _>("online")?, None);
            assert!(row.try_get::<bool, _>("no_join")?);
        }
        drop(db);
        test.remove().await
    }
}

use std::{
    sync::{
        Arc,
        atomic::{AtomicI64, AtomicU32, Ordering},
    },
    time::Duration,
};

use anyhow::Context;
use time::OffsetDateTime;
use tokio::time::sleep;

use crate::{
    db::IngestSummary,
    model::GuildSnapshot,
    wynn::{WynnClient, WynnError},
};

/// Upper bound on a rate-limit backoff, so a bogus header cannot stall polling.
const MAX_RATE_LIMIT_DELAY: Duration = Duration::from_secs(15 * 60);

/// Shared poll-loop state the readiness endpoint reports on. Readiness must
/// reflect whether the tracker's core function is actually operating, not just
/// whether the HTTP server is up.
pub struct PollerHealth {
    started_at_unix: i64,
    /// Unix seconds of the last successful poll; 0 = never.
    last_success_unix: AtomicI64,
    consecutive_failures: AtomicU32,
    task_restarts: AtomicU32,
}

#[derive(Clone, Copy, Debug, serde::Serialize)]
pub struct PollerHealthSnapshot {
    pub last_success_age_secs: Option<u64>,
    pub seconds_since_start: u64,
    pub consecutive_failures: u32,
    pub task_restarts: u32,
}

impl PollerHealth {
    pub fn new() -> Self {
        Self {
            started_at_unix: OffsetDateTime::now_utc().unix_timestamp(),
            last_success_unix: AtomicI64::new(0),
            consecutive_failures: AtomicU32::new(0),
            task_restarts: AtomicU32::new(0),
        }
    }

    fn record_success(&self) {
        self.last_success_unix.store(
            OffsetDateTime::now_utc().unix_timestamp(),
            Ordering::Relaxed,
        );
        self.consecutive_failures.store(0, Ordering::Relaxed);
    }

    fn record_failure(&self) {
        self.consecutive_failures.fetch_add(1, Ordering::Relaxed);
    }

    fn record_restart(&self) {
        self.task_restarts.fetch_add(1, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> PollerHealthSnapshot {
        let now = OffsetDateTime::now_utc().unix_timestamp();
        let last_success = self.last_success_unix.load(Ordering::Relaxed);
        PollerHealthSnapshot {
            last_success_age_secs: (last_success > 0)
                .then(|| now.saturating_sub(last_success).max(0) as u64),
            seconds_since_start: now.saturating_sub(self.started_at_unix).max(0) as u64,
            consecutive_failures: self.consecutive_failures.load(Ordering::Relaxed),
            task_restarts: self.task_restarts.load(Ordering::Relaxed),
        }
    }
}

#[derive(Clone)]
pub struct RaidTracker {
    db: Arc<crate::db::Database>,
    wynn: Option<WynnClient>,
    guild_prefix: String,
}

impl RaidTracker {
    pub fn new(
        db: Arc<crate::db::Database>,
        wynn: Option<WynnClient>,
        guild_prefix: String,
    ) -> Self {
        Self {
            db,
            wynn,
            guild_prefix,
        }
    }

    pub async fn poll_once(&self) -> anyhow::Result<IngestSummary> {
        let snapshot = self.fetch_snapshot().await?;
        self.db.ingest_snapshot(snapshot).await
    }

    /// Whether a Wynncraft token is configured, i.e. polling can run at all.
    pub fn polling_enabled(&self) -> bool {
        self.wynn.is_some()
    }

    async fn fetch_snapshot(&self) -> anyhow::Result<GuildSnapshot> {
        let wynn = self
            .wynn
            .as_ref()
            .context("WYNNCRAFT_ACCESS_TOKEN is required to poll guild raids")?;
        Ok(wynn.fetch_guild_snapshot(&self.guild_prefix).await?)
    }
}

/// Supervised polling: the loop runs in its own task, and if that task dies
/// (a panic), it is restarted after one interval instead of silently ending
/// tracking for the rest of the process lifetime.
pub fn spawn_poll_loop(tracker: RaidTracker, interval: Duration, health: Arc<PollerHealth>) {
    tokio::spawn(async move {
        loop {
            let run = tokio::spawn(poll_loop(tracker.clone(), interval, health.clone()));
            if let Err(error) = run.await {
                health.record_restart();
                tracing::error!(%error, "guild raid poll task died; restarting");
            }
            sleep(interval).await;
        }
    });
}

async fn poll_loop(tracker: RaidTracker, interval: Duration, health: Arc<PollerHealth>) {
    loop {
        let mut delay = interval;
        match tracker.poll_once().await {
            Ok(summary) => {
                health.record_success();
                tracing::info!(
                    inserted = summary.inserted,
                    out_of_order = summary.out_of_order,
                    snapshot_id = summary.snapshot_id,
                    member_count = summary.member_count,
                    delta_count = summary.delta_count,
                    anomaly_count = summary.anomaly_count,
                    "guild raid poll completed"
                );
            }
            Err(error) => {
                health.record_failure();
                // A rate-limited poll waits out the upstream's reset window
                // instead of hammering it again on the normal cadence.
                if let Some(WynnError::RateLimited {
                    retry_after: Some(retry),
                }) = error.downcast_ref::<WynnError>()
                {
                    // The cap yields to a longer configured interval:
                    // clamp panics when min > max.
                    delay = (*retry).clamp(interval, MAX_RATE_LIMIT_DELAY.max(interval));
                }
                tracing::warn!(%error, delay_secs = delay.as_secs(), "guild raid poll failed");
            }
        }

        sleep(delay).await;
    }
}

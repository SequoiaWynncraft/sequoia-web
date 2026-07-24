use std::{sync::Arc, time::Duration};

use anyhow::Context;
use tokio::time::sleep;

use crate::{
    db::IngestSummary,
    model::GuildSnapshot,
    wynn::{WynnClient, WynnError},
};

/// Upper bound on a rate-limit backoff, so a bogus header cannot stall polling.
const MAX_RATE_LIMIT_DELAY: Duration = Duration::from_secs(15 * 60);

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

    async fn fetch_snapshot(&self) -> anyhow::Result<GuildSnapshot> {
        let wynn = self
            .wynn
            .as_ref()
            .context("WYNNCRAFT_ACCESS_TOKEN is required to poll guild raids")?;
        Ok(wynn.fetch_guild_snapshot(&self.guild_prefix).await?)
    }
}

pub fn spawn_poll_loop(tracker: RaidTracker, interval: Duration) {
    tokio::spawn(async move {
        loop {
            let mut delay = interval;
            match tracker.poll_once().await {
                Ok(summary) => {
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
    });
}

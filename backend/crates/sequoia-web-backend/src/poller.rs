use std::{sync::Arc, time::Duration};

use anyhow::Context;
use tokio::time::sleep;

use crate::{db::IngestSummary, model::GuildSnapshot, wynn::WynnClient};

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
        wynn.fetch_guild_snapshot(&self.guild_prefix).await
    }
}

pub fn spawn_poll_loop(tracker: RaidTracker, interval: Duration) {
    tokio::spawn(async move {
        loop {
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
                    tracing::warn!(%error, "guild raid poll failed");
                }
            }

            sleep(interval).await;
        }
    });
}

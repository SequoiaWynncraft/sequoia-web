use anyhow::Context;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod db;
mod deltas;
mod http;
mod model;
mod poller;
mod wynn;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing()?;

    let config = std::sync::Arc::new(config::Config::from_env()?);
    let db = std::sync::Arc::new(db::Database::connect(&config.database_url).await?);
    let wynn = config
        .wynn_access_token
        .clone()
        .map(|token| wynn::WynnClient::new(config.wynn_api_base_url.clone(), token))
        .transpose()?;
    let tracker = poller::RaidTracker::new(db.clone(), wynn.clone(), config.guild_prefix.clone());

    if wynn.is_some() {
        poller::spawn_poll_loop(tracker.clone(), config.poll_interval);
    } else {
        tracing::warn!("WYNNCRAFT_ACCESS_TOKEN is not configured; background polling disabled");
    }

    let listener = tokio::net::TcpListener::bind(config.bind_addr)
        .await
        .context("failed to bind HTTP listener")?;

    tracing::info!(bind_addr = %config.bind_addr, "starting sequoia web backend");
    axum::serve(
        listener,
        http::router(http::AppState {
            config,
            db,
            tracker,
        }),
    )
    .await
    .context("HTTP server failed")
}

fn init_tracing() -> anyhow::Result<()> {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .try_init()
        .context("failed to initialize tracing")
}

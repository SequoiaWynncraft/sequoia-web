use anyhow::Context;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod db;
mod deltas;
mod http;
mod model;
mod poller;
mod retention;
mod wynn;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing()?;
    let retention_command = retention_command(std::env::args().skip(1))?;

    let config = std::sync::Arc::new(config::Config::from_env()?);
    if let Some(apply) = retention_command {
        return run_retention(&config, apply).await;
    }
    let db = std::sync::Arc::new(db::Database::connect(&config.database_url).await?);

    if config.retention.stores_raw_payloads()
        && config.retention_mode != retention::RetentionMode::Apply
    {
        tracing::warn!(
            "TRACKER_RAW_PAYLOAD_DAYS is set but TRACKER_RETENTION is not apply; raw payloads will accumulate"
        );
    }
    retention::spawn_retention_loop(db.clone(), config.retention, config.retention_mode);

    let wynn = config
        .wynn_access_token
        .clone()
        .map(|token| wynn::WynnClient::new(config.wynn_api_base_url.clone(), token))
        .transpose()?;
    let poller_health = std::sync::Arc::new(poller::PollerHealth::new());
    let tracker = poller::RaidTracker::new(
        db.clone(),
        wynn.clone(),
        config.guild_prefix.clone(),
        poller_health.clone(),
        config.retention.stores_raw_payloads(),
    );

    if wynn.is_some() {
        poller::spawn_poll_loop(tracker.clone(), config.poll_interval, poller_health.clone());
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
            poller_health,
        }),
    )
    .await
    .context("HTTP server failed")
}

/// `retention` reports what the policy would remove; `retention --apply` removes it.
/// Returns whether to apply, or None to run the server.
fn retention_command(mut args: impl Iterator<Item = String>) -> anyhow::Result<Option<bool>> {
    let Some(command) = args.next() else {
        return Ok(None);
    };
    match (command.as_str(), args.next().as_deref(), args.next()) {
        ("retention", None, None) => Ok(Some(false)),
        ("retention", Some("--apply"), None) => Ok(Some(true)),
        _ => anyhow::bail!("usage: sequoia-web-backend [retention [--apply]]"),
    }
}

/// Prints what one retention pass removes. A preview changes nothing, so it
/// doesn't migrate either; applying migrates first, like starting the server.
async fn run_retention(config: &config::Config, apply: bool) -> anyhow::Result<()> {
    let db = if apply {
        db::Database::connect(&config.database_url).await?
    } else {
        db::Database::connect_current(&config.database_url).await?
    };
    let report = db
        .enforce_retention(&config.retention, time::OffsetDateTime::now_utc(), apply)
        .await?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

fn init_tracing() -> anyhow::Result<()> {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .try_init()
        .context("failed to initialize tracing")
}

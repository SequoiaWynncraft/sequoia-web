use std::{net::SocketAddr, str::FromStr};

use anyhow::Context;
use axum::{Json, Router, routing::get};
use serde::Serialize;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing()?;

    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".to_owned());
    let bind_addr = SocketAddr::from_str(&bind_addr).context("invalid BIND_ADDR")?;
    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .context("failed to bind HTTP listener")?;

    tracing::info!(%bind_addr, "starting sequoia web backend");
    axum::serve(listener, router())
        .await
        .context("HTTP server failed")
}

fn router() -> Router {
    Router::new()
        .route("/health", get(health))
        .layer(TraceLayer::new_for_http())
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "sequoia-web-backend",
    })
}

fn init_tracing() -> anyhow::Result<()> {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .try_init()
        .context("failed to initialize tracing")
}

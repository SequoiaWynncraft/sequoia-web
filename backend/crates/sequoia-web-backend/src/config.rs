use std::{net::SocketAddr, str::FromStr, time::Duration};

use anyhow::{Context, bail};

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub database_url: String,
    pub wynn_api_base_url: String,
    pub wynn_access_token: Option<String>,
    pub wynn_oauth_authorize_url: String,
    pub wynn_oauth_client_id: String,
    pub wynn_oauth_client_secret: Option<String>,
    pub wynn_oauth_redirect_url: String,
    pub guild_prefix: String,
    pub poll_interval: Duration,
    pub internal_api_token: Option<String>,
    pub session_secret: Option<String>,
    pub session_cookie_domain: Option<String>,
    pub session_cookie_secure: bool,
    pub frontend_auth_success_url: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let bind_addr = env_or_default("BIND_ADDR", "127.0.0.1:8080");
        let bind_addr = SocketAddr::from_str(&bind_addr).context("invalid BIND_ADDR")?;

        let database_url = std::env::var("DATABASE_URL")
            .context("DATABASE_URL is required for tracker storage")?;
        if database_url.trim().is_empty() {
            bail!("DATABASE_URL cannot be empty");
        }

        let poll_interval_seconds = env_or_default("POLL_INTERVAL_SECONDS", "130")
            .parse::<u64>()
            .context("POLL_INTERVAL_SECONDS must be an integer")?;

        Ok(Self {
            bind_addr,
            database_url,
            wynn_api_base_url: env_or_default("WYNN_API_BASE_URL", "https://api.wynncraft.com/v3"),
            wynn_access_token: optional_env("WYNNCRAFT_ACCESS_TOKEN"),
            wynn_oauth_authorize_url: env_or_default(
                "WYNN_OAUTH_AUTHORIZE_URL",
                "https://wynncraft.com/authorize",
            ),
            wynn_oauth_client_id: env_or_default(
                "WYNN_OAUTH_CLIENT_ID",
                "HU6a1x1Ts7SW3w6sP4Z-pV_wzyWsrCgZ",
            ),
            wynn_oauth_client_secret: optional_env("WYNN_OAUTH_CLIENT_SECRET"),
            wynn_oauth_redirect_url: env_or_default(
                "WYNN_OAUTH_REDIRECT_URL",
                "https://api.seqwawa.com/auth/wynn/callback",
            ),
            guild_prefix: env_or_default("GUILD_PREFIX", "SEQ"),
            poll_interval: Duration::from_secs(poll_interval_seconds),
            internal_api_token: optional_env("INTERNAL_API_TOKEN"),
            session_secret: optional_env("SESSION_SECRET"),
            session_cookie_domain: optional_env("SESSION_COOKIE_DOMAIN"),
            session_cookie_secure: env_or_default("SESSION_COOKIE_SECURE", "true") != "false",
            frontend_auth_success_url: env_or_default(
                "FRONTEND_AUTH_SUCCESS_URL",
                "https://seqwawa.com/statistics/guilds/raid",
            ),
        })
    }
}

fn env_or_default(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_owned())
}

fn optional_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

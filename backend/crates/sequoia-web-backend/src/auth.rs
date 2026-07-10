use std::collections::BTreeMap;

use anyhow::{Context, bail};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use time::{Duration, OffsetDateTime};
use url::Url;
use uuid::Uuid;

use crate::model::SessionUser;

const OAUTH_STATE_COOKIE_PATH: &str = "/auth/wynn";

#[derive(Clone)]
pub struct OAuthClient {
    http: reqwest::Client,
    api_base_url: String,
    authorize_url: String,
    client_id: String,
    client_secret: Option<String>,
    redirect_url: String,
}

#[derive(Clone, Debug)]
pub struct OAuthProfile {
    pub player_uuid: Uuid,
    pub username: String,
}

impl OAuthClient {
    pub fn new(config: &crate::config::Config) -> Self {
        Self {
            http: reqwest::Client::new(),
            api_base_url: config.wynn_api_base_url.trim_end_matches('/').to_owned(),
            authorize_url: config.wynn_oauth_authorize_url.clone(),
            client_id: config.wynn_oauth_client_id.clone(),
            client_secret: config.wynn_oauth_client_secret.clone(),
            redirect_url: config.wynn_oauth_redirect_url.clone(),
        }
    }

    pub fn authorization_url(&self, state: &str) -> anyhow::Result<String> {
        let mut url =
            Url::parse(&self.authorize_url).context("invalid WYNN_OAUTH_AUTHORIZE_URL")?;
        url.query_pairs_mut()
            .append_pair("client_id", &self.client_id)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", &self.redirect_url)
            .append_pair("scope", "identify")
            .append_pair("state", state);
        Ok(url.to_string())
    }

    pub async fn exchange_code(&self, code: &str) -> anyhow::Result<String> {
        let token_url = format!("{}/oauth/token", self.api_base_url);
        let mut form = vec![
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", self.redirect_url.as_str()),
            ("client_id", self.client_id.as_str()),
        ];
        if let Some(client_secret) = self.client_secret.as_deref() {
            form.push(("client_secret", client_secret));
        }

        let response = self
            .http
            .post(token_url)
            .form(&form)
            .send()
            .await
            .context("failed to exchange Wynncraft OAuth code")?;

        if !response.status().is_success() {
            bail!(
                "Wynncraft OAuth token exchange failed with status {}",
                response.status()
            );
        }

        let token_response = response
            .json::<OAuthTokenResponse>()
            .await
            .context("failed to decode Wynncraft OAuth token response")?;

        if !token_response
            .scope
            .split_ascii_whitespace()
            .any(|scope| scope == "identify")
        {
            bail!("Wynncraft OAuth response did not grant identify scope");
        }

        Ok(token_response.access_token)
    }

    pub async fn fetch_identity(&self, access_token: &str) -> anyhow::Result<OAuthProfile> {
        let identity_url = format!("{}/oauth/me", self.api_base_url);
        let response = self
            .http
            .get(identity_url)
            .bearer_auth(access_token)
            .send()
            .await
            .context("failed to fetch Wynncraft OAuth identity")?;

        if !response.status().is_success() {
            bail!(
                "Wynncraft OAuth identity request failed with status {}",
                response.status()
            );
        }

        let identity = response
            .json::<OAuthIdentityResponse>()
            .await
            .context("failed to decode Wynncraft OAuth identity")?;

        select_profile(identity.profiles)
    }
}

pub fn new_opaque_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

pub fn hash_session_token(session_secret: &str, session_token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(session_secret.as_bytes());
    hasher.update(b":");
    hasher.update(session_token.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn session_expires_at() -> OffsetDateTime {
    OffsetDateTime::now_utc() + Duration::days(30)
}

pub fn oauth_state_expires_at() -> OffsetDateTime {
    OffsetDateTime::now_utc() + Duration::minutes(5)
}

pub fn session_cookie(
    name: &str,
    token: &str,
    domain: Option<&str>,
    secure: bool,
    expires_at: OffsetDateTime,
) -> String {
    expiring_cookie(name, token, "/", domain, secure, expires_at)
}

pub fn expired_session_cookie(name: &str, domain: Option<&str>, secure: bool) -> String {
    expired_cookie(name, "/", domain, secure)
}

pub fn oauth_state_cookie(
    name: &str,
    state: &str,
    domain: Option<&str>,
    secure: bool,
    expires_at: OffsetDateTime,
) -> String {
    expiring_cookie(
        name,
        state,
        OAUTH_STATE_COOKIE_PATH,
        domain,
        secure,
        expires_at,
    )
}

pub fn expired_oauth_state_cookie(name: &str, domain: Option<&str>, secure: bool) -> String {
    expired_cookie(name, OAUTH_STATE_COOKIE_PATH, domain, secure)
}

pub fn oauth_state_from_cookie<'a>(cookie_header: &'a str, name: &str) -> Option<&'a str> {
    cookie_value(cookie_header, name)
}

fn expiring_cookie(
    name: &str,
    value: &str,
    path: &str,
    domain: Option<&str>,
    secure: bool,
    expires_at: OffsetDateTime,
) -> String {
    let max_age = (expires_at - OffsetDateTime::now_utc()).whole_seconds();
    let mut cookie = format!(
        "{name}={value}; Path={path}; HttpOnly; SameSite=Lax; Max-Age={}",
        max_age.max(0)
    );
    if let Some(domain) = domain {
        cookie.push_str("; Domain=");
        cookie.push_str(domain);
    }
    if secure {
        cookie.push_str("; Secure");
    }
    cookie
}

fn expired_cookie(name: &str, path: &str, domain: Option<&str>, secure: bool) -> String {
    let mut cookie = format!("{name}=; Path={path}; HttpOnly; SameSite=Lax; Max-Age=0");
    if let Some(domain) = domain {
        cookie.push_str("; Domain=");
        cookie.push_str(domain);
    }
    if secure {
        cookie.push_str("; Secure");
    }
    cookie
}

pub fn session_token_from_cookie<'a>(cookie_header: &'a str, name: &str) -> Option<&'a str> {
    cookie_value(cookie_header, name)
}

fn cookie_value<'a>(cookie_header: &'a str, name: &str) -> Option<&'a str> {
    let prefix = format!("{name}=");
    cookie_header.split(';').find_map(|part| {
        let trimmed = part.trim();
        trimmed
            .strip_prefix(&prefix)
            .filter(|value| !value.is_empty())
    })
}

pub fn authenticated_response(user: Option<SessionUser>) -> serde_json::Value {
    match user {
        Some(user) => serde_json::json!({
            "authenticated": true,
            "player_uuid": user.player_uuid,
            "username": user.username,
        }),
        None => serde_json::json!({
            "authenticated": false,
        }),
    }
}

#[derive(Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    scope: String,
}

#[derive(Deserialize)]
struct OAuthIdentityResponse {
    profiles: BTreeMap<Uuid, OAuthIdentityProfile>,
}

#[derive(Deserialize)]
struct OAuthIdentityProfile {
    username: String,
    #[serde(default)]
    primary: bool,
}

fn select_profile(profiles: BTreeMap<Uuid, OAuthIdentityProfile>) -> anyhow::Result<OAuthProfile> {
    let mut fallback = None;
    for (player_uuid, profile) in profiles {
        let selected = OAuthProfile {
            player_uuid,
            username: profile.username,
        };
        if profile.primary {
            return Ok(selected);
        }
        if fallback.is_none() {
            fallback = Some(selected);
        }
    }

    fallback.context("Wynncraft OAuth identity did not include a linked profile")
}

#[cfg(test)]
mod tests {
    use super::{hash_session_token, oauth_state_from_cookie, session_token_from_cookie};

    #[test]
    fn extracts_session_token_from_cookie_header() {
        assert_eq!(
            session_token_from_cookie("theme=dark; seq_session=abc123; other=yes", "seq_session"),
            Some("abc123")
        );
    }

    #[test]
    fn session_hash_uses_secret() {
        let first = hash_session_token("secret-a", "session");
        let second = hash_session_token("secret-b", "session");
        assert_ne!(first, second);
    }

    #[test]
    fn extracts_oauth_state_from_cookie_header() {
        assert_eq!(
            oauth_state_from_cookie(
                "seq_oauth_state=state123; seq_session=abc123",
                "seq_oauth_state",
            ),
            Some("state123")
        );
    }
}

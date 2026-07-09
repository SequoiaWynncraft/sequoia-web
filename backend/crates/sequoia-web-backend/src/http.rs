use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::{auth, config::Config, db::Database, poller::RaidTracker};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: Arc<Database>,
    pub tracker: RaidTracker,
    pub oauth: auth::OAuthClient,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

#[derive(Deserialize)]
struct CreateRaidEventRequest {
    slug: String,
    name: String,
    #[serde(with = "time::serde::rfc3339")]
    starts_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    ends_at: OffsetDateTime,
}

#[derive(Deserialize)]
struct OAuthCallbackQuery {
    code: String,
    state: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/auth/wynn/start", get(auth_start))
        .route("/auth/wynn/callback", get(auth_callback))
        .route("/auth/logout", post(auth_logout))
        .route("/v1/me", get(me))
        .route("/v1/raid-events", get(list_raid_events))
        .route("/v1/raid-events/{event_id}", get(raid_event))
        .route(
            "/v1/raid-events/{event_id}/leaderboard",
            get(raid_event_leaderboard),
        )
        .route(
            "/v1/members/{player_uuid}/guild-raids",
            get(member_raid_history),
        )
        .route("/internal/poll-now", post(poll_now))
        .route("/internal/raid-events", post(create_raid_event))
        .route("/internal/anomalies", get(list_anomalies))
        .with_state(state)
        .layer(TraceLayer::new_for_http())
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "sequoia-web-backend",
    })
}

async fn list_raid_events(State(state): State<AppState>) -> Result<Response, ApiError> {
    let events = state.db.list_raid_events().await?;
    Ok(Json(events).into_response())
}

async fn auth_start(State(state): State<AppState>) -> Result<Response, ApiError> {
    let oauth_state = auth::new_opaque_token();
    let expires_at = auth::oauth_state_expires_at();
    state
        .db
        .insert_oauth_state(&oauth_state, expires_at)
        .await?;
    let url = state.oauth.authorization_url(&oauth_state)?;
    let cookie = auth::oauth_state_cookie(
        &oauth_state,
        state.config.session_cookie_domain.as_deref(),
        state.config.session_cookie_secure,
        expires_at,
    );

    let mut response = Redirect::temporary(&url).into_response();
    append_set_cookie(response.headers_mut(), cookie)?;
    Ok(response)
}

async fn auth_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<Response, ApiError> {
    if oauth_state_from_headers(&headers) != Some(query.state.as_str()) {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "invalid or expired OAuth state",
        ));
    }

    if !state.db.consume_oauth_state(&query.state).await? {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "invalid or expired OAuth state",
        ));
    }

    let access_token = state.oauth.exchange_code(&query.code).await?;
    let profile = state.oauth.fetch_identity(&access_token).await?;
    state
        .db
        .upsert_oauth_user(profile.player_uuid, &profile.username)
        .await?;

    if !state
        .db
        .is_current_member(&state.config.guild_prefix, profile.player_uuid)
        .await?
    {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "Wynncraft profile is not a current Sequoia member",
        ));
    }

    let session_secret = require_session_secret(&state)?;
    let session_token = auth::new_opaque_token();
    let session_id = auth::hash_session_token(session_secret, &session_token);
    let expires_at = auth::session_expires_at();
    state
        .db
        .create_session(&session_id, profile.player_uuid, expires_at)
        .await?;

    let cookie = auth::session_cookie(
        &session_token,
        state.config.session_cookie_domain.as_deref(),
        state.config.session_cookie_secure,
        expires_at,
    );

    let expired_state_cookie = auth::expired_oauth_state_cookie(
        state.config.session_cookie_domain.as_deref(),
        state.config.session_cookie_secure,
    );

    let mut response = Redirect::temporary(&state.config.frontend_auth_success_url).into_response();
    append_set_cookie(response.headers_mut(), cookie)?;
    append_set_cookie(response.headers_mut(), expired_state_cookie)?;
    Ok(response)
}

async fn auth_logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    if let (Some(session_secret), Some(session_token)) = (
        state.config.session_secret.as_deref(),
        session_token_from_headers(&headers),
    ) {
        let session_id = auth::hash_session_token(session_secret, session_token);
        state.db.delete_session(&session_id).await?;
    }

    let cookie = auth::expired_session_cookie(
        state.config.session_cookie_domain.as_deref(),
        state.config.session_cookie_secure,
    );

    Ok(([(header::SET_COOKIE, cookie)], StatusCode::NO_CONTENT).into_response())
}

async fn me(State(state): State<AppState>, headers: HeaderMap) -> Result<Response, ApiError> {
    let user = session_user_from_headers(&state, &headers).await?;
    Ok(Json(auth::authenticated_response(user)).into_response())
}

async fn raid_event_leaderboard(
    State(state): State<AppState>,
    Path(event_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    require_member_session(&state, &headers).await?;
    let leaderboard = state.db.raid_event_leaderboard(event_id).await?;
    Ok(Json(leaderboard).into_response())
}

async fn raid_event(
    State(state): State<AppState>,
    Path(event_id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let Some(event) = state.db.raid_event(event_id).await? else {
        return Err(ApiError::new(StatusCode::NOT_FOUND, "raid event not found"));
    };
    Ok(Json(event).into_response())
}

async fn member_raid_history(
    State(state): State<AppState>,
    Path(player_uuid): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    require_member_session(&state, &headers).await?;
    let history = state.db.member_raid_history(player_uuid).await?;
    Ok(Json(history).into_response())
}

async fn poll_now(State(state): State<AppState>, headers: HeaderMap) -> Result<Response, ApiError> {
    require_internal_token(&state, &headers)?;
    let summary = state.tracker.poll_once().await?;
    Ok(Json(summary).into_response())
}

async fn create_raid_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateRaidEventRequest>,
) -> Result<Response, ApiError> {
    require_internal_token(&state, &headers)?;
    if request.slug.trim().is_empty() || request.name.trim().is_empty() {
        return Err(ApiError::bad_request("slug and name are required"));
    }
    if request.ends_at <= request.starts_at {
        return Err(ApiError::bad_request("ends_at must be after starts_at"));
    }

    let event = state
        .db
        .create_raid_event(
            request.slug.trim(),
            request.name.trim(),
            request.starts_at,
            request.ends_at,
        )
        .await?;
    Ok((StatusCode::CREATED, Json(event)).into_response())
}

async fn list_anomalies(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    require_internal_token(&state, &headers)?;
    let anomalies = state.db.list_anomalies(100).await?;
    Ok(Json(anomalies).into_response())
}

fn require_internal_token(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let Some(expected_token) = state.config.internal_api_token.as_deref() else {
        return Err(ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "internal API token is not configured",
        ));
    };

    let actual_token = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));

    if actual_token == Some(expected_token) {
        Ok(())
    } else {
        Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "invalid internal API token",
        ))
    }
}

fn require_session_secret(state: &AppState) -> Result<&str, ApiError> {
    state.config.session_secret.as_deref().ok_or_else(|| {
        ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "SESSION_SECRET is not configured",
        )
    })
}

async fn session_user_from_headers(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Option<crate::model::SessionUser>, ApiError> {
    let Some(session_secret) = state.config.session_secret.as_deref() else {
        return Ok(None);
    };
    let Some(session_token) = session_token_from_headers(headers) else {
        return Ok(None);
    };

    let session_id = auth::hash_session_token(session_secret, session_token);
    let Some(user) = state.db.session_user(&session_id).await? else {
        return Ok(None);
    };
    if state
        .db
        .is_current_member(&state.config.guild_prefix, user.player_uuid)
        .await?
    {
        Ok(Some(user))
    } else {
        Ok(None)
    }
}

async fn require_member_session(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    if session_user_from_headers(state, headers).await?.is_some() {
        Ok(())
    } else {
        Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "Sequoia member login is required",
        ))
    }
}

fn session_token_from_headers(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(auth::session_token_from_cookie)
}

fn oauth_state_from_headers(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(auth::oauth_state_from_cookie)
}

fn append_set_cookie(headers: &mut HeaderMap, cookie: String) -> Result<(), ApiError> {
    let value = HeaderValue::from_str(&cookie).map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "invalid generated cookie",
        )
    })?;
    headers.append(header::SET_COOKIE, value);
    Ok(())
}

struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }

    fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(error: anyhow::Error) -> Self {
        tracing::error!(%error, "request failed");
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorResponse {
                error: self.message,
            }),
        )
            .into_response()
    }
}

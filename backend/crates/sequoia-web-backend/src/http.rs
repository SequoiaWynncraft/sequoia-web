use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post, put},
};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::{
    config::Config,
    db::Database,
    poller::{PollerHealth, PollerHealthSnapshot, RaidTracker},
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: Arc<Database>,
    pub tracker: RaidTracker,
    pub poller_health: Arc<PollerHealth>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

#[derive(Serialize)]
struct ReadyResponse {
    status: &'static str,
    problems: Vec<String>,
    poller: PollerHealthSnapshot,
}

#[derive(Deserialize)]
struct CreateRaidEventRequest {
    slug: String,
    name: String,
    #[serde(with = "time::serde::rfc3339")]
    starts_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    ends_at: OffsetDateTime,
    #[serde(default = "default_tracking")]
    tracking: String,
    /// Restrict a mod-tracked event to one raid; omitted means all raids.
    #[serde(default)]
    raid: Option<String>,
}

fn default_tracking() -> String {
    "api".to_owned()
}

#[derive(Deserialize)]
struct UpdateRaidEventRequest {
    name: String,
    #[serde(with = "time::serde::rfc3339")]
    starts_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    ends_at: OffsetDateTime,
    #[serde(default = "default_tracking")]
    tracking: String,
    #[serde(default)]
    raid: Option<String>,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
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
        .route("/internal/raid-events/{event_id}", put(update_raid_event))
        .route("/internal/anomalies", get(list_anomalies))
        .with_state(state)
        .layer(TraceLayer::new_for_http())
}

/// Liveness only: the process is up and serving HTTP. Routing decisions
/// belong to `/ready`.
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "sequoia-web-backend",
    })
}

/// Readiness: the tracker's core function is operating - database reachable,
/// polling configured, and a successful poll recent enough to trust.
async fn ready(State(state): State<AppState>) -> Response {
    let db_ok = match state.db.ping().await {
        Ok(()) => true,
        Err(error) => {
            tracing::warn!(%error, "readiness: database ping failed");
            false
        }
    };
    let poller = state.poller_health.snapshot();
    let problems = readiness_problems(
        db_ok,
        state.tracker.polling_enabled(),
        state.config.poll_interval,
        &poller,
    );

    let (status, label) = if problems.is_empty() {
        (StatusCode::OK, "ready")
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "not_ready")
    };
    (
        status,
        Json(ReadyResponse {
            status: label,
            problems,
            poller,
        }),
    )
        .into_response()
}

/// Pure readiness decision so every branch is unit-testable. Startup gets one
/// stale-window of grace before "no successful poll yet" turns unready.
fn readiness_problems(
    db_ok: bool,
    polling_enabled: bool,
    poll_interval: std::time::Duration,
    poller: &PollerHealthSnapshot,
) -> Vec<String> {
    let mut problems = Vec::new();
    if !db_ok {
        problems.push("database unreachable".to_owned());
    }
    if polling_enabled {
        let stale_after = (3 * poll_interval)
            .max(std::time::Duration::from_secs(300))
            .as_secs();
        let age = poller
            .last_success_age_secs
            .unwrap_or(poller.seconds_since_start);
        if age > stale_after {
            problems.push(match poller.last_success_age_secs {
                Some(age) => format!("last successful poll was {age}s ago (limit {stale_after}s)"),
                None => format!("no successful poll within {stale_after}s of startup"),
            });
        }
    } else {
        problems.push("polling disabled: WYNNCRAFT_ACCESS_TOKEN is not configured".to_owned());
    }
    problems
}

async fn list_raid_events(State(state): State<AppState>) -> Result<Response, ApiError> {
    let events = state.db.list_raid_events().await?;
    Ok(Json(events).into_response())
}

async fn raid_event_leaderboard(
    State(state): State<AppState>,
    Path(event_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    require_internal_token(&state, &headers)?;
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
    require_internal_token(&state, &headers)?;
    let history = state.db.member_raid_history(player_uuid).await?;
    Ok(Json(history).into_response())
}

async fn poll_now(State(state): State<AppState>, headers: HeaderMap) -> Result<Response, ApiError> {
    require_internal_token(&state, &headers)?;
    match state.tracker.poll_once().await {
        Ok(summary) => Ok(Json(summary).into_response()),
        // An upstream rate limit is the caller's signal to back off, not an
        // internal fault; pass the reset window through so callers can honor it.
        Err(error) => match error.downcast_ref::<crate::wynn::WynnError>() {
            Some(crate::wynn::WynnError::RateLimited { retry_after }) => {
                let mut response = ApiError::new(
                    StatusCode::TOO_MANY_REQUESTS,
                    "Wynncraft rate limited the poll - retry later",
                )
                .into_response();
                if let Some(retry) = retry_after
                    && let Ok(value) =
                        axum::http::HeaderValue::from_str(&retry.as_secs().to_string())
                {
                    response
                        .headers_mut()
                        .insert(axum::http::header::RETRY_AFTER, value);
                }
                Ok(response)
            }
            _ => Err(ApiError::from(error)),
        },
    }
}

async fn create_raid_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateRaidEventRequest>,
) -> Result<Response, ApiError> {
    require_internal_token(&state, &headers)?;
    if request.slug.trim().is_empty() {
        return Err(ApiError::bad_request("slug is required"));
    }
    let raid = validate_event_fields(
        &request.name,
        request.starts_at,
        request.ends_at,
        &request.tracking,
        request.raid.as_deref(),
    )?;

    let event = state
        .db
        .create_raid_event(
            request.slug.trim(),
            request.name.trim(),
            request.starts_at,
            request.ends_at,
            &request.tracking,
            raid,
        )
        .await?;
    Ok((StatusCode::CREATED, Json(event)).into_response())
}

async fn update_raid_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(event_id): Path<Uuid>,
    Json(request): Json<UpdateRaidEventRequest>,
) -> Result<Response, ApiError> {
    require_internal_token(&state, &headers)?;
    let raid = validate_event_fields(
        &request.name,
        request.starts_at,
        request.ends_at,
        &request.tracking,
        request.raid.as_deref(),
    )?;

    let event = state
        .db
        .update_raid_event(
            event_id,
            request.name.trim(),
            request.starts_at,
            request.ends_at,
            &request.tracking,
            raid,
        )
        .await?;
    match event {
        Some(event) => Ok(Json(event).into_response()),
        None => Err(ApiError::new(StatusCode::NOT_FOUND, "raid event not found")),
    }
}

/// Shared create/update validation; returns the normalized raid scope.
fn validate_event_fields<'a>(
    name: &str,
    starts_at: OffsetDateTime,
    ends_at: OffsetDateTime,
    tracking: &str,
    raid: Option<&'a str>,
) -> Result<Option<&'a str>, ApiError> {
    if name.trim().is_empty() {
        return Err(ApiError::bad_request("name is required"));
    }
    if ends_at <= starts_at {
        return Err(ApiError::bad_request("ends_at must be after starts_at"));
    }
    if tracking != "api" && tracking != "mod" {
        return Err(ApiError::bad_request("tracking must be 'api' or 'mod'"));
    }
    let raid = raid.map(str::trim).filter(|raid| !raid.is_empty());
    if raid.is_some() && tracking != "mod" {
        return Err(ApiError::bad_request(
            "raid scoping requires 'mod' tracking - API counter diffs cannot attribute per raid",
        ));
    }
    Ok(raid)
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

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use crate::poller::PollerHealthSnapshot;

    use super::readiness_problems;

    const INTERVAL: Duration = Duration::from_secs(130);

    fn poller(
        last_success_age_secs: Option<u64>,
        seconds_since_start: u64,
    ) -> PollerHealthSnapshot {
        PollerHealthSnapshot {
            last_success_age_secs,
            seconds_since_start,
            consecutive_failures: 0,
            task_restarts: 0,
        }
    }

    #[test]
    fn ready_when_db_up_and_poll_recent() {
        assert!(readiness_problems(true, true, INTERVAL, &poller(Some(10), 1000)).is_empty());
    }

    #[test]
    fn unready_when_database_is_down() {
        let problems = readiness_problems(false, true, INTERVAL, &poller(Some(10), 1000));
        assert_eq!(problems, vec!["database unreachable".to_owned()]);
    }

    #[test]
    fn unready_when_polling_is_not_configured() {
        let problems = readiness_problems(true, false, INTERVAL, &poller(None, 10));
        assert_eq!(problems.len(), 1);
        assert!(problems[0].contains("WYNNCRAFT_ACCESS_TOKEN"));
    }

    #[test]
    fn unready_when_last_success_is_stale() {
        // Stale window for a 130s interval is max(3*130, 300) = 390s.
        assert!(readiness_problems(true, true, INTERVAL, &poller(Some(390), 10_000)).is_empty());
        let problems = readiness_problems(true, true, INTERVAL, &poller(Some(391), 10_000));
        assert_eq!(problems.len(), 1);
        assert!(problems[0].contains("last successful poll"));
    }

    #[test]
    fn startup_gets_one_stale_window_of_grace() {
        // Covers a dead poll task too: successes stop, age keeps growing.
        assert!(readiness_problems(true, true, INTERVAL, &poller(None, 390)).is_empty());
        let problems = readiness_problems(true, true, INTERVAL, &poller(None, 391));
        assert_eq!(problems.len(), 1);
        assert!(problems[0].contains("no successful poll"));
    }
}

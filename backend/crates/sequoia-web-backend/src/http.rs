use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::{config::Config, db::Database, poller::RaidTracker};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: Arc<Database>,
    pub tracker: RaidTracker,
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
    starts_at: OffsetDateTime,
    ends_at: OffsetDateTime,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/raid-events", get(list_raid_events))
        .route(
            "/v1/raid-events/{event_id}/leaderboard",
            get(raid_event_leaderboard),
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

async fn raid_event_leaderboard(
    State(state): State<AppState>,
    Path(event_id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let leaderboard = state.db.raid_event_leaderboard(event_id).await?;
    Ok(Json(leaderboard).into_response())
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

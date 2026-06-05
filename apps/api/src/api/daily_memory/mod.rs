use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{Duration as ChronoDuration, Utc};
use serde_json::Value;

use crate::{
    app::daily_memory::{self, AppendDailyMemoryCheckpointCommand},
    ApiError, AppState, AppendDailyMemoryCheckpoint, DailyMemoryStore,
};

pub(crate) async fn get_today_daily_memory(
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    let date = current_kst_date();
    daily_memory_response(&state.daily_memory_store, &date).await
}

pub(crate) async fn get_daily_memory(
    State(state): State<AppState>,
    Path(date): Path<String>,
) -> Result<Json<Value>, ApiError> {
    daily_memory_response(&state.daily_memory_store, &date).await
}

async fn daily_memory_response(
    store: &DailyMemoryStore,
    date: &str,
) -> Result<Json<Value>, ApiError> {
    daily_memory::response_usecase(store, date)
        .await
        .map(Json)
        .map_err(daily_memory_error)
}

pub(crate) async fn append_daily_memory_checkpoint(
    State(state): State<AppState>,
    Path(date): Path<String>,
    Json(input): Json<AppendDailyMemoryCheckpoint>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let entry = daily_memory::append_checkpoint_usecase(
        &state.daily_memory_store,
        &date,
        AppendDailyMemoryCheckpointCommand {
            heading: input.heading,
            content: input.content,
            source: input.source,
            tags: input.tags,
        },
    )
    .await
    .map_err(ApiError::bad_request)?;
    Ok((StatusCode::CREATED, Json(entry)))
}

fn daily_memory_error(err: String) -> ApiError {
    if err == "date must use YYYY-MM-DD" {
        ApiError::bad_request(err)
    } else {
        ApiError::internal(err)
    }
}

pub(crate) fn current_kst_date() -> String {
    (Utc::now() + ChronoDuration::hours(9))
        .format("%Y-%m-%d")
        .to_string()
}

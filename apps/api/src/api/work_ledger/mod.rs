use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;

use crate::{
    app::work_ledger::{normalize_work_event_kind, AddWorkTaskEvent, UpsertWorkTask},
    domain::work_ledger::work_ledger::{WorkLedger, WorkTask, WorkTaskEvent},
    require_field, ApiError, AppState,
};

pub(crate) async fn get_work_ledger(State(state): State<AppState>) -> Json<WorkLedger> {
    Json(state.work_ledger.get().await)
}

pub(crate) async fn upsert_work_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpsertWorkTask>,
) -> Result<Json<WorkTask>, ApiError> {
    state.work_ledger.upsert_task(&id, input).await.map(Json)
}

pub(crate) async fn add_work_task_event(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<AddWorkTaskEvent>,
) -> Result<(StatusCode, Json<WorkTaskEvent>), ApiError> {
    let kind = normalize_work_event_kind(input.kind)?;
    let event = WorkTaskEvent {
        id: input
            .id
            .unwrap_or_else(|| format!("work-event-{}", Utc::now().timestamp_millis())),
        task_id: id.clone(),
        at: input.at.unwrap_or_else(Utc::now),
        kind,
        body: require_field(input.body, "body")?,
    };
    state.work_ledger.add_event(&id, event.clone()).await?;
    Ok((StatusCode::CREATED, Json(event)))
}

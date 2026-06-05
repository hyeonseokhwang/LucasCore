use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};

use crate::{
    app::work_ledger::{
        add_event_usecase, get_usecase, upsert_task_usecase, AddWorkTaskEvent, UpsertWorkTask,
    },
    domain::work_ledger::work_ledger::{WorkLedger, WorkTask, WorkTaskEvent},
    ApiError, AppState,
};

pub(crate) async fn get_work_ledger(State(state): State<AppState>) -> Json<WorkLedger> {
    Json(get_usecase(&state.work_ledger).await)
}

pub(crate) async fn upsert_work_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpsertWorkTask>,
) -> Result<Json<WorkTask>, ApiError> {
    upsert_task_usecase(&state.work_ledger, id, input)
        .await
        .map(Json)
        .map_err(ApiError::bad_request)
}

pub(crate) async fn add_work_task_event(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<AddWorkTaskEvent>,
) -> Result<(StatusCode, Json<WorkTaskEvent>), ApiError> {
    let event = add_event_usecase(&state.work_ledger, id, input)
        .await
        .map_err(|err| {
            if err == "work task not found" {
                ApiError::not_found(err)
            } else {
                ApiError::bad_request(err)
            }
        })?;
    Ok((StatusCode::CREATED, Json(event)))
}

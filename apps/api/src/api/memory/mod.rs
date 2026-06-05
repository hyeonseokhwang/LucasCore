use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    api, app,
    app::memory::{CreateMemoryCommand, MemoryQueryInput},
    domain::work_ledger::work_ledger::{WorkTask, WorkTaskStatus},
    ApiError, AppState, MemoryEntry,
};

#[derive(Debug, Deserialize)]
pub(crate) struct CreateMemoryEntry {
    id: Option<String>,
    at: Option<DateTime<Utc>>,
    agent_id: Option<String>,
    layer: Option<String>,
    scope: Option<String>,
    kind: Option<String>,
    topic: Option<String>,
    content: Option<String>,
    importance: Option<i32>,
    source: Option<String>,
    source_id: Option<String>,
    ledger_item: Option<String>,
    evidence_path: Option<String>,
    tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Default)]
pub(crate) struct MemoryQuery {
    agent_id: Option<String>,
    scope: Option<String>,
    layer: Option<String>,
    kind: Option<String>,
    topic: Option<String>,
    search: Option<String>,
    include_archived: Option<bool>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize, Default)]
pub(crate) struct RecoveryQuery {
    search: Option<String>,
    limit: Option<usize>,
}

pub(crate) async fn list_memory(
    State(state): State<AppState>,
    Query(query): Query<MemoryQuery>,
) -> Json<Value> {
    Json(
        app::memory::list_usecase(
            &state.memory_store,
            state.memory_store.path.display().to_string(),
            MemoryQueryInput {
                agent_id: query.agent_id,
                scope: query.scope,
                layer: query.layer,
                kind: query.kind,
                topic: query.topic,
                search: query.search,
                include_archived: query.include_archived,
                limit: query.limit,
            },
        )
        .await,
    )
}

pub(crate) async fn add_memory(
    State(state): State<AppState>,
    Json(input): Json<CreateMemoryEntry>,
) -> Result<(StatusCode, Json<MemoryEntry>), ApiError> {
    let entry = app::memory::add_usecase(
        &state.memory_store,
        CreateMemoryCommand {
            id: input.id,
            at: input.at,
            agent_id: input.agent_id,
            layer: input.layer,
            scope: input.scope,
            kind: input.kind,
            topic: input.topic,
            content: input.content,
            importance: input.importance,
            source: input.source,
            source_id: input.source_id,
            ledger_item: input.ledger_item,
            evidence_path: input.evidence_path,
            tags: input.tags,
        },
    )
    .await
    .map_err(ApiError::bad_request)?;
    Ok((StatusCode::CREATED, Json(entry)))
}

pub(crate) async fn recover_agent_context(
    State(state): State<AppState>,
    Path(agent_id): Path<String>,
    Query(query): Query<RecoveryQuery>,
) -> Result<Json<Value>, ApiError> {
    let limit = query.limit.unwrap_or(8).clamp(1, 50);
    let (personal, shared) = app::memory::recover_memories_usecase(
        &state.memory_store,
        agent_id.clone(),
        query.search,
        limit,
    )
    .await;
    let ledger = app::work_ledger::get_usecase(&state.work_ledger).await;
    let active_tasks: Vec<WorkTask> = ledger
        .tasks
        .iter()
        .filter(|task| {
            matches!(
                task.status,
                WorkTaskStatus::Todo | WorkTaskStatus::Doing | WorkTaskStatus::Blocked
            )
        })
        .cloned()
        .collect();
    let mut recent_events = ledger.events.clone();
    recent_events.sort_by(|a, b| b.at.cmp(&a.at));
    recent_events.truncate(limit);
    let daily_memory_date = api::daily_memory::current_kst_date();
    let daily_memory =
        app::daily_memory::read_document_usecase(&state.daily_memory_store, &daily_memory_date)
            .await
            .map_err(ApiError::internal)?;

    Ok(Json(json!({
        "ok": true,
        "agent_id": agent_id,
        "recovered_context": {
            "daily_memory": daily_memory,
            "personal_memories": personal,
            "shared_memories": shared,
            "active_tasks": active_tasks,
            "recent_work_events": recent_events,
        },
        "report_contract": "recovered_context / latest_ledger_item / latest_evidence / next_action / blocker"
    })))
}

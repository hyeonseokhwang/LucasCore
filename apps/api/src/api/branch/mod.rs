use axum::{extract::State, http::HeaderMap, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    app, collect_branch_agent_census, domain::work_ledger::work_ledger::WorkLedger,
    ensure_minimum_sessions, require_branch_token, require_field, ApiError, AppState,
    BranchAgentCensus, PeerMessage, P1C_LOW_WATERMARK,
};

#[derive(Debug, Deserialize)]
pub(crate) struct CreateBranchPeerMessage {
    id: Option<String>,
    at: Option<DateTime<Utc>>,
    #[serde(rename = "from")]
    from_peer: Option<String>,
    to: Option<String>,
    kind: Option<String>,
    body: Option<String>,
}

pub(crate) async fn branch_health() -> Json<Value> {
    Json(json!({
        "ok": true,
        "service": "lcc-core-branch-inbound",
        "time": Utc::now()
    }))
}

pub(crate) async fn branch_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    require_branch_token(&headers)?;
    ensure_minimum_sessions(&state).await;
    let census = collect_branch_agent_census(&state).await;
    let session_count = state.sessions.read().await.len();
    let peer_message_count = app::peer::list_usecase(&state.peer_store).await.len();
    Ok(Json(json!({
        "ok": true,
        "service": "lcc-core-branch-inbound",
        "time": Utc::now(),
        "work_ledger_tasks": app::work_ledger::get_usecase(&state.work_ledger).await.tasks.len(),
        "peer_messages": peer_message_count,
        "agent_total": census.total_agents,
        "agent_active": census.active_agents,
        "agent_session_source": census.session_source,
        "agent_session_api_ok": census.session_api.ok,
        "agent_session_api_note": census.session_api.note,
        "degraded": session_count < P1C_LOW_WATERMARK,
    })))
}

pub(crate) async fn branch_agents(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BranchAgentCensus>, ApiError> {
    require_branch_token(&headers)?;
    ensure_minimum_sessions(&state).await;
    Ok(Json(collect_branch_agent_census(&state).await))
}

pub(crate) async fn branch_work_ledger(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<WorkLedger>, ApiError> {
    require_branch_token(&headers)?;
    Ok(Json(
        app::work_ledger::get_usecase(&state.work_ledger).await,
    ))
}

pub(crate) async fn branch_list_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<PeerMessage>>, ApiError> {
    require_branch_token(&headers)?;
    Ok(Json(app::peer::list_usecase(&state.peer_store).await))
}

pub(crate) async fn branch_add_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateBranchPeerMessage>,
) -> Result<(StatusCode, Json<PeerMessage>), ApiError> {
    require_branch_token(&headers)?;
    let message = app::peer::add_usecase(
        &state.peer_store,
        app::peer::CreatePeerMessageCommand {
            id: input.id,
            at: input.at,
            from_peer: require_field(input.from_peer, "from")?,
            to: input.to.unwrap_or_else(|| "branch".to_string()),
            kind: Some(input.kind.unwrap_or_else(|| "hq-inbound".to_string())),
            body: require_field(input.body, "body")?,
        },
    )
    .await
    .map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(message)))
}

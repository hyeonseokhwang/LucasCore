use axum::{extract::State, http::HeaderMap, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    app, domain::work_ledger::work_ledger::WorkLedger, require_branch_token, require_field,
    ApiError, AppState, PeerMessage,
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

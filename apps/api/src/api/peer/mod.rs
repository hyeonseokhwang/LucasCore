use axum::{extract::State, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;

use crate::{app, require_field, ApiError, AppState, PeerMessage};

#[derive(Debug, Deserialize)]
pub(crate) struct CreatePeerMessage {
    id: Option<String>,
    at: Option<DateTime<Utc>>,
    #[serde(rename = "from")]
    from_peer: Option<String>,
    to: Option<String>,
    kind: Option<String>,
    body: Option<String>,
}

pub(crate) async fn peer_status(State(state): State<AppState>) -> Json<Value> {
    Json(
        app::peer::status_usecase(
            &state.peer_store,
            state.peer_store.path.display().to_string(),
        )
        .await,
    )
}

pub(crate) async fn list_peer_messages(State(state): State<AppState>) -> Json<Vec<PeerMessage>> {
    Json(app::peer::list_usecase(&state.peer_store).await)
}

pub(crate) async fn add_peer_message(
    State(state): State<AppState>,
    Json(input): Json<CreatePeerMessage>,
) -> Result<(StatusCode, Json<PeerMessage>), ApiError> {
    let message = app::peer::add_usecase(
        &state.peer_store,
        app::peer::CreatePeerMessageCommand {
            id: input.id,
            at: input.at,
            from_peer: require_field(input.from_peer, "from")?,
            to: require_field(input.to, "to")?,
            kind: input.kind,
            body: require_field(input.body, "body")?,
        },
    )
    .await
    .map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(message)))
}

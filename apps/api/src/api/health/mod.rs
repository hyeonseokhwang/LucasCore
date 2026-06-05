use axum::{extract::State, Json};
use chrono::Utc;
use serde_json::{json, Value};

use crate::{ensure_minimum_sessions, AppState, P1C_LOW_WATERMARK};

pub(crate) async fn health(State(state): State<AppState>) -> Json<Value> {
    ensure_minimum_sessions(&state).await;
    let session_count = state.sessions.read().await.len();
    Json(json!({
        "ok": true,
        "service": "lcc-core-api",
        "time": Utc::now(),
        "sessions": session_count,
        "degraded": session_count < P1C_LOW_WATERMARK,
    }))
}

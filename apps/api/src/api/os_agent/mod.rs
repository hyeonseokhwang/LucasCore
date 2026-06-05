use axum::{extract::Path, Json};
use serde_json::{json, Value};

use crate::{
    os_agent_attached_by_default, os_agent_view, read_os_agent_attachment_states,
    read_os_agent_preview, read_os_agent_record, read_os_agent_records, set_os_agent_attached,
    ApiError, SessionView,
};

pub(crate) async fn list_os_agents() -> Json<Vec<SessionView>> {
    let attachment_states = read_os_agent_attachment_states().await;
    let mut views = Vec::new();
    for record in read_os_agent_records().await {
        let attached = os_agent_attached_by_default(&record, &attachment_states);
        let preview = read_os_agent_preview(&record).await.unwrap_or_default();
        views.push(os_agent_view(record, preview, attached));
    }
    Json(views)
}

pub(crate) async fn attach_os_agent(Path(id): Path<String>) -> Result<Json<SessionView>, ApiError> {
    let Some(record) = read_os_agent_record(&id).await else {
        return Err(ApiError::not_found("OS agent not found"));
    };
    set_os_agent_attached(&id, true).await?;
    let preview = read_os_agent_preview(&record).await.unwrap_or_default();
    Ok(Json(os_agent_view(record, preview, true)))
}

pub(crate) async fn detach_os_agent(Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    if read_os_agent_record(&id).await.is_none() {
        return Err(ApiError::not_found("OS agent not found"));
    }
    set_os_agent_attached(&id, false).await?;
    Ok(Json(
        json!({ "ok": true, "detached": true, "session_id": id }),
    ))
}

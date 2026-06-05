use axum::Json;

use crate::{
    os_agent_attached_by_default, os_agent_view, read_os_agent_attachment_states,
    read_os_agent_preview, read_os_agent_records, SessionView,
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

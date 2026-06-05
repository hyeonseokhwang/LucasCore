use chrono::{DateTime, Utc};

use crate::domain::peer::{peer::PeerMessage, port::PeerRepository};

#[derive(Debug, Clone)]
pub struct CreatePeerMessageCommand {
    pub id: Option<String>,
    pub at: Option<DateTime<Utc>>,
    pub from_peer: String,
    pub to: String,
    pub kind: Option<String>,
    pub body: String,
}

pub async fn status_usecase(repo: &impl PeerRepository, path: String) -> serde_json::Value {
    let messages = repo.list().await;
    serde_json::json!({
        "ok": true,
        "service": "lcc-peer-bridge",
        "messages": messages.len(),
        "path": path,
    })
}

pub async fn list_usecase(repo: &impl PeerRepository) -> Vec<PeerMessage> {
    repo.list().await
}

pub async fn add_usecase(
    repo: &impl PeerRepository,
    input: CreatePeerMessageCommand,
) -> Result<PeerMessage, String> {
    let message = PeerMessage {
        id: input
            .id
            .unwrap_or_else(|| format!("peer-msg-{}", Utc::now().timestamp_millis())),
        at: input.at.unwrap_or_else(Utc::now),
        from_peer: input.from_peer,
        to: input.to,
        kind: input.kind.unwrap_or_else(|| "terminal".to_string()),
        body: input.body,
    };
    repo.append(message.clone()).await?;
    Ok(message)
}

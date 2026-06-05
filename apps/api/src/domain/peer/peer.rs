// CA Phase 2 — domain/peer entities
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerMessage {
    pub id: String,
    pub at: DateTime<Utc>,
    #[serde(rename = "from")]
    pub from_peer: String,
    pub to: String,
    pub kind: String,
    pub body: String,
}

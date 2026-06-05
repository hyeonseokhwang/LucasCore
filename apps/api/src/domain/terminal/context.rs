// CA Phase 2 — domain/terminal context events
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalContextEvent {
    pub at: DateTime<Utc>,
    pub session_id: String,
    pub event: String,
    pub archive_path: String,
    pub bytes: u64,
}

// CA Phase 2 — domain/memory entities
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub at: DateTime<Utc>,
    pub agent_id: String,
    pub layer: String,
    pub scope: String,
    pub kind: String,
    pub topic: Option<String>,
    pub content: String,
    pub importance: i32,
    pub source: String,
    pub source_id: Option<String>,
    pub ledger_item: Option<String>,
    pub evidence_path: Option<String>,
    pub tags: Vec<String>,
    pub archived_at: Option<DateTime<Utc>>,
}

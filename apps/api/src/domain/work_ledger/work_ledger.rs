// CA Phase 2 — domain/work_ledger entities
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkLedger {
    pub tasks: Vec<WorkTask>,
    pub events: Vec<WorkTaskEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkTask {
    pub id: String,
    pub title: String,
    pub status: WorkTaskStatus,
    pub priority: i32,
    pub due_at: Option<DateTime<Utc>>,
    pub reminder_minutes: Option<u32>,
    pub last_reminded_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkTaskStatus {
    Todo,
    Doing,
    Done,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkTaskEvent {
    pub id: String,
    pub task_id: String,
    pub at: DateTime<Utc>,
    pub kind: String,
    pub body: String,
}

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{domain::work_ledger::work_ledger::WorkTaskStatus, ApiError};

#[derive(Debug, Deserialize)]
pub(crate) struct UpsertWorkTask {
    pub(crate) title: Option<String>,
    pub(crate) status: Option<WorkTaskStatus>,
    pub(crate) priority: Option<i32>,
    pub(crate) due_at: Option<DateTime<Utc>>,
    pub(crate) reminder_minutes: Option<u32>,
    pub(crate) last_reminded_at: Option<DateTime<Utc>>,
    pub(crate) notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AddWorkTaskEvent {
    pub(crate) id: Option<String>,
    pub(crate) at: Option<DateTime<Utc>>,
    pub(crate) kind: Option<String>,
    pub(crate) body: Option<String>,
}

pub(crate) fn normalize_work_event_kind(kind: Option<String>) -> Result<String, ApiError> {
    let raw = kind.unwrap_or_else(|| "note".to_string());
    let normalized = raw.trim().to_lowercase().replace('_', "-");
    let allowed = [
        "created",
        "fired",
        "acknowledged",
        "snoozed",
        "blocked",
        "completed",
        "status-updated",
        "note",
        "heartbeat",
        "report",
        "evidence",
        "qa-pass",
        "qa-fail",
    ];
    if allowed.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(ApiError::bad_request(format!(
            "invalid work ledger event kind: {raw}"
        )))
    }
}

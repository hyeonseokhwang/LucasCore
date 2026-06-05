use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::domain::work_ledger::{
    port::WorkLedgerRepository,
    work_ledger::{WorkLedger, WorkTask, WorkTaskEvent, WorkTaskStatus},
};
use crate::ApiError;

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

pub(crate) async fn get_usecase(repo: &impl WorkLedgerRepository) -> WorkLedger {
    repo.get().await
}

pub(crate) async fn upsert_task_usecase(
    repo: &impl WorkLedgerRepository,
    id: String,
    input: UpsertWorkTask,
) -> Result<WorkTask, String> {
    let mut ledger = repo.get().await;
    let now = Utc::now();
    let result = if let Some(task) = ledger.tasks.iter_mut().find(|task| task.id == id) {
        if let Some(title) = input.title {
            task.title = title;
        }
        if let Some(status) = input.status {
            task.status = status;
        }
        if let Some(priority) = input.priority {
            task.priority = priority;
        }
        if input.due_at.is_some() {
            task.due_at = input.due_at;
        }
        if input.reminder_minutes.is_some() {
            task.reminder_minutes = input.reminder_minutes;
        }
        if input.last_reminded_at.is_some() {
            task.last_reminded_at = input.last_reminded_at;
        }
        if input.notes.is_some() {
            task.notes = input.notes;
        }
        task.updated_at = now;
        task.clone()
    } else {
        let task = WorkTask {
            id: id.clone(),
            title: input.title.unwrap_or(id),
            status: input.status.unwrap_or(WorkTaskStatus::Todo),
            priority: input.priority.unwrap_or(100),
            due_at: input.due_at,
            reminder_minutes: input.reminder_minutes,
            last_reminded_at: input.last_reminded_at,
            notes: input.notes,
            updated_at: now,
        };
        ledger.tasks.push(task.clone());
        task
    };
    repo.save(&ledger).await?;
    Ok(result)
}

pub(crate) async fn add_event_usecase(
    repo: &impl WorkLedgerRepository,
    task_id: String,
    input: AddWorkTaskEvent,
) -> Result<WorkTaskEvent, String> {
    let kind = normalize_work_event_kind(input.kind).map_err(|err| err.message)?;
    let body = require_field(input.body, "body").map_err(|err| err.message)?;
    let mut ledger = repo.get().await;
    let Some(task) = ledger.tasks.iter_mut().find(|task| task.id == task_id) else {
        return Err("work task not found".to_string());
    };
    task.updated_at = Utc::now();
    let event = WorkTaskEvent {
        id: input
            .id
            .unwrap_or_else(|| format!("work-event-{}", Utc::now().timestamp_millis())),
        task_id,
        at: input.at.unwrap_or_else(Utc::now),
        kind,
        body,
    };
    ledger.events.push(event.clone());
    repo.save(&ledger).await?;
    Ok(event)
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

fn require_field(value: Option<String>, field: &str) -> Result<String, ApiError> {
    let Some(value) = value else {
        return Err(ApiError::bad_request(format!("{field} is required")));
    };
    if value.trim().is_empty() {
        return Err(ApiError::bad_request(format!("{field} is required")));
    }
    Ok(value)
}

use std::{path::PathBuf, sync::Arc};

use chrono::Utc;
use tokio::{fs, sync::RwLock};

use crate::{
    app::work_ledger::UpsertWorkTask,
    domain::work_ledger::work_ledger::{WorkLedger, WorkTask, WorkTaskEvent, WorkTaskStatus},
    ApiError,
};

#[derive(Clone)]
pub(crate) struct WorkLedgerStore {
    path: Arc<PathBuf>,
    ledger: Arc<RwLock<WorkLedger>>,
}

impl WorkLedgerStore {
    pub(crate) async fn new(path: PathBuf) -> anyhow::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let ledger = match fs::read_to_string(&path).await {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|_| default_work_ledger()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                let ledger = default_work_ledger();
                let raw = serde_json::to_string_pretty(&ledger)?;
                fs::write(&path, raw).await?;
                ledger
            }
            Err(err) => return Err(err.into()),
        };
        Ok(Self {
            path: Arc::new(path),
            ledger: Arc::new(RwLock::new(ledger)),
        })
    }

    pub(crate) async fn get(&self) -> WorkLedger {
        self.ledger.read().await.clone()
    }

    async fn persist(&self, ledger: &WorkLedger) -> Result<(), ApiError> {
        let raw = serde_json::to_string_pretty(ledger).map_err(ApiError::internal)?;
        fs::write(&*self.path, raw)
            .await
            .map_err(ApiError::internal)
    }

    pub(crate) async fn upsert_task(
        &self,
        id: &str,
        input: UpsertWorkTask,
    ) -> Result<WorkTask, ApiError> {
        let mut ledger = self.ledger.write().await;
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
                id: id.to_string(),
                title: input.title.unwrap_or_else(|| id.to_string()),
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
        self.persist(&ledger).await?;
        Ok(result)
    }

    pub(crate) async fn add_event(
        &self,
        task_id: &str,
        event: WorkTaskEvent,
    ) -> Result<(), ApiError> {
        let mut ledger = self.ledger.write().await;
        let Some(task) = ledger.tasks.iter_mut().find(|task| task.id == task_id) else {
            return Err(ApiError::not_found("work task not found"));
        };
        task.updated_at = Utc::now();
        ledger.events.push(event);
        self.persist(&ledger).await
    }
}

fn default_work_ledger() -> WorkLedger {
    let now = Utc::now();
    WorkLedger {
        tasks: vec![
            WorkTask {
                id: "spring-msa-study-start-1400".to_string(),
                title: "Spring MSA study start".to_string(),
                status: WorkTaskStatus::Todo,
                priority: 1,
                due_at: None,
                reminder_minutes: None,
                last_reminded_at: None,
                notes: Some("Top-priority scheduled item from branch manager ledger.".to_string()),
                updated_at: now,
            },
            WorkTask {
                id: "tax-hourly".to_string(),
                title: "Year-end tax follow-up".to_string(),
                status: WorkTaskStatus::Todo,
                priority: 20,
                due_at: None,
                reminder_minutes: Some(60),
                last_reminded_at: None,
                notes: Some(
                    "Hourly reminder until acknowledged, blocked, or completed.".to_string(),
                ),
                updated_at: now,
            },
            WorkTask {
                id: "hq-comms".to_string(),
                title: "HQ communications".to_string(),
                status: WorkTaskStatus::Todo,
                priority: 30,
                due_at: None,
                reminder_minutes: None,
                last_reminded_at: None,
                notes: Some("Event-driven HQ handoff and LIVE PASS status tracking.".to_string()),
                updated_at: now,
            },
        ],
        events: Vec::new(),
    }
}

use std::{path::PathBuf, sync::Arc};

use chrono::Utc;
use tokio::{fs, sync::RwLock};

use crate::{
    domain::work_ledger::{
        port::WorkLedgerRepository,
        work_ledger::{WorkLedger, WorkTask, WorkTaskStatus},
    },
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

    async fn persist(&self, ledger: &WorkLedger) -> Result<(), ApiError> {
        let raw = serde_json::to_string_pretty(ledger).map_err(ApiError::internal)?;
        fs::write(&*self.path, raw)
            .await
            .map_err(ApiError::internal)
    }
}

impl WorkLedgerRepository for WorkLedgerStore {
    async fn get(&self) -> WorkLedger {
        self.ledger.read().await.clone()
    }

    async fn save(&self, ledger: &WorkLedger) -> Result<(), String> {
        self.persist(ledger).await.map_err(|err| err.message)?;
        *self.ledger.write().await = ledger.clone();
        Ok(())
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

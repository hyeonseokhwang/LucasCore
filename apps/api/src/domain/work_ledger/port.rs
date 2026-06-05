// CA Phase 2 — domain/work_ledger port traits
use super::work_ledger::{WorkLedger, WorkTask, WorkTaskEvent};

pub trait WorkLedgerRepository: Send + Sync {
    fn get(&self) -> WorkLedger;
    fn upsert_task(&self, task: WorkTask) -> Result<(), String>;
    fn add_event(&self, event: WorkTaskEvent) -> Result<(), String>;
}

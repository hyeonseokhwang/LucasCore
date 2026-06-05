// CA Phase 2 — domain/work_ledger port traits
use super::work_ledger::WorkLedger;

pub trait WorkLedgerRepository: Send + Sync {
    async fn get(&self) -> WorkLedger;
    async fn save(&self, ledger: &WorkLedger) -> Result<(), String>;
}

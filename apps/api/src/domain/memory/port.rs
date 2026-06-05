// CA Phase 2 — domain/memory port traits
use super::memory::MemoryEntry;

#[derive(Debug, Clone, Default)]
pub struct MemorySearch {
    pub agent_id: Option<String>,
    pub scope: Option<String>,
    pub layer: Option<String>,
    pub kind: Option<String>,
    pub topic: Option<String>,
    pub search: Option<String>,
    pub include_archived: Option<bool>,
    pub limit: Option<usize>,
}

pub trait MemoryRepository: Send + Sync {
    async fn search(&self, query: &MemorySearch) -> Vec<MemoryEntry>;
    async fn save(&self, entry: MemoryEntry) -> Result<(), String>;
    async fn archive(&self, id: &str) -> Result<(), String>;
}

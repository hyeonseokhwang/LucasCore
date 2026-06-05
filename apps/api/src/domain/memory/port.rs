// CA Phase 2 — domain/memory port traits
use super::memory::MemoryEntry;

pub trait MemoryRepository: Send + Sync {
    fn find_by_agent(&self, agent_id: &str) -> Vec<MemoryEntry>;
    fn save(&self, entry: MemoryEntry) -> Result<(), String>;
    fn archive(&self, id: &str) -> Result<(), String>;
}

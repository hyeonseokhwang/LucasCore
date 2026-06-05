// CA Phase 2 — domain/os_agent port traits
use super::os_agent::{OsAgentAttachment, OsAgentRecord};

pub trait OsAgentRepository: Send + Sync {
    fn list(&self) -> Vec<OsAgentRecord>;
    fn find_by_id(&self, id: &str) -> Option<OsAgentRecord>;
    fn get_attachment(&self, id: &str) -> OsAgentAttachment;
    fn set_attachment(&self, id: &str, attached: bool) -> Result<(), String>;
}

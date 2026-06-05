// CA Phase 2 — domain/terminal port traits
use super::display::{SessionId, SessionMeta};

// stale 재주입 방지 3중 검증 — arum 조건 (HQ alive + PID + heartbeat)
pub struct AliveEvidence {
    pub hq_alive: bool,
    pub pid_exists: bool,
    pub heartbeat_age_secs: u64,
}

impl AliveEvidence {
    pub fn is_alive(&self) -> bool {
        self.hq_alive && self.pid_exists && self.heartbeat_age_secs < 300
    }
}

pub trait TerminalRepository: Send + Sync {
    fn find_by_id(&self, id: &SessionId) -> Option<SessionMeta>;
    fn list_all(&self) -> Vec<SessionMeta>;
    fn archive(&self, id: &SessionId) -> Result<(), String>;
    fn check_alive(&self, evidence: &AliveEvidence) -> bool {
        evidence.is_alive()
    }
}

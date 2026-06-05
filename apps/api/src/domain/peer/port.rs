// CA Phase 2 — domain/peer port traits
use super::peer::PeerMessage;

pub trait PeerRepository: Send + Sync {
    fn list(&self) -> Vec<PeerMessage>;
    fn append(&self, message: PeerMessage) -> Result<(), String>;
}

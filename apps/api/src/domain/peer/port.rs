// CA Phase 2 — domain/peer port traits
use super::peer::PeerMessage;

pub trait PeerRepository: Send + Sync {
    async fn list(&self) -> Vec<PeerMessage>;
    async fn append(&self, message: PeerMessage) -> Result<(), String>;
}

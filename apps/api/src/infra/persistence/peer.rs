use crate::{
    domain::peer::{peer::PeerMessage, port::PeerRepository},
    PeerStore,
};

impl PeerRepository for PeerStore {
    async fn list(&self) -> Vec<PeerMessage> {
        self.messages.read().await.clone()
    }

    async fn append(&self, message: PeerMessage) -> Result<(), String> {
        self.insert(message).await.map_err(|err| err.message)
    }
}

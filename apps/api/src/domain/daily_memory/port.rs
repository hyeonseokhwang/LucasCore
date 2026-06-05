use super::daily_memory::{DailyMemoryAppendReceipt, DailyMemoryCheckpoint, DailyMemoryDocument};

pub trait DailyMemoryRepository: Send + Sync {
    async fn read(&self, date: &str) -> Result<DailyMemoryDocument, String>;
    async fn append_checkpoint(
        &self,
        date: &str,
        checkpoint: DailyMemoryCheckpoint,
    ) -> Result<DailyMemoryAppendReceipt, String>;
}

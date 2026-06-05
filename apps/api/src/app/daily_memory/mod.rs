use crate::domain::daily_memory::{
    daily_memory::{DailyMemoryCheckpoint, DailyMemoryDocument},
    port::DailyMemoryRepository,
};

#[derive(Debug, Clone)]
pub struct AppendDailyMemoryCheckpointCommand {
    pub heading: Option<String>,
    pub content: Option<String>,
    pub source: Option<String>,
    pub tags: Option<Vec<String>>,
}

pub async fn read_document_usecase(
    repo: &impl DailyMemoryRepository,
    date: &str,
) -> Result<DailyMemoryDocument, String> {
    repo.read(date).await
}

pub async fn response_usecase(
    repo: &impl DailyMemoryRepository,
    date: &str,
) -> Result<serde_json::Value, String> {
    let document = repo.read(date).await?;
    Ok(serde_json::json!({
        "ok": true,
        "date": document.date,
        "path": document.path,
        "exists": document.exists,
        "content": document.content,
    }))
}

pub async fn append_checkpoint_usecase(
    repo: &impl DailyMemoryRepository,
    date: &str,
    input: AppendDailyMemoryCheckpointCommand,
) -> Result<serde_json::Value, String> {
    let checkpoint = DailyMemoryCheckpoint {
        heading: input.heading,
        content: require_field(input.content, "content")?,
        source: input.source,
        tags: input.tags,
    };
    let receipt = repo.append_checkpoint(date, checkpoint).await?;
    serde_json::to_value(receipt).map_err(|err| err.to_string())
}

fn require_field(value: Option<String>, field: &str) -> Result<String, String> {
    let Some(value) = value else {
        return Err(format!("{field} is required"));
    };
    if value.trim().is_empty() {
        return Err(format!("{field} is required"));
    }
    Ok(value)
}

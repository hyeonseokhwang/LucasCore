use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyMemoryDocument {
    pub date: String,
    pub path: String,
    pub exists: bool,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct DailyMemoryCheckpoint {
    pub heading: Option<String>,
    pub content: String,
    pub source: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyMemoryAppendReceipt {
    pub ok: bool,
    pub date: String,
    pub path: String,
    pub appended: bool,
    pub created: bool,
    pub at: DateTime<Utc>,
    pub heading: String,
    pub source: String,
    pub tags: Vec<String>,
}

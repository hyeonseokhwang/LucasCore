// CA Phase 2 — domain/canvas entities
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Canvas {
    pub id: String,
    pub title: String,
    pub owner: String,
    pub status: String,
    pub canvas_type: String,
    pub members: Vec<String>,
    pub linked_issues: Vec<String>,
    pub linked_meetings: Vec<String>,
    pub content: Vec<CanvasSection>,
    pub messages: Vec<CanvasMessage>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasSection {
    pub id: String,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasMessage {
    pub id: String,
    pub author: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

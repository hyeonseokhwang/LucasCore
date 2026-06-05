// CA Phase 2 — domain/os_agent entities
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsAgentRecord {
    pub id: String,
    pub name: String,
    pub team: String,
    pub cwd: String,
    pub cmd: String,
    pub args: Vec<String>,
    pub model: Option<String>,
    pub pid: Option<u32>,
    pub status: Option<String>,
    pub log_path: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub attach_url: Option<String>,
    pub control_url: Option<String>,
    pub write_url: Option<String>,
    pub log_url: Option<String>,
    pub resize_url: Option<String>,
    pub runner_endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OsAgentAttachment {
    pub attached: bool,
    pub updated_at: Option<DateTime<Utc>>,
}

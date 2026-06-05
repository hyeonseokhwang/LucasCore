// CA Phase 2 — domain/terminal display entities
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub type SessionId = String;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Active,
    Exited,
    Error,
    Stopped,
    Archived, // stale 세션 격리 — arum 조건
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMeta {
    pub id: SessionId,
    pub name: String,
    pub team: String,
    pub cwd: String,
    pub cmd: String,
    pub args: Vec<String>,
    pub model: Option<String>,
    pub status: SessionStatus,
    pub pid: Option<u32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Default)]
pub struct TerminalCell {
    pub ch: char,
    pub sgr: String,
}

#[derive(Debug, Clone)]
pub struct TerminalDisplaySnapshot {
    pub lines: Vec<Vec<TerminalCell>>,
    pub cursor_row: usize,
    pub cursor_col: usize,
    pub max_rows: usize,
    pub current_sgr: String,
}

// CTO 보강 #2: last_nonempty_display_snapshots 도메인 모델
// AppState.terminal_last_nonempty_snapshots(Arc<Mutex<HashMap<String,String>>>) 추상화
pub struct LastNonemptySnapshots(pub std::collections::HashMap<SessionId, String>);

impl LastNonemptySnapshots {
    pub fn new() -> Self {
        Self(std::collections::HashMap::new())
    }

    pub fn get(&self, session_id: &str) -> Option<&String> {
        self.0.get(session_id)
    }

    pub fn insert(&mut self, session_id: SessionId, snapshot: String) {
        self.0.insert(session_id, snapshot);
    }
}

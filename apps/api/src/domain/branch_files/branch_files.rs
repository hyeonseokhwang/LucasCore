use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct BranchFileEntry {
    pub name: String,
    #[serde(rename = "type")]
    pub entry_type: String,
    pub size: u64,
    pub modified: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BranchFileReadResult {
    pub ok: bool,
    pub path: String,
    pub content: String,
    pub total_lines: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct BranchFileListResult {
    pub ok: bool,
    pub path: String,
    pub entries: Vec<BranchFileEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BranchFileDiffResult {
    pub ok: bool,
    pub path: String,
    pub commit1: String,
    pub commit2: String,
    pub diff: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BranchGitCommit {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub date: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BranchGitLogResult {
    pub ok: bool,
    pub path: String,
    pub commits: Vec<BranchGitCommit>,
}

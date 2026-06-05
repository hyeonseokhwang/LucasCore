use super::branch_files::{
    BranchFileDiffResult, BranchFileListResult, BranchFileReadResult, BranchGitLogResult,
};

pub trait BranchFilesRepository: Send + Sync {
    async fn read_file(
        &self,
        path: Option<&str>,
        max_lines: usize,
    ) -> Result<BranchFileReadResult, String>;
    async fn list_dir(&self, path: Option<&str>) -> Result<BranchFileListResult, String>;
    async fn diff(
        &self,
        commit1: &str,
        commit2: &str,
        path: Option<&str>,
    ) -> Result<BranchFileDiffResult, String>;
    async fn git_log(&self, path: Option<&str>, limit: usize)
        -> Result<BranchGitLogResult, String>;
}

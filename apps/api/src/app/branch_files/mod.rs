use crate::domain::branch_files::{
    branch_files::{
        BranchFileDiffResult, BranchFileListResult, BranchFileReadResult, BranchGitLogResult,
    },
    port::BranchFilesRepository,
};

pub async fn read_usecase(
    repo: &impl BranchFilesRepository,
    path: Option<&str>,
    max_lines: Option<usize>,
) -> Result<BranchFileReadResult, String> {
    repo.read_file(path, max_lines.unwrap_or(200).clamp(1, 5000))
        .await
}

pub async fn list_usecase(
    repo: &impl BranchFilesRepository,
    path: Option<&str>,
) -> Result<BranchFileListResult, String> {
    repo.list_dir(path).await
}

pub async fn diff_usecase(
    repo: &impl BranchFilesRepository,
    commit1: &str,
    commit2: &str,
    path: Option<&str>,
) -> Result<BranchFileDiffResult, String> {
    validate_git_hashish(commit1)?;
    validate_git_hashish(commit2)?;
    repo.diff(commit1, commit2, path).await
}

pub async fn git_log_usecase(
    repo: &impl BranchFilesRepository,
    path: Option<&str>,
    limit: Option<usize>,
) -> Result<BranchGitLogResult, String> {
    repo.git_log(path, limit.unwrap_or(20).clamp(1, 100)).await
}

fn validate_git_hashish(value: &str) -> Result<(), String> {
    let valid = (7..=64).contains(&value.len()) && value.chars().all(|ch| ch.is_ascii_hexdigit());
    if valid {
        Ok(())
    } else {
        Err("bad_request:commit hash must be a 7-64 character hex value".to_string())
    }
}

use std::{
    env,
    path::{Component, Path as FsPath, PathBuf},
    process::Stdio,
};

use chrono::{DateTime, Utc};
use tokio::{fs, process::Command};

use crate::domain::branch_files::{
    branch_files::{
        BranchFileDiffResult, BranchFileEntry, BranchFileListResult, BranchFileReadResult,
        BranchGitCommit, BranchGitLogResult,
    },
    port::BranchFilesRepository,
};

#[derive(Debug, Clone, Copy)]
pub(crate) struct BranchFilesStore;

impl BranchFilesRepository for BranchFilesStore {
    async fn read_file(
        &self,
        path: Option<&str>,
        max_lines: usize,
    ) -> Result<BranchFileReadResult, String> {
        let resolved = resolve_branch_relative_path(path)?;
        let metadata = fs::metadata(&resolved.absolute)
            .await
            .map_err(internal_error)?;
        if !metadata.is_file() {
            return Err("bad_request:path must point to a file".to_string());
        }
        let content = fs::read_to_string(&resolved.absolute)
            .await
            .map_err(internal_error)?;
        let total_lines = content.lines().count();
        let selected: Vec<&str> = content.lines().take(max_lines).collect();
        let truncated = total_lines > selected.len();
        Ok(BranchFileReadResult {
            ok: true,
            path: resolved.relative,
            content: selected.join("\n"),
            total_lines,
            truncated,
        })
    }

    async fn list_dir(&self, path: Option<&str>) -> Result<BranchFileListResult, String> {
        let resolved = resolve_branch_relative_path(path)?;
        let metadata = fs::metadata(&resolved.absolute)
            .await
            .map_err(internal_error)?;
        if !metadata.is_dir() {
            return Err("bad_request:path must point to a directory".to_string());
        }
        let mut entries = Vec::new();
        let mut dir = fs::read_dir(&resolved.absolute)
            .await
            .map_err(internal_error)?;
        while let Some(entry) = dir.next_entry().await.map_err(internal_error)? {
            let name = entry.file_name().to_string_lossy().to_string();
            if is_denied_branch_path_segment(&name) {
                continue;
            }
            let metadata = entry.metadata().await.map_err(internal_error)?;
            let modified = metadata
                .modified()
                .ok()
                .map(|time| DateTime::<Utc>::from(time).to_rfc3339());
            entries.push(BranchFileEntry {
                name,
                entry_type: if metadata.is_dir() { "dir" } else { "file" }.to_string(),
                size: metadata.len(),
                modified,
            });
        }
        entries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
        Ok(BranchFileListResult {
            ok: true,
            path: resolved.relative,
            entries,
        })
    }

    async fn diff(
        &self,
        commit1: &str,
        commit2: &str,
        path: Option<&str>,
    ) -> Result<BranchFileDiffResult, String> {
        let resolved = resolve_branch_relative_path(path)?;
        let output = run_git_readonly(&[
            "diff",
            "--no-ext-diff",
            commit1,
            commit2,
            "--",
            resolved.relative.as_str(),
        ])
        .await?;
        Ok(BranchFileDiffResult {
            ok: true,
            path: resolved.relative,
            commit1: commit1.to_string(),
            commit2: commit2.to_string(),
            diff: output,
        })
    }

    async fn git_log(
        &self,
        path: Option<&str>,
        limit: usize,
    ) -> Result<BranchGitLogResult, String> {
        let resolved = resolve_branch_relative_path(path)?;
        let output = run_git_readonly(&[
            "log",
            "--date=iso-strict",
            "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e",
            "-n",
            &limit.to_string(),
            "--",
            resolved.relative.as_str(),
        ])
        .await?;
        let commits = output
            .split('\x1e')
            .filter_map(|record| {
                let record = record.trim_matches('\n');
                if record.is_empty() {
                    return None;
                }
                let parts: Vec<&str> = record.split('\x1f').collect();
                if parts.len() < 5 {
                    return None;
                }
                Some(BranchGitCommit {
                    hash: parts[0].to_string(),
                    short_hash: parts[1].to_string(),
                    author: parts[2].to_string(),
                    date: parts[3].to_string(),
                    subject: parts[4].to_string(),
                })
            })
            .collect();
        Ok(BranchGitLogResult {
            ok: true,
            path: resolved.relative,
            commits,
        })
    }
}

struct BranchResolvedPath {
    relative: String,
    absolute: PathBuf,
}

fn resolve_branch_relative_path(raw_path: Option<&str>) -> Result<BranchResolvedPath, String> {
    let raw_path = raw_path.unwrap_or(".").trim();
    let raw_path = if raw_path.is_empty() { "." } else { raw_path };
    let input = FsPath::new(raw_path);
    if input.is_absolute() {
        return Err("bad_request:absolute paths are not allowed".to_string());
    }
    let mut parts = Vec::new();
    for component in input.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(value) => {
                let segment = value
                    .to_str()
                    .ok_or_else(|| "bad_request:path must be valid UTF-8".to_string())?;
                if is_denied_branch_path_segment(segment) {
                    return Err(
                        "bad_request:path is outside the allowed branch file scope".to_string()
                    );
                }
                parts.push(segment.to_string());
            }
            Component::ParentDir => {
                return Err("bad_request:path traversal is not allowed".to_string())
            }
            _ => return Err("bad_request:unsupported path component".to_string()),
        }
    }
    let mut relative = PathBuf::new();
    for part in &parts {
        relative.push(part);
    }
    let relative_display = if parts.is_empty() {
        ".".to_string()
    } else {
        parts.join("/")
    };
    let root = env::current_dir().map_err(internal_error)?;
    let absolute = root.join(&relative);
    if !absolute.starts_with(&root) {
        return Err("bad_request:path is outside the repository root".to_string());
    }
    Ok(BranchResolvedPath {
        relative: relative_display,
        absolute,
    })
}

fn is_denied_branch_path_segment(segment: &str) -> bool {
    let lowered = segment.to_ascii_lowercase();
    lowered == ".git"
        || lowered == ".env"
        || lowered.ends_with(".env")
        || lowered.contains("secret")
        || lowered.contains("token")
        || lowered.contains("credential")
        || lowered.contains("private")
}

async fn run_git_readonly(args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .output()
        .await
        .map_err(internal_error)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "bad_request:{}",
            if stderr.is_empty() {
                "git command failed".to_string()
            } else {
                stderr
            }
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn internal_error(err: impl std::fmt::Display) -> String {
    format!("internal:{err}")
}

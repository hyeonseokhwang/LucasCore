use axum::{extract::Query, http::HeaderMap, Json};
use serde::Deserialize;
use serde_json::Value;

use crate::{app, infra, require_branch_token, ApiError};

#[derive(Debug, Deserialize)]
pub(crate) struct BranchFileReadQuery {
    path: Option<String>,
    max_lines: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct BranchFileListQuery {
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct BranchFileDiffQuery {
    commit1: String,
    commit2: String,
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct BranchGitLogQuery {
    limit: Option<usize>,
    path: Option<String>,
}

pub(crate) async fn branch_file_read(
    headers: HeaderMap,
    Query(query): Query<BranchFileReadQuery>,
) -> Result<Json<Value>, ApiError> {
    require_branch_token(&headers)?;
    let repo = infra::persistence::branch_files::BranchFilesStore;
    let result = app::branch_files::read_usecase(&repo, query.path.as_deref(), query.max_lines)
        .await
        .map_err(branch_files_error)?;
    serde_json::to_value(result)
        .map(Json)
        .map_err(ApiError::internal)
}

pub(crate) async fn branch_file_list(
    headers: HeaderMap,
    Query(query): Query<BranchFileListQuery>,
) -> Result<Json<Value>, ApiError> {
    require_branch_token(&headers)?;
    let repo = infra::persistence::branch_files::BranchFilesStore;
    let result = app::branch_files::list_usecase(&repo, query.path.as_deref())
        .await
        .map_err(branch_files_error)?;
    serde_json::to_value(result)
        .map(Json)
        .map_err(ApiError::internal)
}

pub(crate) async fn branch_file_diff(
    headers: HeaderMap,
    Query(query): Query<BranchFileDiffQuery>,
) -> Result<Json<Value>, ApiError> {
    require_branch_token(&headers)?;
    let repo = infra::persistence::branch_files::BranchFilesStore;
    let result = app::branch_files::diff_usecase(
        &repo,
        query.commit1.as_str(),
        query.commit2.as_str(),
        query.path.as_deref(),
    )
    .await
    .map_err(branch_files_error)?;
    serde_json::to_value(result)
        .map(Json)
        .map_err(ApiError::internal)
}

pub(crate) async fn branch_git_log(
    headers: HeaderMap,
    Query(query): Query<BranchGitLogQuery>,
) -> Result<Json<Value>, ApiError> {
    require_branch_token(&headers)?;
    let repo = infra::persistence::branch_files::BranchFilesStore;
    let result = app::branch_files::git_log_usecase(&repo, query.path.as_deref(), query.limit)
        .await
        .map_err(branch_files_error)?;
    serde_json::to_value(result)
        .map(Json)
        .map_err(ApiError::internal)
}

fn branch_files_error(err: String) -> ApiError {
    if let Some(message) = err.strip_prefix("bad_request:") {
        ApiError::bad_request(message)
    } else if let Some(message) = err.strip_prefix("internal:") {
        ApiError::internal(message)
    } else {
        ApiError::internal(err)
    }
}

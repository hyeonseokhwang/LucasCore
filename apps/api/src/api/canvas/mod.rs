use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde_json::Value;

use crate::{
    app::canvas::{
        self, AddCanvasMessageCommand, CreateCanvasCommand, InviteCanvasMemberCommand,
        UpdateCanvasCommand,
    },
    AddMessage, ApiError, AppState, Canvas, CanvasMessage, CanvasSection, CreateCanvas,
    InviteMember,
};

pub(crate) async fn list_canvases(State(state): State<AppState>) -> Json<Vec<Canvas>> {
    Json(canvas::list_usecase(&state.canvas_store).await)
}

pub(crate) async fn create_canvas(
    State(state): State<AppState>,
    Json(input): Json<CreateCanvas>,
) -> Result<(StatusCode, Json<Canvas>), ApiError> {
    let canvas = canvas::create_usecase(
        &state.canvas_store,
        CreateCanvasCommand {
            id: input.id,
            title: input.title,
            owner: input.owner,
            canvas_type: input.canvas_type,
            members: input.members,
            linked_issues: input.linked_issues,
            linked_meetings: input.linked_meetings,
            content: input.content,
        },
    )
    .await
    .map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(canvas)))
}

pub(crate) async fn get_canvas(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Canvas>, ApiError> {
    canvas::get_usecase(&state.canvas_store, &id)
        .await
        .map(Json)
        .ok_or_else(|| ApiError::not_found("canvas not found"))
}

pub(crate) async fn update_canvas(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(patch): Json<Value>,
) -> Result<Json<Canvas>, ApiError> {
    let canvas = canvas::update_usecase(
        &state.canvas_store,
        &id,
        UpdateCanvasCommand {
            title: patch
                .get("title")
                .and_then(Value::as_str)
                .map(str::to_string),
            owner: patch
                .get("owner")
                .and_then(Value::as_str)
                .map(str::to_string),
        },
    )
    .await
    .map_err(ApiError::internal)?;
    Ok(Json(canvas))
}

pub(crate) async fn get_content(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<CanvasSection>>, ApiError> {
    canvas::get_content_usecase(&state.canvas_store, &id)
        .await
        .map(Json)
        .map_err(ApiError::internal)
}

pub(crate) async fn put_content(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(content): Json<Vec<CanvasSection>>,
) -> Result<Json<Vec<CanvasSection>>, ApiError> {
    canvas::put_content_usecase(&state.canvas_store, &id, content)
        .await
        .map(Json)
        .map_err(ApiError::internal)
}

pub(crate) async fn get_messages(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<CanvasMessage>>, ApiError> {
    canvas::get_messages_usecase(&state.canvas_store, &id)
        .await
        .map(Json)
        .map_err(ApiError::internal)
}

pub(crate) async fn add_message(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<AddMessage>,
) -> Result<(StatusCode, Json<CanvasMessage>), ApiError> {
    let message = canvas::add_message_usecase(
        &state.canvas_store,
        &id,
        AddCanvasMessageCommand {
            author: input.author,
            body: input.body,
            message: input.message,
        },
    )
    .await
    .map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(message)))
}

pub(crate) async fn invite_member(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<InviteMember>,
) -> Result<Json<Canvas>, ApiError> {
    canvas::invite_member_usecase(
        &state.canvas_store,
        &id,
        InviteCanvasMemberCommand {
            member: input.member,
            agent: input.agent,
        },
    )
    .await
    .map(Json)
    .map_err(ApiError::internal)
}

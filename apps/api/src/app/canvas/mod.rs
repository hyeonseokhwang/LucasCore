use chrono::Utc;

use crate::domain::canvas::{
    canvas::{Canvas, CanvasMessage, CanvasSection},
    port::CanvasRepository,
};

#[derive(Debug, Clone)]
pub struct CreateCanvasCommand {
    pub id: Option<String>,
    pub title: Option<String>,
    pub owner: Option<String>,
    pub canvas_type: Option<String>,
    pub members: Option<Vec<String>>,
    pub linked_issues: Option<Vec<String>>,
    pub linked_meetings: Option<Vec<String>>,
    pub content: Option<Vec<CanvasSection>>,
}

#[derive(Debug, Clone)]
pub struct UpdateCanvasCommand {
    pub title: Option<String>,
    pub owner: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AddCanvasMessageCommand {
    pub author: Option<String>,
    pub body: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct InviteCanvasMemberCommand {
    pub member: Option<String>,
    pub agent: Option<String>,
}

pub async fn list_usecase(repo: &impl CanvasRepository) -> Vec<Canvas> {
    repo.list_all().await
}

pub async fn create_usecase(
    repo: &impl CanvasRepository,
    input: CreateCanvasCommand,
) -> Result<Canvas, String> {
    let now = Utc::now();
    let canvas = Canvas {
        id: input
            .id
            .unwrap_or_else(|| format!("canvas-{}", now.timestamp_millis())),
        title: input.title.unwrap_or_else(|| "Untitled Canvas".to_string()),
        owner: input.owner.unwrap_or_else(|| "Lucas".to_string()),
        status: "active".to_string(),
        canvas_type: input.canvas_type.unwrap_or_else(|| "issue".to_string()),
        members: input.members.unwrap_or_default(),
        linked_issues: input.linked_issues.unwrap_or_default(),
        linked_meetings: input.linked_meetings.unwrap_or_default(),
        content: input.content.unwrap_or_else(default_sections),
        messages: Vec::new(),
        created_at: now,
        updated_at: now,
    };
    repo.save(canvas.clone()).await?;
    Ok(canvas)
}

pub async fn get_usecase(repo: &impl CanvasRepository, id: &str) -> Option<Canvas> {
    repo.find_by_id(id).await
}

pub async fn update_usecase(
    repo: &impl CanvasRepository,
    id: &str,
    input: UpdateCanvasCommand,
) -> Result<Canvas, String> {
    let mut canvas = repo
        .find_by_id(id)
        .await
        .ok_or_else(|| "canvas not found".to_string())?;
    if let Some(title) = input.title {
        canvas.title = title;
    }
    if let Some(owner) = input.owner {
        canvas.owner = owner;
    }
    canvas.updated_at = Utc::now();
    repo.save(canvas.clone()).await?;
    Ok(canvas)
}

pub async fn get_content_usecase(
    repo: &impl CanvasRepository,
    id: &str,
) -> Result<Vec<CanvasSection>, String> {
    repo.find_by_id(id)
        .await
        .map(|canvas| canvas.content)
        .ok_or_else(|| "canvas not found".to_string())
}

pub async fn put_content_usecase(
    repo: &impl CanvasRepository,
    id: &str,
    content: Vec<CanvasSection>,
) -> Result<Vec<CanvasSection>, String> {
    repo.upsert_sections(id, content).await?;
    get_content_usecase(repo, id).await
}

pub async fn get_messages_usecase(
    repo: &impl CanvasRepository,
    id: &str,
) -> Result<Vec<CanvasMessage>, String> {
    repo.find_by_id(id)
        .await
        .map(|canvas| canvas.messages)
        .ok_or_else(|| "canvas not found".to_string())
}

pub async fn add_message_usecase(
    repo: &impl CanvasRepository,
    id: &str,
    input: AddCanvasMessageCommand,
) -> Result<CanvasMessage, String> {
    let mut canvas = repo
        .find_by_id(id)
        .await
        .ok_or_else(|| "canvas not found".to_string())?;
    let message = CanvasMessage {
        id: format!("msg-{}", Utc::now().timestamp_millis()),
        author: input.author.unwrap_or_else(|| "Lucas".to_string()),
        body: input.body.or(input.message).unwrap_or_default(),
        created_at: Utc::now(),
    };
    canvas.messages.push(message.clone());
    canvas.updated_at = Utc::now();
    repo.save(canvas).await?;
    Ok(message)
}

pub async fn invite_member_usecase(
    repo: &impl CanvasRepository,
    id: &str,
    input: InviteCanvasMemberCommand,
) -> Result<Canvas, String> {
    let mut canvas = repo
        .find_by_id(id)
        .await
        .ok_or_else(|| "canvas not found".to_string())?;
    let member = input.member.or(input.agent).unwrap_or_default();
    if !member.is_empty() && !canvas.members.contains(&member) {
        canvas.members.push(member);
    }
    canvas.updated_at = Utc::now();
    repo.save(canvas.clone()).await?;
    Ok(canvas)
}

fn default_sections() -> Vec<CanvasSection> {
    [
        "Problem",
        "Decision",
        "Tasks",
        "Evidence",
        "Terminal Agents",
    ]
    .into_iter()
    .map(|title| CanvasSection {
        id: title.to_lowercase().replace(' ', "-"),
        title: title.to_string(),
        body: String::new(),
    })
    .collect()
}

use chrono::Utc;

use crate::domain::canvas::{
    canvas::{Canvas, CanvasSection},
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

use chrono::{DateTime, Utc};

use crate::domain::memory::{
    memory::MemoryEntry,
    port::{MemoryRepository, MemorySearch},
};

#[derive(Debug, Clone, Default)]
pub struct MemoryQueryInput {
    pub agent_id: Option<String>,
    pub scope: Option<String>,
    pub layer: Option<String>,
    pub kind: Option<String>,
    pub topic: Option<String>,
    pub search: Option<String>,
    pub include_archived: Option<bool>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone)]
pub struct CreateMemoryCommand {
    pub id: Option<String>,
    pub at: Option<DateTime<Utc>>,
    pub agent_id: Option<String>,
    pub layer: Option<String>,
    pub scope: Option<String>,
    pub kind: Option<String>,
    pub topic: Option<String>,
    pub content: Option<String>,
    pub importance: Option<i32>,
    pub source: Option<String>,
    pub source_id: Option<String>,
    pub ledger_item: Option<String>,
    pub evidence_path: Option<String>,
    pub tags: Option<Vec<String>>,
}

pub async fn list_usecase(
    repo: &impl MemoryRepository,
    path: String,
    query: MemoryQueryInput,
) -> serde_json::Value {
    let entries = repo.search(&search_from_input(query)).await;
    serde_json::json!({
        "ok": true,
        "path": path,
        "count": entries.len(),
        "memories": entries
    })
}

pub async fn add_usecase(
    repo: &impl MemoryRepository,
    input: CreateMemoryCommand,
) -> Result<MemoryEntry, String> {
    let entry = MemoryEntry {
        id: input
            .id
            .unwrap_or_else(|| format!("mem-{}", Utc::now().timestamp_millis())),
        at: input.at.unwrap_or_else(Utc::now),
        agent_id: require_field(input.agent_id, "agent_id")?,
        layer: normalize_memory_layer(input.layer)?,
        scope: normalize_memory_scope(input.scope)?,
        kind: input
            .kind
            .unwrap_or_else(|| "note".to_string())
            .trim()
            .to_ascii_lowercase(),
        topic: input.topic.filter(|value| !value.trim().is_empty()),
        content: require_field(input.content, "content")?,
        importance: input.importance.unwrap_or(3).clamp(0, 10),
        source: input.source.unwrap_or_else(|| "manual".to_string()),
        source_id: input.source_id.filter(|value| !value.trim().is_empty()),
        ledger_item: input.ledger_item.filter(|value| !value.trim().is_empty()),
        evidence_path: input.evidence_path.filter(|value| !value.trim().is_empty()),
        tags: input.tags.unwrap_or_default(),
        archived_at: None,
    };
    repo.save(entry.clone()).await?;
    Ok(entry)
}

pub async fn recover_memories_usecase(
    repo: &impl MemoryRepository,
    agent_id: String,
    search: Option<String>,
    limit: usize,
) -> (Vec<MemoryEntry>, Vec<MemoryEntry>) {
    let personal = repo
        .search(&MemorySearch {
            agent_id: Some(agent_id),
            scope: None,
            layer: None,
            kind: None,
            topic: None,
            search: search.clone(),
            include_archived: Some(false),
            limit: Some(limit),
        })
        .await;
    let shared = repo
        .search(&MemorySearch {
            agent_id: None,
            scope: Some("team,global".to_string()),
            layer: None,
            kind: None,
            topic: None,
            search,
            include_archived: Some(false),
            limit: Some(limit),
        })
        .await;
    (personal, shared)
}

fn search_from_input(input: MemoryQueryInput) -> MemorySearch {
    MemorySearch {
        agent_id: input.agent_id,
        scope: input.scope,
        layer: input.layer,
        kind: input.kind,
        topic: input.topic,
        search: input.search,
        include_archived: input.include_archived,
        limit: input.limit,
    }
}

fn require_field(value: Option<String>, field: &str) -> Result<String, String> {
    let Some(value) = value else {
        return Err(format!("{field} is required"));
    };
    if value.trim().is_empty() {
        return Err(format!("{field} is required"));
    }
    Ok(value)
}

fn normalize_memory_layer(layer: Option<String>) -> Result<String, String> {
    let value = layer
        .unwrap_or_else(|| "working".to_string())
        .trim()
        .to_ascii_lowercase();
    if ["working", "short_term", "long_term"].contains(&value.as_str()) {
        Ok(value)
    } else {
        Err("layer must be working, short_term, or long_term".to_string())
    }
}

fn normalize_memory_scope(scope: Option<String>) -> Result<String, String> {
    let value = scope
        .unwrap_or_else(|| "personal".to_string())
        .trim()
        .to_ascii_lowercase();
    if ["personal", "team", "global"].contains(&value.as_str()) {
        Ok(value)
    } else {
        Err("scope must be personal, team, or global".to_string())
    }
}

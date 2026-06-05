use std::collections::HashSet;

use chrono::Utc;
use tokio::{fs, io::AsyncWriteExt};

use crate::{
    domain::memory::{
        memory::MemoryEntry,
        port::{MemoryRepository, MemorySearch},
    },
    MemoryStore,
};

impl MemoryRepository for MemoryStore {
    async fn search(&self, query: &MemorySearch) -> Vec<MemoryEntry> {
        let include_archived = query.include_archived.unwrap_or(false);
        let search = query
            .search
            .as_ref()
            .map(|value| value.to_ascii_lowercase());
        let scope_set: Option<HashSet<String>> = query.scope.as_ref().map(|value| {
            value
                .split(',')
                .map(|item| item.trim().to_ascii_lowercase())
                .filter(|item| !item.is_empty())
                .collect()
        });
        let mut entries: Vec<MemoryEntry> = self
            .entries
            .read()
            .await
            .iter()
            .filter(|entry| include_archived || entry.archived_at.is_none())
            .filter(|entry| {
                query
                    .agent_id
                    .as_ref()
                    .map(|agent_id| entry.agent_id == *agent_id)
                    .unwrap_or(true)
            })
            .filter(|entry| {
                scope_set
                    .as_ref()
                    .map(|scopes| scopes.contains(&entry.scope))
                    .unwrap_or(true)
            })
            .filter(|entry| {
                query
                    .layer
                    .as_ref()
                    .map(|layer| entry.layer == layer.trim().to_ascii_lowercase())
                    .unwrap_or(true)
            })
            .filter(|entry| {
                query
                    .kind
                    .as_ref()
                    .map(|kind| entry.kind == kind.trim().to_ascii_lowercase())
                    .unwrap_or(true)
            })
            .filter(|entry| {
                query
                    .topic
                    .as_ref()
                    .map(|topic| entry.topic.as_deref() == Some(topic.as_str()))
                    .unwrap_or(true)
            })
            .filter(|entry| {
                search
                    .as_ref()
                    .map(|needle| {
                        entry.content.to_ascii_lowercase().contains(needle)
                            || entry
                                .topic
                                .as_ref()
                                .map(|topic| topic.to_ascii_lowercase().contains(needle))
                                .unwrap_or(false)
                            || entry
                                .tags
                                .iter()
                                .any(|tag| tag.to_ascii_lowercase().contains(needle))
                            || entry
                                .ledger_item
                                .as_ref()
                                .map(|item| item.to_ascii_lowercase().contains(needle))
                                .unwrap_or(false)
                    })
                    .unwrap_or(true)
            })
            .cloned()
            .collect();
        entries.sort_by(|a, b| {
            b.importance
                .cmp(&a.importance)
                .then_with(|| b.at.cmp(&a.at))
        });
        entries.truncate(query.limit.unwrap_or(50).clamp(1, 500));
        entries
    }

    async fn save(&self, entry: MemoryEntry) -> Result<(), String> {
        let raw = serde_json::to_string(&entry).map_err(|err| err.to_string())?;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&*self.path)
            .await
            .map_err(|err| err.to_string())?;
        file.write_all(raw.as_bytes())
            .await
            .map_err(|err| err.to_string())?;
        file.write_all(b"\n").await.map_err(|err| err.to_string())?;
        file.flush().await.map_err(|err| err.to_string())?;
        self.entries.write().await.push(entry);
        Ok(())
    }

    async fn archive(&self, id: &str) -> Result<(), String> {
        let mut entries = self.entries.write().await;
        let Some(entry) = entries.iter_mut().find(|entry| entry.id == id) else {
            return Err("memory not found".to_string());
        };
        entry.archived_at = Some(Utc::now());
        let raw = entries
            .iter()
            .map(serde_json::to_string)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?
            .join("\n");
        fs::write(&*self.path, format!("{raw}\n"))
            .await
            .map_err(|err| err.to_string())
    }
}

use std::path::PathBuf;

use chrono::Utc;
use tokio::{fs, io::AsyncWriteExt};

use crate::{
    domain::daily_memory::{
        daily_memory::{DailyMemoryAppendReceipt, DailyMemoryCheckpoint, DailyMemoryDocument},
        port::DailyMemoryRepository,
    },
    DailyMemoryStore,
};

impl DailyMemoryRepository for DailyMemoryStore {
    async fn read(&self, date: &str) -> Result<DailyMemoryDocument, String> {
        let path = self.path_for_date(date)?;
        match fs::read_to_string(&path).await {
            Ok(content) => Ok(DailyMemoryDocument {
                date: date.to_string(),
                path: path.display().to_string(),
                exists: true,
                content,
            }),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(DailyMemoryDocument {
                date: date.to_string(),
                path: path.display().to_string(),
                exists: false,
                content: String::new(),
            }),
            Err(err) => Err(err.to_string()),
        }
    }

    async fn append_checkpoint(
        &self,
        date: &str,
        checkpoint: DailyMemoryCheckpoint,
    ) -> Result<DailyMemoryAppendReceipt, String> {
        let path = self.path_for_date(date)?;
        let existed = fs::try_exists(&path).await.map_err(|err| err.to_string())?;
        let at = Utc::now();
        let title = checkpoint
            .heading
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Checkpoint");
        let source = checkpoint
            .source
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("manual");
        let tags = checkpoint.tags.unwrap_or_default();
        let tags_line = if tags.is_empty() {
            String::new()
        } else {
            format!("- tags: {}\n", tags.join(", "))
        };
        let mut body = String::new();
        if !existed {
            body.push_str(&format!("# Daily Memory - {date}\n"));
        }
        body.push_str(&format!(
            "\n\n## {title} - {}\n\n- source: {source}\n{tags_line}\n{}\n",
            at.to_rfc3339(),
            checkpoint.content.trim()
        ));
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await
            .map_err(|err| err.to_string())?;
        file.write_all(body.as_bytes())
            .await
            .map_err(|err| err.to_string())?;
        file.flush().await.map_err(|err| err.to_string())?;
        Ok(DailyMemoryAppendReceipt {
            ok: true,
            date: date.to_string(),
            path: path.display().to_string(),
            appended: true,
            created: !existed,
            at,
            heading: title.to_string(),
            source: source.to_string(),
            tags,
        })
    }
}

impl DailyMemoryStore {
    fn path_for_date(&self, date: &str) -> Result<PathBuf, String> {
        validate_daily_memory_date(date)?;
        Ok(self.dir.join(format!("{date}.md")))
    }
}

fn validate_daily_memory_date(date: &str) -> Result<(), String> {
    let valid = date.len() == 10
        && date.as_bytes().get(4) == Some(&b'-')
        && date.as_bytes().get(7) == Some(&b'-')
        && date
            .chars()
            .enumerate()
            .all(|(idx, ch)| (idx == 4 || idx == 7) && ch == '-' || ch.is_ascii_digit());
    if valid {
        Ok(())
    } else {
        Err("date must use YYYY-MM-DD".to_string())
    }
}

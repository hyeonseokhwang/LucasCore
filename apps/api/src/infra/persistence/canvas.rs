use chrono::Utc;

use crate::{
    domain::canvas::{
        canvas::{Canvas, CanvasSection},
        port::CanvasRepository,
    },
    CanvasStore,
};

impl CanvasRepository for CanvasStore {
    async fn find_by_id(&self, id: &str) -> Option<Canvas> {
        self.canvases
            .read()
            .await
            .iter()
            .find(|canvas| canvas.id == id)
            .cloned()
    }

    async fn list_all(&self) -> Vec<Canvas> {
        self.canvases.read().await.clone()
    }

    async fn save(&self, canvas: Canvas) -> Result<(), String> {
        let mut canvases = self.canvases.write().await;
        if let Some(existing) = canvases
            .iter_mut()
            .find(|existing| existing.id == canvas.id)
        {
            *existing = canvas;
        } else {
            canvases.insert(0, canvas);
        }
        self.persist(&canvases).await.map_err(|err| err.message)
    }

    async fn upsert_sections(&self, id: &str, sections: Vec<CanvasSection>) -> Result<(), String> {
        self.update(id, |canvas| {
            canvas.content = sections;
            canvas.updated_at = Utc::now();
        })
        .await
        .map(|_| ())
        .map_err(|err| err.message)
    }

    async fn delete(&self, id: &str) -> Result<(), String> {
        let mut canvases = self.canvases.write().await;
        let before = canvases.len();
        canvases.retain(|canvas| canvas.id != id);
        if canvases.len() == before {
            return Err("canvas not found".to_string());
        }
        self.persist(&canvases).await.map_err(|err| err.message)
    }
}

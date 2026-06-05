// CA Phase 2 — domain/canvas port traits
use super::canvas::{Canvas, CanvasSection};

pub trait CanvasRepository: Send + Sync {
    async fn find_by_id(&self, id: &str) -> Option<Canvas>;
    async fn list_all(&self) -> Vec<Canvas>;
    async fn save(&self, canvas: Canvas) -> Result<(), String>;
    async fn upsert_sections(&self, id: &str, sections: Vec<CanvasSection>) -> Result<(), String>;
    async fn delete(&self, id: &str) -> Result<(), String>;
}

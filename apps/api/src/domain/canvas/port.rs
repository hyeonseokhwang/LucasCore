// CA Phase 2 — domain/canvas port traits
use super::canvas::{Canvas, CanvasSection};

pub trait CanvasRepository: Send + Sync {
    fn find_by_id(&self, id: &str) -> Option<Canvas>;
    fn list_all(&self) -> Vec<Canvas>;
    fn save(&self, canvas: Canvas) -> Result<(), String>;
    fn upsert_sections(&self, id: &str, sections: Vec<CanvasSection>) -> Result<(), String>;
    fn delete(&self, id: &str) -> Result<(), String>;
}

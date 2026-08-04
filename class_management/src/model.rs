use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Row shape of the `classrooms` table. `user_id` is a Clerk user id (e.g.
/// `user_2NNyzz...`), not a UUID — Clerk owns user identity now.
#[derive(Debug, Deserialize, Serialize, sqlx::FromRow)]
pub struct ClassroomModel {
    pub id: Uuid,
    pub user_id: String,
    pub subject: String,
    pub period: i16,
    pub boundary_width: i32,
    pub boundary_height: i32,
    pub created_time: Option<chrono::DateTime<chrono::Utc>>,
}

/// Row shape of the `students` table. `user_id` is a Clerk user id, not a UUID.
#[derive(Debug, Deserialize, Serialize, sqlx::FromRow)]
pub struct StudentModel {
    pub id: Uuid,
    pub user_id: String,
    pub classroom_id: Option<Uuid>,
    pub student_id: i32,
    pub name: String,
    pub created_time: Option<chrono::DateTime<chrono::Utc>>,
}

/// Row shape of the `tables` table. Handlers build `TableSchema` directly
/// instead of deserializing into this; it's only used by test helpers.
#[allow(dead_code)]
#[derive(Debug, Deserialize, Serialize, sqlx::FromRow)]
pub struct TableModel {
    pub id: Uuid,
    pub classroom_id: Uuid,
    pub table_number: i32,
    pub rows: i16,
    pub cols: i16,
    pub x_pos: i32,
    pub y_pos: i32,
}

/// Row shape of the `seats` table. Handlers build `TableSchema` directly
/// instead of deserializing into this; it's only used by test helpers.
#[allow(dead_code)]
#[derive(Debug, Deserialize, Serialize, sqlx::FromRow)]
pub struct SeatModel {
    pub id: Uuid,
    pub table_id: Uuid,
    pub student_id: Option<Uuid>,
    pub seat_number: i16,
}

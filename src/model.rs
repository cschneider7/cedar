use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Row shape of the `classrooms` table
#[derive(Debug, Deserialize, Serialize, postgres_from_row::FromRow)]
pub struct ClassroomModel {
    pub id: Uuid,
    pub user_id: String,
    pub subject: String,
    pub period: i16,
    pub term_season: String,
    pub term_year: i16,
    pub boundary_width: i32,
    pub boundary_height: i32,
    pub created_time: Option<chrono::DateTime<chrono::Utc>>,
    pub pinned_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Row shape of the `students` table
#[derive(Debug, Deserialize, Serialize, postgres_from_row::FromRow)]
pub struct StudentModel {
    pub id: Uuid,
    pub user_id: String,
    pub classroom_id: Option<Uuid>,
    pub student_id: i32,
    pub name: String,
    pub image_url: Option<String>,
    pub created_time: Option<chrono::DateTime<chrono::Utc>>,
    pub seating_preference: Option<String>,
}

/// Row shape of the `student_separations` table
#[derive(Debug, Deserialize, Serialize, postgres_from_row::FromRow)]
pub struct StudentSeparationModel {
    pub id: Uuid,
    pub user_id: String,
    pub student_id_a: Uuid,
    pub student_id_b: Uuid,
    pub created_time: Option<chrono::DateTime<chrono::Utc>>,
}

/// Row shape of the `tables` table
#[derive(Debug, Deserialize, Serialize, postgres_from_row::FromRow)]
pub struct TableModel {
    pub id: Uuid,
    pub classroom_id: Uuid,
    pub table_number: i32,
    pub rows: i16,
    pub cols: i16,
    pub x_pos: i32,
    pub y_pos: i32,
}

/// Row shape of the `seats` table
#[derive(Debug, Deserialize, Serialize, postgres_from_row::FromRow)]
pub struct SeatModel {
    pub id: Uuid,
    pub table_id: Uuid,
    pub student_id: Option<Uuid>,
    pub seat_number: i16,
}

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Row shape of the `users` table. Never serialized directly in a response —
/// handlers hand-build a `{"id", "email"}` JSON literal instead, so
/// `password_hash` can't leak via a stray `Json(user)`.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserModel {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub email_verified: bool,
    pub failed_login_attempts: i16,
    pub locked_until: Option<chrono::DateTime<chrono::Utc>>,
    pub last_verification_email_sent_at: Option<chrono::DateTime<chrono::Utc>>,
    #[allow(dead_code)]
    pub created_time: Option<chrono::DateTime<chrono::Utc>>,
}

impl axum_login::AuthUser for UserModel {
    type Id = Uuid;

    fn id(&self) -> Self::Id {
        self.id
    }

    fn session_auth_hash(&self) -> &[u8] {
        self.password_hash.as_bytes()
    }
}

/// Row shape of the `verification_tokens` table. Handlers query only the
/// columns they need directly; this exists for test helpers that need the
/// raw token row (e.g. reading a token straight out of the table).
#[allow(dead_code)]
#[derive(Debug, sqlx::FromRow)]
pub struct VerificationTokenModel {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub purpose: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub used_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_time: Option<chrono::DateTime<chrono::Utc>>,
}

/// Row shape of the `classrooms` table.
#[derive(Debug, Deserialize, Serialize, sqlx::FromRow)]
pub struct ClassroomModel {
    pub id: Uuid,
    pub user_id: Uuid,
    pub subject: String,
    pub period: i16,
    pub boundary_width: i32,
    pub boundary_height: i32,
    pub created_time: Option<chrono::DateTime<chrono::Utc>>,
}

/// Row shape of the `students` table.
#[derive(Debug, Deserialize, Serialize, sqlx::FromRow)]
pub struct StudentModel {
    pub id: Uuid,
    pub user_id: Uuid,
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

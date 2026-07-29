use serde::{Deserialize, Deserializer, Serialize};
use uuid::Uuid;

/// Distinguishes a field that is missing from the request body (keep the
/// existing value) from one explicitly set to `null` (clear it)
fn deserialize_some<'de, T, D>(deserializer: D) -> Result<Option<T>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

/// Request body for signing up.
#[derive(Serialize, Deserialize, Debug)]
pub struct SignupSchema {
    pub email: String,
    pub password: String,
}

/// Request body for logging in.
#[derive(Serialize, Deserialize, Debug)]
pub struct LoginSchema {
    pub email: String,
    pub password: String,
}

/// Request body for requesting a new verification email.
#[derive(Serialize, Deserialize, Debug)]
pub struct ResendVerificationSchema {
    pub email: String,
}

/// Request body for verifying an email address.
#[derive(Serialize, Deserialize, Debug)]
pub struct VerifyEmailSchema {
    pub token: String,
}

/// Request body for requesting a password reset email.
#[derive(Serialize, Deserialize, Debug)]
pub struct ForgotPasswordSchema {
    pub email: String,
}

/// Request body for resetting a password with a reset token.
#[derive(Serialize, Deserialize, Debug)]
pub struct ResetPasswordSchema {
    pub token: String,
    pub password: String,
}

/// Request body for creating a classroom; boundary dimensions are not
/// accepted here and instead take their DB column defaults.
#[derive(Serialize, Deserialize, Debug)]
pub struct ClassroomSchema {
    pub subject: String,
    pub period: i16,
}

/// Request body for partially updating a classroom; omitted fields keep
/// their existing value.
#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateClassroomSchema {
    pub subject: Option<String>,
    pub period: Option<i16>,
    pub boundary_width: Option<i32>,
    pub boundary_height: Option<i32>,
}

/// Request body for creating a student.
#[derive(Serialize, Deserialize, Debug)]
pub struct StudentSchema {
    pub classroom_id: Option<Uuid>,
    pub student_id: i32,
    pub name: String,
}

/// Request body for partially updating a student; omitted fields keep their
/// existing value, while an explicit `null` `classroom_id` clears it.
#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateStudentSchema {
    #[serde(default, deserialize_with = "deserialize_some")]
    pub classroom_id: Option<Option<Uuid>>,
    pub student_id: Option<i32>,
    pub name: Option<String>,
}

/// A classroom's entire seating chart
#[derive(Serialize, Deserialize, Debug)]
pub struct SeatingChartSchema {
    pub boundary_width: i32,
    pub boundary_height: i32,
    pub tables: Vec<TableSchema>,
}

/// A single table's grid shape, canvas position, and seat assignments; a
/// seat's index within `seat_assignments` is its `seat_number`.
#[derive(Serialize, Deserialize, Debug)]
pub struct TableSchema {
    pub table_number: i32,
    pub rows: i16,
    pub cols: i16,
    pub x_pos: i32,
    pub y_pos: i32,
    pub seat_assignments: Vec<Option<Uuid>>,
}

/// Request body for proposing a randomized seating chart. Carries the
/// frontend's current, possibly-unsaved canvas geometry rather than relying
/// on persisted state, since the proposal is never itself persisted.
#[derive(Serialize, Deserialize, Debug)]
pub struct RandomizeSeatingChartSchema {
    pub keep_existing_tables: bool,
    pub new_table_rows: i16,
    pub new_table_cols: i16,
    pub existing_tables: Vec<crate::seating_chart::TableGeometry>,
    pub boundary_width: i32,
    pub boundary_height: i32,
}

/// A single student's current cold-call pick weight.
#[derive(Serialize, Deserialize, Debug)]
pub struct ColdCallCandidateSchema {
    pub student_id: Uuid,
    pub weight: u32,
}

/// Request body for picking a cold-call student. Carries the frontend's
/// current per-student weights rather than relying on persisted state, since
/// weights are never themselves persisted.
#[derive(Serialize, Deserialize, Debug)]
pub struct ColdCallSchema {
    pub students: Vec<ColdCallCandidateSchema>,
}

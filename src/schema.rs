use chrono::{DateTime, Utc};
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

/// A classroom's term season, paired with `term_year` to form e.g. "Fall 2026".
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TermSeason {
    Fall,
    Winter,
    Spring,
    Summer,
}

impl TermSeason {
    /// The lowercase string stored in the `term_season` DB column.
    pub fn as_str(&self) -> &'static str {
        match self {
            TermSeason::Fall => "fall",
            TermSeason::Winter => "winter",
            TermSeason::Spring => "spring",
            TermSeason::Summer => "summer",
        }
    }
}

/// A student's seating preference (front or back of classroom).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SeatingPreference {
    Front,
    Back,
}

impl SeatingPreference {
    /// The lowercase string stored in the `seating_preference` DB column.
    pub fn as_str(&self) -> &'static str {
        match self {
            SeatingPreference::Front => "front",
            SeatingPreference::Back => "back",
        }
    }

    /// Parses the lowercase string stored in the `seating_preference` DB
    /// column back into a `SeatingPreference`, or `None` if it doesn't match.
    pub fn from_db_str(s: &str) -> Option<Self> {
        match s {
            "front" => Some(SeatingPreference::Front),
            "back" => Some(SeatingPreference::Back),
            _ => None,
        }
    }
}

/// Request body for creating a classroom; boundary dimensions are not
/// accepted here and instead take their DB column defaults.
#[derive(Serialize, Deserialize, Debug)]
pub struct ClassroomSchema {
    pub subject: String,
    pub period: i16,
    pub term_season: TermSeason,
    pub term_year: i16,
}

/// Request body for partially updating a classroom; omitted fields keep
/// their existing value.
#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateClassroomSchema {
    pub subject: Option<String>,
    pub period: Option<i16>,
    pub term_season: Option<TermSeason>,
    pub term_year: Option<i16>,
    pub boundary_width: Option<i32>,
    pub boundary_height: Option<i32>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub pinned_at: Option<Option<DateTime<Utc>>>,
}

/// Request body for creating a student.
#[derive(Serialize, Deserialize, Debug)]
pub struct StudentSchema {
    pub classroom_id: Option<Uuid>,
    pub student_id: i32,
    pub name: String,
    pub image_url: Option<String>,
    pub seating_preference: Option<SeatingPreference>,
}

/// Request body for partially updating a student; omitted fields keep their
/// existing value, while an explicit `null` `classroom_id`/`image_url`/
/// `seating_preference` clears it.
#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateStudentSchema {
    #[serde(default, deserialize_with = "deserialize_some")]
    pub classroom_id: Option<Option<Uuid>>,
    pub student_id: Option<i32>,
    pub name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub image_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub seating_preference: Option<Option<SeatingPreference>>,
}

/// A column `GET /api/v1/students` can sort by.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StudentSortBy {
    Name,
    StudentId,
    Classroom,
}

/// Sort direction for `GET /api/v1/students`.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SortDir {
    Asc,
    Desc,
}

/// Optional query params for `GET /api/v1/students`. Omitting all five
/// preserves the endpoint's original unpaginated, full-roster behavior.
#[derive(Deserialize, Debug)]
pub struct StudentListParams {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub q: Option<String>,
    pub sort_by: Option<StudentSortBy>,
    pub sort_dir: Option<SortDir>,
}

/// Request body for bulk-deleting students by uuid.
#[derive(Serialize, Deserialize, Debug)]
pub struct BulkDeleteStudentsSchema {
    pub ids: Vec<Uuid>,
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
#[derive(Serialize, Deserialize, Debug, sqlx::FromRow)]
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

/// Request body for creating a "keep apart" separation between two students.
#[derive(Serialize, Deserialize, Debug)]
pub struct CreateSeparationSchema {
    pub student_id_a: Uuid,
    pub student_id_b: Uuid,
}

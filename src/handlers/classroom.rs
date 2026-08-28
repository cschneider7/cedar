use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use postgres_from_row::FromRow;
use serde_json::json;
use tokio_postgres::types::Type;
use uuid::Uuid;

use crate::{
    AppState,
    auth::CurrentUserId,
    cold_call,
    error::AppError,
    model::ClassroomModel,
    schema::{
        ClassroomSchema, ColdCallCandidateSchema, ColdCallSchema, RandomizeSeatingChartSchema,
        SeatingChartSchema, SeatingPreference, TableSchema, UpdateClassroomSchema,
    },
    seating_chart::{self, MAX_TABLE_DIMENSION},
};

const MAX_CLASSROOMS_PER_USER: i64 = 50;
const MAX_PINNED_CLASSROOMS_PER_USER: i64 = 10;

fn not_found(what: &str) -> AppError {
    AppError::NotFound(format!("{what} not found"))
}

/// Rejects a new classroom if `user_id` is already at `MAX_CLASSROOMS_PER_USER`.
async fn check_classroom_limit(
    client: &tokio_postgres::Client,
    user_id: &str,
) -> Result<(), AppError> {
    let count: i64 = client
        .query_typed_one(
            "SELECT COUNT(*) FROM classrooms WHERE user_id = $1",
            &[(&user_id, Type::TEXT)],
        )
        .await?
        .get(0);
    if count >= MAX_CLASSROOMS_PER_USER {
        return Err(AppError::BadRequest(
            "Classroom limit reached (50 classrooms per account).".to_string(),
        ));
    }
    Ok(())
}

/// Rejects newly pinning a classroom if user reached maximum pinned number
async fn check_pinned_classroom_limit(
    client: &tokio_postgres::Client,
    user_id: &str,
) -> Result<(), AppError> {
    let count: i64 = client
        .query_typed_one(
            "SELECT COUNT(*) FROM classrooms WHERE user_id = $1 AND pinned_at IS NOT NULL",
            &[(&user_id, Type::TEXT)],
        )
        .await?
        .get(0);
    if count >= MAX_PINNED_CLASSROOMS_PER_USER {
        return Err(AppError::BadRequest(
            "Pinned classroom limit reached (10 pinned classrooms per account).".to_string(),
        ));
    }
    Ok(())
}

/// Lists every classroom owned by the current user, ordered by period.
pub async fn classroom_list_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;
    let rows = conn
        .query_typed(
            "SELECT * FROM classrooms WHERE user_id = $1 ORDER BY period",
            &[(&user_id, Type::TEXT)],
        )
        .await?;
    let classrooms = rows
        .iter()
        .map(ClassroomModel::try_from_row)
        .collect::<Result<Vec<_>, _>>()?;

    Ok((StatusCode::OK, Json(json!({"data": classrooms}))))
}

/// Fetches a single classroom by its uuid, scoped to the current user.
pub async fn get_classroom_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;
    let row = conn
        .query_typed_opt(
            "SELECT * FROM classrooms WHERE id = $1 AND user_id = $2",
            &[(&id, Type::UUID), (&user_id, Type::TEXT)],
        )
        .await?
        .ok_or_else(|| not_found("Classroom"))?;
    let classroom = ClassroomModel::try_from_row(&row)?;

    Ok((StatusCode::OK, Json(json!({"data": classroom}))))
}

/// Creates a new classroom owned by the current user
pub async fn create_classroom_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
    Json(body): Json<ClassroomSchema>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;
    check_classroom_limit(&conn, &user_id).await?;

    let term_season = body.term_season.as_str();
    let row = conn
        .query_typed_one(
            "INSERT INTO classrooms (
            user_id,
            subject,
            period,
            term_season,
            term_year
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *",
            &[
                (&user_id, Type::TEXT),
                (&body.subject, Type::TEXT),
                (&body.period, Type::INT2),
                (&term_season, Type::TEXT),
                (&body.term_year, Type::INT2),
            ],
        )
        .await?;
    let classroom = ClassroomModel::try_from_row(&row)?;

    Ok((StatusCode::CREATED, Json(json!({"data": classroom}))))
}

/// Partially updates a classroom
pub async fn update_classroom_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
    Json(body): Json<UpdateClassroomSchema>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;
    let row = conn
        .query_typed_opt(
            "SELECT * FROM classrooms WHERE id = $1 AND user_id = $2",
            &[(&id, Type::UUID), (&user_id, Type::TEXT)],
        )
        .await?
        .ok_or_else(|| not_found("Classroom"))?;
    let classroom = ClassroomModel::try_from_row(&row)?;

    let new_subject = body.subject.as_ref().unwrap_or(&classroom.subject).as_str();
    let new_period = body.period.unwrap_or(classroom.period);
    let new_term_season = body
        .term_season
        .map(|s| s.as_str())
        .unwrap_or(&classroom.term_season);
    let new_term_year = body.term_year.unwrap_or(classroom.term_year);
    let new_boundary_width = body.boundary_width.unwrap_or(classroom.boundary_width);
    let new_boundary_height = body.boundary_height.unwrap_or(classroom.boundary_height);
    let new_pinned_at = body.pinned_at.unwrap_or(classroom.pinned_at);

    if classroom.pinned_at.is_none() && new_pinned_at.is_some() {
        check_pinned_classroom_limit(&conn, &user_id).await?;
    }

    let row = conn
        .query_typed_one(
            "UPDATE classrooms SET
            subject = $1,
            period = $2,
            term_season = $3,
            term_year = $4,
            boundary_width = $5,
            boundary_height = $6,
            pinned_at = $7
        WHERE id = $8
        RETURNING *",
            &[
                (&new_subject, Type::TEXT),
                (&new_period, Type::INT2),
                (&new_term_season, Type::TEXT),
                (&new_term_year, Type::INT2),
                (&new_boundary_width, Type::INT4),
                (&new_boundary_height, Type::INT4),
                (&new_pinned_at, Type::TIMESTAMPTZ),
                (&classroom.id, Type::UUID),
            ],
        )
        .await?;
    let updated_classroom = ClassroomModel::try_from_row(&row)?;

    Ok((StatusCode::OK, Json(json!({"data": updated_classroom}))))
}

/// Deletes a classroom by its uuid
pub async fn delete_classroom_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;
    let row = conn
        .query_typed_opt(
            "DELETE FROM classrooms WHERE id = $1 AND user_id = $2 RETURNING *",
            &[(&id, Type::UUID), (&user_id, Type::TEXT)],
        )
        .await?
        .ok_or_else(|| not_found("Classroom"))?;
    let classroom = ClassroomModel::try_from_row(&row)?;

    Ok((StatusCode::OK, Json(json!({"data": classroom}))))
}

/// Fetches a classroom's seating chart
pub async fn get_seating_chart_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(classroom_id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;

    let classroom_row = conn
        .query_typed_opt(
            "SELECT boundary_width, boundary_height FROM classrooms WHERE id = $1 AND user_id = $2",
            &[(&classroom_id, Type::UUID), (&user_id, Type::TEXT)],
        )
        .await?
        .ok_or_else(|| not_found("Classroom"))?;
    let boundary_width: i32 = classroom_row.try_get("boundary_width")?;
    let boundary_height: i32 = classroom_row.try_get("boundary_height")?;

    let table_rows = conn
        .query_typed(
            r#"SELECT
            t.table_number,
            t.rows,
            t.cols,
            t.x_pos,
            t.y_pos,
            ARRAY_AGG(s.student_id ORDER BY s.seat_number) as "seat_assignments"
        FROM tables t
        INNER JOIN seats s ON (t.id = s.table_id)
        WHERE t.classroom_id = $1
        GROUP BY t.table_number, t.rows, t.cols, t.x_pos, t.y_pos
        "#,
            &[(&classroom_id, Type::UUID)],
        )
        .await?;
    let tables = table_rows
        .iter()
        .map(TableSchema::try_from_row)
        .collect::<Result<Vec<_>, _>>()?;

    let response = json!({
        "data": {
            "classroom_id": classroom_id,
            "boundary_width": boundary_width,
            "boundary_height": boundary_height,
            "tables": tables
        }
    });
    Ok((StatusCode::OK, Json(response)))
}

/// Replaces a classroom's seating chart
pub async fn update_seating_chart_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(classroom_id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
    Json(body): Json<SeatingChartSchema>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = data.db.get().await?;
    let tx = conn.transaction().await?;

    let updated = tx
        .execute_typed(
            "UPDATE classrooms SET boundary_width = $1, boundary_height = $2 WHERE id = $3 AND user_id = $4",
            &[
                (&body.boundary_width, Type::INT4),
                (&body.boundary_height, Type::INT4),
                (&classroom_id, Type::UUID),
                (&user_id, Type::TEXT),
            ],
        )
        .await?;
    if updated == 0 {
        return Err(AppError::NotFound("Classroom not found".to_string()));
    }

    tx.execute_typed(
        "DELETE FROM tables WHERE classroom_id = $1",
        &[(&classroom_id, Type::UUID)],
    )
    .await?;

    let mut chart_tables: Vec<TableSchema> = Vec::new();
    for (index, table) in body.tables.iter().enumerate() {
        let table_number = index as i32;

        let table_id: Uuid = tx
            .query_typed_one(
                "INSERT INTO tables (classroom_id, table_number, rows, cols, x_pos, y_pos)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id",
                &[
                    (&classroom_id, Type::UUID),
                    (&table_number, Type::INT4),
                    (&table.rows, Type::INT2),
                    (&table.cols, Type::INT2),
                    (&table.x_pos, Type::INT4),
                    (&table.y_pos, Type::INT4),
                ],
            )
            .await?
            .get("id");

        for (index, student_id) in table.seat_assignments.iter().enumerate() {
            let seat_number = index as i16;

            tx.execute_typed(
                "INSERT INTO seats (table_id, student_id, seat_number)
                VALUES ($1, $2, $3)",
                &[
                    (&table_id, Type::UUID),
                    (student_id, Type::UUID),
                    (&seat_number, Type::INT2),
                ],
            )
            .await?;
        }

        let chart_table = TableSchema {
            table_number,
            rows: table.rows,
            cols: table.cols,
            x_pos: table.x_pos,
            y_pos: table.y_pos,
            seat_assignments: table.seat_assignments.clone(),
        };
        chart_tables.push(chart_table);
    }

    tx.commit().await?;

    let response = json!({
        "data": {
            "classroom_id": classroom_id,
            "boundary_width": body.boundary_width,
            "boundary_height": body.boundary_height,
            "tables": chart_tables
        }
    });
    Ok((StatusCode::OK, Json(response)))
}

/// Proposes a randomized seating chart for a classroom's current roster and canvas
pub async fn randomize_seating_chart_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(classroom_id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
    Json(body): Json<RandomizeSeatingChartSchema>,
) -> Result<impl IntoResponse, AppError> {
    let dimensions_in_range = |rows: i16, cols: i16| {
        (1..=MAX_TABLE_DIMENSION).contains(&rows) && (1..=MAX_TABLE_DIMENSION).contains(&cols)
    };
    let existing_dimensions_valid = body
        .existing_tables
        .iter()
        .all(|t| dimensions_in_range(t.rows, t.cols));
    if !dimensions_in_range(body.new_table_rows, body.new_table_cols) || !existing_dimensions_valid
    {
        return Err(AppError::BadRequest(format!(
            "new_table_rows and new_table_cols must be between 1 and {}",
            MAX_TABLE_DIMENSION
        )));
    }

    let conn = data.db.get().await?;

    conn.query_typed_opt(
        "SELECT 1 FROM classrooms WHERE id = $1 AND user_id = $2",
        &[(&classroom_id, Type::UUID), (&user_id, Type::TEXT)],
    )
    .await?
    .ok_or_else(|| not_found("Classroom"))?;

    let student_rows = conn
        .query_typed(
            "SELECT id, seating_preference FROM students WHERE classroom_id = $1",
            &[(&classroom_id, Type::UUID)],
        )
        .await?;
    let students: Vec<(Uuid, Option<SeatingPreference>)> = student_rows
        .iter()
        .map(|row| {
            let id: Uuid = row.try_get("id")?;
            let seating_preference: Option<String> = row.try_get("seating_preference")?;
            Ok((
                id,
                seating_preference.and_then(|s| SeatingPreference::from_db_str(&s)),
            ))
        })
        .collect::<Result<_, AppError>>()?;

    let roster_ids: Vec<Uuid> = students.iter().map(|(id, _)| *id).collect();
    let separation_rows = conn
        .query_typed(
            "SELECT student_id_a, student_id_b FROM student_separations
        WHERE student_id_a = ANY($1) AND student_id_b = ANY($1)",
            &[(&roster_ids, Type::UUID_ARRAY)],
        )
        .await?;
    let separations: Vec<(Uuid, Uuid)> = separation_rows
        .iter()
        .map(|row| Ok((row.try_get("student_id_a")?, row.try_get("student_id_b")?)))
        .collect::<Result<_, AppError>>()?;

    let tables = seating_chart::build_randomized_chart(
        students,
        separations,
        body.keep_existing_tables,
        body.existing_tables,
        body.new_table_rows,
        body.new_table_cols,
        body.boundary_width,
        body.boundary_height,
    )
    .map_err(|_| {
        AppError::BadRequest(
            "Not enough room to fit the required tables within the seating chart boundary"
                .to_string(),
        )
    })?;

    Ok((
        StatusCode::OK,
        Json(json!({"data": {
            "boundary_width": body.boundary_width,
            "boundary_height": body.boundary_height,
            "tables": tables
        }})),
    ))
}

/// Picks a random student for a cold call from the given weighted roster,
/// then returns adjusted weights for the next pick
pub async fn cold_call_handler(
    CurrentUserId(_user_id): CurrentUserId,
    Path(_classroom_id): Path<Uuid>,
    Json(body): Json<ColdCallSchema>,
) -> Result<impl IntoResponse, AppError> {
    let candidates: Vec<(Uuid, u32)> = body
        .students
        .iter()
        .map(|c| (c.student_id, c.weight))
        .collect();

    let (picked_student_id, updated) = cold_call::pick_cold_call_student(candidates)
        .map_err(|_| AppError::BadRequest("The student list must not be empty".to_string()))?;

    let students: Vec<ColdCallCandidateSchema> = updated
        .into_iter()
        .map(|(student_id, weight)| ColdCallCandidateSchema { student_id, weight })
        .collect();

    Ok((
        StatusCode::OK,
        Json(json!({"data": {
            "picked_student_id": picked_student_id,
            "students": students
        }})),
    ))
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;
    use serde_json::json;
    use tokio_postgres::types::Type;
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;
    use crate::{
        model::{SeatModel, TableModel},
        test_support::{
            app, authenticated_json_request, authenticated_request, body_json, insert_classroom,
            seed_all, seed_exec, seed_one, seed_opt, seed_scalar, test_user_id,
        },
    };

    async fn fetch_classroom(pool: &crate::db::Db, id: Uuid) -> Option<ClassroomModel> {
        seed_opt(
            pool,
            "SELECT * FROM classrooms WHERE id = $1",
            &[(&id, Type::UUID)],
        )
        .await
    }

    async fn insert_table(
        pool: &crate::db::Db,
        classroom_id: Uuid,
        table_number: i32,
        rows: i16,
        cols: i16,
        x_pos: i32,
        y_pos: i32,
    ) -> TableModel {
        seed_one(
            pool,
            "INSERT INTO tables (classroom_id, table_number, rows, cols, x_pos, y_pos)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *",
            &[
                (&classroom_id, Type::UUID),
                (&table_number, Type::INT4),
                (&rows, Type::INT2),
                (&cols, Type::INT2),
                (&x_pos, Type::INT4),
                (&y_pos, Type::INT4),
            ],
        )
        .await
    }

    async fn insert_seat(
        pool: &crate::db::Db,
        table_id: Uuid,
        student_id: Option<Uuid>,
        seat_number: i16,
    ) -> SeatModel {
        seed_one(
            pool,
            "INSERT INTO seats (table_id, student_id, seat_number)
            VALUES ($1, $2, $3)
            RETURNING *",
            &[
                (&table_id, Type::UUID),
                (&student_id, Type::UUID),
                (&seat_number, Type::INT2),
            ],
        )
        .await
    }

    async fn insert_student_in_classroom(
        pool: &crate::db::Db,
        user_id: &str,
        classroom_id: Uuid,
        student_id: i32,
        name: &str,
    ) -> Uuid {
        seed_scalar(
            pool,
            "INSERT INTO students (user_id, classroom_id, student_id, name)
            VALUES ($1, $2, $3, $4)
            RETURNING id",
            &[
                (&user_id, Type::TEXT),
                (&classroom_id, Type::UUID),
                (&student_id, Type::INT4),
                (&name, Type::TEXT),
            ],
        )
        .await
    }

    async fn insert_student_in_classroom_with_preference(
        pool: &crate::db::Db,
        user_id: &str,
        classroom_id: Uuid,
        student_id: i32,
        name: &str,
        preference: &str,
    ) -> Uuid {
        seed_scalar(
            pool,
            "INSERT INTO students (user_id, classroom_id, student_id, name, seating_preference)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id",
            &[
                (&user_id, Type::TEXT),
                (&classroom_id, Type::UUID),
                (&student_id, Type::INT4),
                (&name, Type::TEXT),
                (&preference, Type::TEXT),
            ],
        )
        .await
    }

    async fn insert_student(
        pool: &crate::db::Db,
        user_id: &str,
        student_id: i32,
        name: &str,
    ) -> Uuid {
        seed_scalar(
            pool,
            "INSERT INTO students (user_id, classroom_id, student_id, name)
            VALUES ($1, NULL, $2, $3)
            RETURNING id",
            &[
                (&user_id, Type::TEXT),
                (&student_id, Type::INT4),
                (&name, Type::TEXT),
            ],
        )
        .await
    }

    async fn fetch_tables_for_classroom(
        pool: &crate::db::Db,
        classroom_id: Uuid,
    ) -> Vec<TableModel> {
        seed_all(
            pool,
            "SELECT * FROM tables WHERE classroom_id = $1 ORDER BY table_number",
            &[(&classroom_id, Type::UUID)],
        )
        .await
    }

    async fn seed_classrooms(pool: &crate::db::Db, user_id: &str, count: i64) {
        let count = count as i32;
        seed_exec(
            pool,
            "INSERT INTO classrooms (user_id, subject, period, term_season, term_year)
            SELECT $1, 'Subject ' || gs, gs, 'fall', 2026 FROM generate_series(1, $2::int) AS gs",
            &[(&user_id, Type::TEXT), (&count, Type::INT4)],
        )
        .await;
    }

    async fn seed_pinned_classrooms(pool: &crate::db::Db, user_id: &str, count: i64) {
        seed_classrooms(pool, user_id, count).await;
        seed_exec(
            pool,
            "UPDATE classrooms SET pinned_at = now() WHERE user_id = $1",
            &[(&user_id, Type::TEXT)],
        )
        .await;
    }

    #[tokio::test]
    async fn create_classroom_rejects_at_limit() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        seed_classrooms(&pool, &user_id, 50).await;

        let body = json!({"subject": "One Too Many", "period": 1, "term_season": "fall", "term_year": 2026});
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/classrooms",
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }

    #[tokio::test]
    async fn create_classroom_allows_up_to_limit() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        seed_classrooms(&pool, &user_id, 49).await;

        let body =
            json!({"subject": "Last One", "period": 1, "term_season": "fall", "term_year": 2026});
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/classrooms",
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        Ok(())
    }

    #[tokio::test]
    async fn create_classroom_limit_is_per_user() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_a = test_user_id();
        let user_b = test_user_id();
        seed_classrooms(&pool, &user_a, 50).await;

        let body =
            json!({"subject": "New For B", "period": 1, "term_season": "fall", "term_year": 2026});
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/classrooms",
                body,
                &user_b,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        Ok(())
    }

    #[tokio::test]
    async fn create_classroom_success() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let body =
            json!({"subject": "Math 2", "period": 3, "term_season": "fall", "term_year": 2026});

        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/classrooms",
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        let json = body_json(response).await;
        assert_eq!(json["data"]["subject"], "Math 2");
        assert_eq!(json["data"]["period"], 3);
        assert_eq!(json["data"]["term_season"], "fall");
        assert_eq!(json["data"]["term_year"], 2026);

        Ok(())
    }

    #[tokio::test]
    async fn create_classroom_defaults_boundary_dimensions() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let body =
            json!({"subject": "Math 2", "period": 3, "term_season": "fall", "term_year": 2026});

        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/classrooms",
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        let json = body_json(response).await;
        assert_eq!(json["data"]["boundary_width"], 1080);
        assert_eq!(json["data"]["boundary_height"], 820);

        Ok(())
    }

    // No uniqueness constraint on (subject, period), so duplicates are accepted.
    #[tokio::test]
    async fn create_classroom_allows_duplicate_subject_and_period() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let body =
            json!({"subject": "Math 2", "period": 3, "term_season": "fall", "term_year": 2026});
        let first = app
            .clone()
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/classrooms",
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::CREATED);

        let body =
            json!({"subject": "Math 2", "period": 3, "term_season": "fall", "term_year": 2026});
        let second = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/classrooms",
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(second.status(), StatusCode::CREATED);

        Ok(())
    }

    #[tokio::test]
    async fn update_classroom_partial_leaves_other_fields_unchanged() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_classroom(&pool, &user_id, "Math 2", 3).await;

        let body = json!({"subject": "Algebra"});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["subject"], "Algebra");
        assert_eq!(json["data"]["period"], existing.period);

        Ok(())
    }

    #[tokio::test]
    async fn update_classroom_partial_boundary_patch_leaves_other_boundary_field_unchanged()
    -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_classroom(&pool, &user_id, "Math 2", 3).await;

        let body = json!({"boundary_width": 2000});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["boundary_width"], 2000);
        assert_eq!(json["data"]["boundary_height"], existing.boundary_height);

        Ok(())
    }

    #[tokio::test]
    async fn update_classroom_term_leaves_other_fields_unchanged() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_classroom(&pool, &user_id, "Math 2", 3).await;

        let body = json!({"term_season": "spring", "term_year": 2027});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["term_season"], "spring");
        assert_eq!(json["data"]["term_year"], 2027);
        assert_eq!(json["data"]["subject"], existing.subject);
        assert_eq!(json["data"]["period"], existing.period);

        Ok(())
    }

    #[tokio::test]
    async fn update_classroom_pin_sets_pinned_at() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        assert!(existing.pinned_at.is_none());

        let body = json!({"pinned_at": "2026-08-16T12:00:00Z"});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert!(!json["data"]["pinned_at"].is_null());

        Ok(())
    }

    #[tokio::test]
    async fn update_classroom_unpin_clears_pinned_at() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_classroom(&pool, &user_id, "Math 2", 3).await;

        let pin_response = app
            .clone()
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                json!({"pinned_at": "2026-08-16T12:00:00Z"}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(pin_response.status(), StatusCode::OK);

        let unpin_response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                json!({"pinned_at": null}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(unpin_response.status(), StatusCode::OK);

        let json = body_json(unpin_response).await;
        assert!(json["data"]["pinned_at"].is_null());

        Ok(())
    }

    #[tokio::test]
    async fn update_classroom_omitted_pinned_at_leaves_it_unchanged() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_classroom(&pool, &user_id, "Math 2", 3).await;

        let pin_response = app
            .clone()
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                json!({"pinned_at": "2026-08-16T12:00:00Z"}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(pin_response.status(), StatusCode::OK);
        let pinned_json = body_json(pin_response).await;
        let pinned_at = pinned_json["data"]["pinned_at"].clone();

        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                json!({"subject": "Algebra"}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["subject"], "Algebra");
        assert_eq!(json["data"]["pinned_at"], pinned_at);

        Ok(())
    }

    #[tokio::test]
    async fn update_classroom_pin_rejects_at_pin_limit() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        seed_pinned_classrooms(&pool, &user_id, 10).await;
        let existing = insert_classroom(&pool, &user_id, "Math 2", 3).await;

        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                json!({"pinned_at": "2026-08-16T12:00:00Z"}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }

    #[tokio::test]
    async fn update_classroom_pin_limit_is_per_user() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_a = test_user_id();
        let user_b = test_user_id();
        seed_pinned_classrooms(&pool, &user_a, 10).await;
        let existing = insert_classroom(&pool, &user_b, "Math 2", 3).await;

        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                json!({"pinned_at": "2026-08-16T12:00:00Z"}),
                &user_b,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        Ok(())
    }

    #[tokio::test]
    async fn update_classroom_nonexistent_id_returns_404() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let body = json!({"subject": "Doesn't Matter"});

        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", Uuid::new_v4()),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    #[tokio::test]
    async fn delete_classroom_success() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_classroom(&pool, &user_id, "Math 2", 3).await;

        let response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/classrooms/{}", existing.id),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["id"], existing.id.to_string());

        assert!(fetch_classroom(&pool, existing.id).await.is_none());

        Ok(())
    }

    #[tokio::test]
    async fn delete_classroom_nonexistent_id_returns_404() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();

        let response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/classrooms/{}", Uuid::new_v4()),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    #[tokio::test]
    async fn update_seating_chart_replaces_existing_tables_and_seats() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        let old_table = insert_table(&pool, classroom.id, 0, 2, 2, 0, 0).await;
        insert_seat(&pool, old_table.id, None, 0).await;

        let student_id = insert_student(&pool, &user_id, 1, "Bob").await;
        let body = json!({
            "boundary_width": 1500,
            "boundary_height": 1200,
            "tables": [
                { "table_number": 0, "rows": 1, "cols": 2, "x_pos": 20, "y_pos": 40, "seat_assignments": [student_id, null] },
            ]
        });
        let response = app
            .oneshot(authenticated_json_request(
                "PUT",
                &format!("/api/v1/classrooms/{}/seating-chart", classroom.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let tables = fetch_tables_for_classroom(&pool, classroom.id).await;
        assert_eq!(tables.len(), 1);
        assert_ne!(tables[0].id, old_table.id);
        assert_eq!(tables[0].rows, 1);
        assert_eq!(tables[0].cols, 2);
        assert_eq!(tables[0].x_pos, 20);
        assert_eq!(tables[0].y_pos, 40);

        let seats: Vec<SeatModel> = seed_all(
            &pool,
            "SELECT * FROM seats WHERE table_id = $1 ORDER BY seat_number",
            &[(&tables[0].id, Type::UUID)],
        )
        .await;
        assert_eq!(seats.len(), 2);
        assert_eq!(seats[0].seat_number, 0);
        assert_eq!(seats[0].student_id, Some(student_id));
        assert_eq!(seats[1].seat_number, 1);
        assert_eq!(seats[1].student_id, None);

        let updated_classroom = fetch_classroom(&pool, classroom.id).await.unwrap();
        assert_eq!(updated_classroom.boundary_width, 1500);
        assert_eq!(updated_classroom.boundary_height, 1200);

        Ok(())
    }

    #[tokio::test]
    async fn update_seating_chart_nonexistent_classroom_returns_404() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();

        let body = json!({
            "boundary_width": 1080,
            "boundary_height": 820,
            "tables": []
        });
        let response = app
            .oneshot(authenticated_json_request(
                "PUT",
                &format!("/api/v1/classrooms/{}/seating-chart", Uuid::new_v4()),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[tokio::test]
    async fn update_seating_chart_assigns_table_number_from_request_index() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;

        // x_pos deliberately doesn't match the intended table_number order,
        // so the assertion below only passes if table_number is driven by
        // request array index and not incidentally by x_pos or insert order.
        let body = json!({
            "boundary_width": 1080,
            "boundary_height": 820,
            "tables": [
                { "table_number": 0, "rows": 1, "cols": 1, "x_pos": 900, "y_pos": 0, "seat_assignments": [] },
                { "table_number": 1, "rows": 1, "cols": 1, "x_pos": 100, "y_pos": 0, "seat_assignments": [] },
                { "table_number": 2, "rows": 1, "cols": 1, "x_pos": 500, "y_pos": 0, "seat_assignments": [] },
            ]
        });
        let response = app
            .oneshot(authenticated_json_request(
                "PUT",
                &format!("/api/v1/classrooms/{}/seating-chart", classroom.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let tables = fetch_tables_for_classroom(&pool, classroom.id).await;
        assert_eq!(tables.len(), 3);
        assert_eq!(tables[0].table_number, 0);
        assert_eq!(tables[0].x_pos, 900);
        assert_eq!(tables[1].table_number, 1);
        assert_eq!(tables[1].x_pos, 100);
        assert_eq!(tables[2].table_number, 2);
        assert_eq!(tables[2].x_pos, 500);

        Ok(())
    }

    #[tokio::test]
    async fn update_seating_chart_with_no_tables_clears_everything() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        insert_table(&pool, classroom.id, 0, 2, 2, 0, 0).await;

        let body = json!({
            "boundary_width": 1080,
            "boundary_height": 820,
            "tables": []
        });
        let response = app
            .oneshot(authenticated_json_request(
                "PUT",
                &format!("/api/v1/classrooms/{}/seating-chart", classroom.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        assert!(
            fetch_tables_for_classroom(&pool, classroom.id)
                .await
                .is_empty()
        );

        Ok(())
    }

    #[tokio::test]
    async fn get_seating_chart_returns_only_assigned_seats() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        let table = insert_table(&pool, classroom.id, 0, 2, 2, 0, 0).await;
        let student_id = insert_student(&pool, &user_id, 1, "Bob").await;
        insert_seat(&pool, table.id, Some(student_id), 0).await;
        insert_seat(&pool, table.id, None, 1).await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                &format!("/api/v1/classrooms/{}/seating-chart", classroom.id),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["boundary_width"], 1080);
        assert_eq!(json["data"]["boundary_height"], 820);
        assert_eq!(json["data"]["tables"][0]["rows"], 2);
        assert_eq!(json["data"]["tables"][0]["cols"], 2);
        let assignments = json["data"]["tables"][0]["seat_assignments"]
            .as_array()
            .unwrap();
        assert_eq!(assignments[0], student_id.to_string());

        Ok(())
    }

    #[tokio::test]
    async fn get_seating_chart_groups_assignments_in_table_insertion_order() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        // x_pos/y_pos deliberately sort the opposite of insertion order, so
        // the response order can only be right if it's driven by
        // table_number and not accidentally by position or id.
        let first_table = insert_table(&pool, classroom.id, 0, 2, 2, 100, 100).await;
        let second_table = insert_table(&pool, classroom.id, 1, 2, 2, 0, 0).await;
        let student_a = insert_student(&pool, &user_id, 1, "Alice").await;
        let student_b = insert_student(&pool, &user_id, 2, "Bob").await;
        insert_seat(&pool, second_table.id, Some(student_b), 0).await;
        insert_seat(&pool, first_table.id, Some(student_a), 0).await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                &format!("/api/v1/classrooms/{}/seating-chart", classroom.id),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["boundary_width"], 1080);
        assert_eq!(json["data"]["boundary_height"], 820);
        let tables = json["data"]["tables"].as_array().unwrap();
        assert_eq!(tables.len(), 2);
        assert_eq!(tables[0]["seat_assignments"][0], student_a.to_string());
        assert_eq!(tables[1]["seat_assignments"][0], student_b.to_string());
        Ok(())
    }

    #[tokio::test]
    async fn get_seating_chart_with_no_tables_returns_empty_list() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                &format!("/api/v1/classrooms/{}/seating-chart", classroom.id),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["boundary_width"], 1080);
        assert_eq!(json["data"]["boundary_height"], 820);
        assert!(json["data"]["tables"].as_array().unwrap().is_empty());

        Ok(())
    }

    #[tokio::test]
    async fn get_seating_chart_nonexistent_classroom_returns_404() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();

        let response = app
            .oneshot(authenticated_request(
                "GET",
                &format!("/api/v1/classrooms/{}/seating-chart", Uuid::new_v4()),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[tokio::test]
    async fn randomize_seating_chart_rejects_out_of_range_new_table_dimensions()
    -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;

        let body = json!({
            "keep_existing_tables": false,
            "new_table_rows": 0,
            "new_table_cols": 16,
            "existing_tables": [],
            "boundary_width": 1080,
            "boundary_height": 820
        });
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    #[tokio::test]
    async fn randomize_seating_chart_nonexistent_classroom_returns_404() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();

        let body = json!({
            "keep_existing_tables": false,
            "new_table_rows": 2,
            "new_table_cols": 2,
            "existing_tables": [],
            "boundary_width": 1080,
            "boundary_height": 820
        });
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    Uuid::new_v4()
                ),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[tokio::test]
    async fn randomize_seating_chart_only_seats_students_in_this_classroom() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        let other_classroom = insert_classroom(&pool, &user_id, "Science 1", 4).await;
        let in_classroom =
            insert_student_in_classroom(&pool, &user_id, classroom.id, 1, "Alice").await;
        insert_student_in_classroom(&pool, &user_id, other_classroom.id, 2, "Bob").await;
        insert_student(&pool, &user_id, 3, "Unassigned").await;

        let body = json!({
            "keep_existing_tables": false,
            "new_table_rows": 2,
            "new_table_cols": 2,
            "existing_tables": [],
            "boundary_width": 1080,
            "boundary_height": 820
        });
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let tables = json["data"]["tables"].as_array().unwrap();
        let assigned: Vec<&serde_json::Value> = tables
            .iter()
            .flat_map(|t| t["seat_assignments"].as_array().unwrap())
            .filter(|s| !s.is_null())
            .collect();
        assert_eq!(assigned.len(), 1);
        assert_eq!(assigned[0], &json!(in_classroom.to_string()));

        Ok(())
    }

    #[tokio::test]
    async fn randomize_seating_chart_honors_front_preference() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        let front = insert_student_in_classroom_with_preference(
            &pool,
            &user_id,
            classroom.id,
            1,
            "Alice",
            "front",
        )
        .await;
        for i in 2..=8 {
            insert_student_in_classroom(&pool, &user_id, classroom.id, i, "Student").await;
        }

        let cols = 2;
        let body = json!({
            "keep_existing_tables": false,
            "new_table_rows": 4,
            "new_table_cols": cols,
            "existing_tables": [],
            "boundary_width": 1080,
            "boundary_height": 820
        });
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let tables = json["data"]["tables"].as_array().unwrap();
        let front_seat_index = tables
            .iter()
            .flat_map(|t| t["seat_assignments"].as_array().unwrap().iter().enumerate())
            .find(|(_, s)| **s == json!(front.to_string()))
            .map(|(i, _)| i)
            .unwrap();
        assert_eq!(front_seat_index / cols, 0);

        Ok(())
    }

    #[tokio::test]
    async fn randomize_seating_chart_respects_separation_when_feasible() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        let a = insert_student_in_classroom(&pool, &user_id, classroom.id, 1, "Alice").await;
        let b = insert_student_in_classroom(&pool, &user_id, classroom.id, 2, "Bob").await;

        let (id_a, id_b) = if a < b { (a, b) } else { (b, a) };
        seed_exec(
            &pool,
            "INSERT INTO student_separations (user_id, student_id_a, student_id_b)
            VALUES ($1, $2, $3)",
            &[
                (&user_id, Type::TEXT),
                (&id_a, Type::UUID),
                (&id_b, Type::UUID),
            ],
        )
        .await;

        // 5 single-seat tables gives structurally guaranteed room to avoid
        // seating the pair together (see seating_chart.rs's own tests for
        // why this shape is deterministic, not just probabilistically likely).
        let existing_tables: Vec<serde_json::Value> = (0..5)
            .map(|i| json!({"rows": 1, "cols": 1, "x_pos": 40 + i * 200, "y_pos": 40}))
            .collect();
        let body = json!({
            "keep_existing_tables": true,
            "new_table_rows": 1,
            "new_table_cols": 1,
            "existing_tables": existing_tables,
            "boundary_width": 1080,
            "boundary_height": 820
        });
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let tables = json["data"]["tables"].as_array().unwrap();
        let table_of = |student_id: Uuid| {
            tables.iter().position(|t| {
                t["seat_assignments"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|s| *s == json!(student_id.to_string()))
            })
        };
        assert_ne!(table_of(a), table_of(b));

        Ok(())
    }

    #[tokio::test]
    async fn randomize_seating_chart_never_persists_anything() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        let table = insert_table(&pool, classroom.id, 0, 2, 2, 40, 40).await;
        let student_id =
            insert_student_in_classroom(&pool, &user_id, classroom.id, 1, "Alice").await;
        insert_seat(&pool, table.id, Some(student_id), 0).await;

        let body = json!({
            "keep_existing_tables": true,
            "new_table_rows": 2,
            "new_table_cols": 2,
            "existing_tables": [
                { "rows": 2, "cols": 2, "x_pos": 40, "y_pos": 40 }
            ],
            "boundary_width": 1080,
            "boundary_height": 820
        });
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let tables_after = fetch_tables_for_classroom(&pool, classroom.id).await;
        assert_eq!(tables_after.len(), 1);
        assert_eq!(tables_after[0].id, table.id);

        let seats_after: Vec<SeatModel> = seed_all(
            &pool,
            "SELECT * FROM seats WHERE table_id = $1",
            &[(&table.id, Type::UUID)],
        )
        .await;
        assert_eq!(seats_after.len(), 1);
        assert_eq!(seats_after[0].student_id, Some(student_id));

        Ok(())
    }

    #[tokio::test]
    async fn randomize_seating_chart_errors_when_boundary_too_small() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        for i in 0..8 {
            insert_student_in_classroom(&pool, &user_id, classroom.id, i, "Student").await;
        }

        // A boundary that only fits one 2x2 table, but 8 students need two.
        let body = json!({
            "keep_existing_tables": false,
            "new_table_rows": 2,
            "new_table_cols": 2,
            "existing_tables": [],
            "boundary_width": 377,
            "boundary_height": 377
        });
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    #[tokio::test]
    async fn randomize_seating_chart_packs_within_constrained_boundary() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        for i in 0..16 {
            insert_student_in_classroom(&pool, &user_id, classroom.id, i, "Student").await;
        }

        // Boundary just big enough for a 2x2 grid of 2x2 tables (4 tables).
        let body = json!({
            "keep_existing_tables": false,
            "new_table_rows": 2,
            "new_table_cols": 2,
            "existing_tables": [],
            "boundary_width": 680,
            "boundary_height": 680
        });
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["boundary_width"], 680);
        assert_eq!(json["data"]["boundary_height"], 680);
        let tables = json["data"]["tables"].as_array().unwrap();
        assert_eq!(tables.len(), 4);

        let rects: Vec<(i32, i32, i32, i32)> = tables
            .iter()
            .map(|t| {
                let x = t["x_pos"].as_i64().unwrap() as i32;
                let y = t["y_pos"].as_i64().unwrap() as i32;
                // 2x2 table pixel size: 2 * (SEAT_NODE_SIZE + SEAT_PADDING) + SEAT_PADDING = 210.
                (x, y, x + 210, y + 210)
            })
            .collect();
        for &(x0, y0, x1, y1) in &rects {
            assert!(x0 >= 40 && y0 >= 40 && x1 <= 680 - 40 && y1 <= 680 - 40);
        }
        for i in 0..rects.len() {
            for j in (i + 1)..rects.len() {
                let (ax0, ay0, ax1, ay1) = rects[i];
                let (bx0, by0, bx1, by1) = rects[j];
                let overlap = ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;
                assert!(!overlap);
            }
        }

        Ok(())
    }

    #[tokio::test]
    async fn cold_call_success_returns_pick_and_adjusted_weights() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom_id = Uuid::new_v4();
        let student_a = Uuid::new_v4();
        let student_b = Uuid::new_v4();

        let body = json!({
            "students": [
                { "student_id": student_a, "weight": 100 },
                { "student_id": student_b, "weight": 0 }
            ]
        });
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                &format!("/api/v1/classrooms/{classroom_id}/cold-call"),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let picked_student_id = json["data"]["picked_student_id"].as_str().unwrap();
        assert_eq!(picked_student_id, student_a.to_string());

        let students = json["data"]["students"].as_array().unwrap();
        let weight_for = |id: Uuid| {
            students
                .iter()
                .find(|s| s["student_id"] == id.to_string())
                .unwrap()["weight"]
                .as_u64()
                .unwrap()
        };
        assert_eq!(weight_for(student_a), 0);
        assert_eq!(weight_for(student_b), cold_call::WEIGHT_INCREMENT as u64);

        Ok(())
    }

    #[tokio::test]
    async fn cold_call_empty_students_returns_400() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom_id = Uuid::new_v4();

        let body = json!({ "students": [] });
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                &format!("/api/v1/classrooms/{classroom_id}/cold-call"),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    // --- auth/scoping coverage ---

    #[tokio::test]
    async fn unauthenticated_requests_return_401() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let classroom_id = Uuid::new_v4();

        for (method, uri) in [
            ("GET", "/api/v1/classrooms".to_string()),
            ("POST", "/api/v1/classrooms".to_string()),
            ("GET", format!("/api/v1/classrooms/{classroom_id}")),
            ("PATCH", format!("/api/v1/classrooms/{classroom_id}")),
            ("DELETE", format!("/api/v1/classrooms/{classroom_id}")),
            (
                "GET",
                format!("/api/v1/classrooms/{classroom_id}/seating-chart"),
            ),
            (
                "PUT",
                format!("/api/v1/classrooms/{classroom_id}/seating-chart"),
            ),
            (
                "POST",
                format!("/api/v1/classrooms/{classroom_id}/seating-chart/randomize"),
            ),
            (
                "POST",
                format!("/api/v1/classrooms/{classroom_id}/cold-call"),
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .method(method)
                        .uri(&uri)
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from("{}"))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(
                response.status(),
                StatusCode::UNAUTHORIZED,
                "{method} {uri}"
            );
        }

        Ok(())
    }

    #[tokio::test]
    async fn cross_user_get_update_delete_classroom_returns_404() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let owner_id = test_user_id();
        let other_id = test_user_id();
        let classroom = insert_classroom(&pool, &owner_id, "Math 2", 3).await;

        let get_response = app
            .clone()
            .oneshot(authenticated_request(
                "GET",
                &format!("/api/v1/classrooms/{}", classroom.id),
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(get_response.status(), StatusCode::NOT_FOUND);

        let update_response = app
            .clone()
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", classroom.id),
                json!({"subject": "Hijacked"}),
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::NOT_FOUND);

        let delete_response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/classrooms/{}", classroom.id),
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(delete_response.status(), StatusCode::NOT_FOUND);

        assert!(fetch_classroom(&pool, classroom.id).await.is_some());

        Ok(())
    }

    #[tokio::test]
    async fn list_classrooms_excludes_other_users_classrooms() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_a_id = test_user_id();
        let user_b_id = test_user_id();
        let classroom_a = insert_classroom(&pool, &user_a_id, "Math 2", 3).await;
        insert_classroom(&pool, &user_b_id, "Science 1", 4).await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/classrooms",
                &user_a_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let classrooms = json["data"].as_array().unwrap();
        assert_eq!(classrooms.len(), 1);
        assert_eq!(classrooms[0]["id"], classroom_a.id.to_string());

        Ok(())
    }

    #[tokio::test]
    async fn cross_user_seating_chart_returns_404() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let owner_id = test_user_id();
        let other_id = test_user_id();
        let classroom = insert_classroom(&pool, &owner_id, "Math 2", 3).await;

        let get_response = app
            .clone()
            .oneshot(authenticated_request(
                "GET",
                &format!("/api/v1/classrooms/{}/seating-chart", classroom.id),
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(get_response.status(), StatusCode::NOT_FOUND);

        let put_response = app
            .clone()
            .oneshot(authenticated_json_request(
                "PUT",
                &format!("/api/v1/classrooms/{}/seating-chart", classroom.id),
                json!({"boundary_width": 1080, "boundary_height": 820, "tables": []}),
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(put_response.status(), StatusCode::NOT_FOUND);

        let randomize_response = app
            .oneshot(authenticated_json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                json!({
                    "keep_existing_tables": false,
                    "new_table_rows": 2,
                    "new_table_cols": 2,
                    "existing_tables": [],
                    "boundary_width": 1080,
                    "boundary_height": 820
                }),
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(randomize_response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }
}

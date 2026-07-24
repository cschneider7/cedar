use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde_json::json;
use uuid::Uuid;

use crate::{
    AppState,
    error::AppError,
    model::ClassroomModel,
    schema::{
        ClassroomSchema, RandomizeSeatingChartSchema, SeatingChartSchema, TableSchema,
        UpdateClassroomSchema,
    },
    seating_chart::{self, MAX_TABLE_DIMENSION},
};

/// Lists every classroom, ordered by period.
pub async fn classroom_list_handler(
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let classrooms = sqlx::query_as!(
        ClassroomModel,
        r#"SELECT * FROM classrooms ORDER by period"#
    )
    .fetch_all(&data.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({"data": classrooms}))))
}

/// Fetches a single classroom by its uuid.
pub async fn get_classroom_handler(
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let classroom = sqlx::query_as!(
        ClassroomModel,
        r#"SELECT * FROM classrooms WHERE id = $1"#,
        &id
    )
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({"data": classroom}))))
}

/// Creates a new classroom; boundary dimensions take their DB defaults.
pub async fn create_classroom_handler(
    State(data): State<Arc<AppState>>,
    Json(body): Json<ClassroomSchema>,
) -> Result<impl IntoResponse, AppError> {
    let classroom = sqlx::query_as!(
        ClassroomModel,
        r#"INSERT INTO classrooms (
            subject,
            period
        )
        VALUES ($1, $2)
        RETURNING *"#,
        &body.subject,
        body.period,
    )
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::CREATED, Json(json!({"data": classroom}))))
}

/// Partially updates a classroom, merging provided fields over its existing
/// values before writing them back.
pub async fn update_classroom_handler(
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
    Json(body): Json<UpdateClassroomSchema>,
) -> Result<impl IntoResponse, AppError> {
    let classroom = sqlx::query_as!(
        ClassroomModel,
        r#"SELECT * FROM classrooms WHERE id = $1"#,
        &id
    )
    .fetch_one(&data.db)
    .await?;

    let new_subject = body.subject.as_ref().unwrap_or(&classroom.subject);
    let new_period = body.period.unwrap_or(classroom.period);
    let new_boundary_width = body.boundary_width.unwrap_or(classroom.boundary_width);
    let new_boundary_height = body.boundary_height.unwrap_or(classroom.boundary_height);

    let updated_classroom = sqlx::query_as!(
        ClassroomModel,
        r#"UPDATE classrooms SET
            subject = $1,
            period = $2,
            boundary_width = $3,
            boundary_height = $4
        WHERE id = $5
        RETURNING *"#,
        &new_subject,
        new_period,
        new_boundary_width,
        new_boundary_height,
        &classroom.id
    )
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({"data": updated_classroom}))))
}

/// Deletes a classroom by its uuid.
pub async fn delete_classroom_handler(
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let classroom = sqlx::query_as!(
        ClassroomModel,
        r#"DELETE FROM classrooms WHERE id = $1 RETURNING *"#,
        &id
    )
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({"data": classroom}))))
}

/// Fetches a classroom's full seating chart as a dense, `table_number`-ordered
/// document, with unoccupied seats included as `null` entries.
pub async fn get_seating_chart_handler(
    Path(classroom_id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let tables = sqlx::query_as!(
        TableSchema,
        r#"SELECT
            t.table_number,
            t.rows,
            t.cols,
            t.x_pos,
            t.y_pos,
            ARRAY_AGG(s.student_id ORDER BY s.seat_number) as "seat_assignments!: Vec<Option<Uuid>>"
        FROM tables t
        INNER JOIN seats s ON (t.id = s.table_id)
        WHERE t.classroom_id = $1
        GROUP BY t.table_number, t.rows, t.cols, t.x_pos, t.y_pos
        "#,
        &classroom_id
    )
    .fetch_all(&data.db)
    .await?;

    let response = json!({
        "data": {
            "classroom_id": classroom_id,
            "tables": tables
        }
    });
    Ok((StatusCode::OK, Json(response)))
}

/// Replaces a classroom's entire seating chart in one transaction: every
/// existing table/seat is deleted, then re-inserted from the request body.
pub async fn update_seating_chart_handler(
    Path(classroom_id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
    Json(body): Json<SeatingChartSchema>,
) -> Result<impl IntoResponse, AppError> {
    let mut tx = data.db.begin().await?;

    sqlx::query!(
        r#"DELETE FROM tables WHERE classroom_id = $1"#,
        &classroom_id
    )
    .execute(&mut *tx)
    .await?;

    let mut chart_tables: Vec<TableSchema> = Vec::new();
    for (index, table) in body.tables.iter().enumerate() {
        let table_number = index as i32;

        let table_id = sqlx::query_scalar!(
            r#"INSERT INTO tables (classroom_id, table_number, rows, cols, x_pos, y_pos)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id"#,
            &classroom_id,
            table_number,
            table.rows,
            table.cols,
            table.x_pos,
            table.y_pos,
        )
        .fetch_one(&mut *tx)
        .await?;

        for (index, student_id) in table.seat_assignments.iter().enumerate() {
            let seat_number = index as i16;

            sqlx::query!(
                r#"INSERT INTO seats (table_id, student_id, seat_number)
                VALUES ($1, $2, $3)"#,
                table_id,
                student_id.as_ref(),
                seat_number,
            )
            .execute(&mut *tx)
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
            "tables": chart_tables
        }
    });
    Ok((StatusCode::OK, Json(response)))
}

/// Proposes a randomized seating chart for a classroom's current roster and
/// canvas geometry, without persisting anything.
pub async fn randomize_seating_chart_handler(
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

    sqlx::query_as!(
        ClassroomModel,
        r#"SELECT * FROM classrooms WHERE id = $1"#,
        &classroom_id
    )
    .fetch_one(&data.db)
    .await?;

    let students = sqlx::query_scalar!(
        r#"SELECT id FROM students WHERE classroom_id = $1"#,
        &classroom_id
    )
    .fetch_all(&data.db)
    .await?;

    let tables = seating_chart::build_randomized_chart(
        students,
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

    Ok((StatusCode::OK, Json(json!({"data": {"tables": tables}}))))
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use serde_json::json;
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;
    use crate::{
        model::{SeatModel, TableModel},
        test_support::{app, body_json, insert_classroom, json_request},
    };

    async fn fetch_classroom(pool: &sqlx::PgPool, id: Uuid) -> Option<ClassroomModel> {
        sqlx::query_as!(
            ClassroomModel,
            r#"SELECT * FROM classrooms WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
        .unwrap()
    }

    async fn insert_table(
        pool: &sqlx::PgPool,
        classroom_id: Uuid,
        table_number: i32,
        rows: i16,
        cols: i16,
        x_pos: i32,
        y_pos: i32,
    ) -> TableModel {
        sqlx::query_as!(
            TableModel,
            r#"INSERT INTO tables (classroom_id, table_number, rows, cols, x_pos, y_pos)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *"#,
            classroom_id,
            table_number,
            rows,
            cols,
            x_pos,
            y_pos
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn insert_seat(
        pool: &sqlx::PgPool,
        table_id: Uuid,
        student_id: Option<Uuid>,
        seat_number: i16,
    ) -> SeatModel {
        sqlx::query_as!(
            SeatModel,
            r#"INSERT INTO seats (table_id, student_id, seat_number)
            VALUES ($1, $2, $3)
            RETURNING *"#,
            table_id,
            student_id,
            seat_number
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn insert_student_in_classroom(
        pool: &sqlx::PgPool,
        classroom_id: Uuid,
        student_id: i32,
        name: &str,
    ) -> Uuid {
        sqlx::query_scalar!(
            r#"INSERT INTO students (classroom_id, student_id, name)
            VALUES ($1, $2, $3)
            RETURNING id"#,
            classroom_id,
            student_id,
            name
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn insert_student(pool: &sqlx::PgPool, student_id: i32, name: &str) -> Uuid {
        sqlx::query_scalar!(
            r#"INSERT INTO students (classroom_id, student_id, name)
            VALUES (NULL, $1, $2)
            RETURNING id"#,
            student_id,
            name
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn fetch_tables_for_classroom(
        pool: &sqlx::PgPool,
        classroom_id: Uuid,
    ) -> Vec<TableModel> {
        sqlx::query_as!(
            TableModel,
            r#"SELECT * FROM tables WHERE classroom_id = $1 ORDER BY table_number"#,
            classroom_id
        )
        .fetch_all(pool)
        .await
        .unwrap()
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn create_classroom_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool);
        let body = json!({"subject": "Math 2", "period": 3});

        let response = app
            .oneshot(json_request("POST", "/api/v1/classrooms", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        let json = body_json(response).await;
        assert_eq!(json["data"]["subject"], "Math 2");
        assert_eq!(json["data"]["period"], 3);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn create_classroom_defaults_boundary_dimensions(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool);
        let body = json!({"subject": "Math 2", "period": 3});

        let response = app
            .oneshot(json_request("POST", "/api/v1/classrooms", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        let json = body_json(response).await;
        assert_eq!(json["data"]["boundary_width"], 1080);
        assert_eq!(json["data"]["boundary_height"], 820);

        Ok(())
    }

    // No uniqueness constraint on (subject, period), so duplicates are accepted.
    #[sqlx::test(migrations = "../migrations")]
    async fn create_classroom_allows_duplicate_subject_and_period(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool);
        let body = json!({"subject": "Math 2", "period": 3});
        let first = app
            .clone()
            .oneshot(json_request("POST", "/api/v1/classrooms", body))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::CREATED);

        let body = json!({"subject": "Math 2", "period": 3});
        let second = app
            .oneshot(json_request("POST", "/api/v1/classrooms", body))
            .await
            .unwrap();
        assert_eq!(second.status(), StatusCode::CREATED);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_classroom_partial_leaves_other_fields_unchanged(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let existing = insert_classroom(&pool, "Math 2", 3).await;
        let app = app(pool);

        let body = json!({"subject": "Algebra"});
        let response = app
            .oneshot(json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["subject"], "Algebra");
        assert_eq!(json["data"]["period"], existing.period);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_classroom_partial_boundary_patch_leaves_other_boundary_field_unchanged(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let existing = insert_classroom(&pool, "Math 2", 3).await;
        let app = app(pool);

        let body = json!({"boundary_width": 2000});
        let response = app
            .oneshot(json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["boundary_width"], 2000);
        assert_eq!(json["data"]["boundary_height"], existing.boundary_height);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_classroom_full_boundary_patch_with_subject_and_period(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let existing = insert_classroom(&pool, "Math 2", 3).await;
        let app = app(pool);

        let body = json!({
            "subject": "Algebra",
            "period": 5,
            "boundary_width": 1500,
            "boundary_height": 1200
        });
        let response = app
            .oneshot(json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", existing.id),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["subject"], "Algebra");
        assert_eq!(json["data"]["period"], 5);
        assert_eq!(json["data"]["boundary_width"], 1500);
        assert_eq!(json["data"]["boundary_height"], 1200);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_classroom_nonexistent_id_returns_404(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool);
        let body = json!({"subject": "Doesn't Matter"});

        let response = app
            .oneshot(json_request(
                "PATCH",
                &format!("/api/v1/classrooms/{}", Uuid::new_v4()),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn delete_classroom_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let existing = insert_classroom(&pool, "Math 2", 3).await;
        let app = app(pool.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/v1/classrooms/{}", existing.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["id"], existing.id.to_string());

        assert!(fetch_classroom(&pool, existing.id).await.is_none());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn delete_classroom_nonexistent_id_returns_404(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool);

        let response = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/v1/classrooms/{}", Uuid::new_v4()))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_seating_chart_replaces_existing_tables_and_seats(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        let old_table = insert_table(&pool, classroom.id, 0, 2, 2, 0, 0).await;
        insert_seat(&pool, old_table.id, None, 0).await;
        let app = app(pool.clone());

        let student_id = insert_student(&pool, 1, "Bob").await;
        let body = json!({
            "tables": [
                { "table_number": 0, "rows": 1, "cols": 2, "x_pos": 20, "y_pos": 40, "seat_assignments": [student_id, null] },
            ]
        });
        let response = app
            .oneshot(json_request(
                "PUT",
                &format!("/api/v1/classrooms/{}/seating-chart", classroom.id),
                body,
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

        let seats = sqlx::query_as!(
            SeatModel,
            r#"SELECT * FROM seats WHERE table_id = $1 ORDER BY seat_number"#,
            tables[0].id
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(seats.len(), 2);
        assert_eq!(seats[0].seat_number, 0);
        assert_eq!(seats[0].student_id, Some(student_id));
        assert_eq!(seats[1].seat_number, 1);
        assert_eq!(seats[1].student_id, None);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_seating_chart_assigns_table_number_from_request_index(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        let app = app(pool.clone());

        // x_pos deliberately doesn't match the intended table_number order,
        // so the assertion below only passes if table_number is driven by
        // request array index and not incidentally by x_pos or insert order.
        let body = json!({
            "tables": [
                { "table_number": 0, "rows": 1, "cols": 1, "x_pos": 900, "y_pos": 0, "seat_assignments": [] },
                { "table_number": 1, "rows": 1, "cols": 1, "x_pos": 100, "y_pos": 0, "seat_assignments": [] },
                { "table_number": 2, "rows": 1, "cols": 1, "x_pos": 500, "y_pos": 0, "seat_assignments": [] },
            ]
        });
        let response = app
            .oneshot(json_request(
                "PUT",
                &format!("/api/v1/classrooms/{}/seating-chart", classroom.id),
                body,
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

    #[sqlx::test(migrations = "../migrations")]
    async fn update_seating_chart_with_no_tables_clears_everything(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        insert_table(&pool, classroom.id, 0, 2, 2, 0, 0).await;
        let app = app(pool.clone());

        let body = json!({ "tables": [] });
        let response = app
            .oneshot(json_request(
                "PUT",
                &format!("/api/v1/classrooms/{}/seating-chart", classroom.id),
                body,
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

    #[sqlx::test(migrations = "../migrations")]
    async fn get_seating_chart_returns_only_assigned_seats(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        let table = insert_table(&pool, classroom.id, 0, 2, 2, 0, 0).await;
        let student_id = insert_student(&pool, 1, "Bob").await;
        insert_seat(&pool, table.id, Some(student_id), 0).await;
        insert_seat(&pool, table.id, None, 1).await;
        let app = app(pool);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/v1/classrooms/{}/seating-chart", classroom.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["tables"][0]["rows"], 2);
        assert_eq!(json["data"]["tables"][0]["cols"], 2);
        let assignments = json["data"]["tables"][0]["seat_assignments"]
            .as_array()
            .unwrap();
        assert_eq!(assignments[0], student_id.to_string());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn get_seating_chart_groups_assignments_in_table_insertion_order(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        // x_pos/y_pos deliberately sort the opposite of insertion order, so
        // the response order can only be right if it's driven by
        // table_number and not accidentally by position or id.
        let first_table = insert_table(&pool, classroom.id, 0, 2, 2, 100, 100).await;
        let second_table = insert_table(&pool, classroom.id, 1, 2, 2, 0, 0).await;
        let student_a = insert_student(&pool, 1, "Alice").await;
        let student_b = insert_student(&pool, 2, "Bob").await;
        insert_seat(&pool, second_table.id, Some(student_b), 0).await;
        insert_seat(&pool, first_table.id, Some(student_a), 0).await;
        let app = app(pool);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/v1/classrooms/{}/seating-chart", classroom.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let tables = json["data"]["tables"].as_array().unwrap();
        assert_eq!(tables.len(), 2);
        assert_eq!(tables[0]["seat_assignments"][0], student_a.to_string());
        assert_eq!(tables[1]["seat_assignments"][0], student_b.to_string());
        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn get_seating_chart_with_no_tables_returns_empty_list(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        let app = app(pool);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/v1/classrooms/{}/seating-chart", classroom.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert!(json["data"]["tables"].as_array().unwrap().is_empty());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn randomize_seating_chart_rejects_out_of_range_new_table_dimensions(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        let app = app(pool);

        let body = json!({
            "keep_existing_tables": false,
            "new_table_rows": 0,
            "new_table_cols": 16,
            "existing_tables": [],
            "boundary_width": 1080,
            "boundary_height": 820
        });
        let response = app
            .oneshot(json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn randomize_seating_chart_nonexistent_classroom_returns_404(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool);

        let body = json!({
            "keep_existing_tables": false,
            "new_table_rows": 2,
            "new_table_cols": 2,
            "existing_tables": [],
            "boundary_width": 1080,
            "boundary_height": 820
        });
        let response = app
            .oneshot(json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    Uuid::new_v4()
                ),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn randomize_seating_chart_only_seats_students_in_this_classroom(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        let other_classroom = insert_classroom(&pool, "Science 1", 4).await;
        let in_classroom = insert_student_in_classroom(&pool, classroom.id, 1, "Alice").await;
        insert_student_in_classroom(&pool, other_classroom.id, 2, "Bob").await;
        insert_student(&pool, 3, "Unassigned").await;
        let app = app(pool);

        let body = json!({
            "keep_existing_tables": false,
            "new_table_rows": 2,
            "new_table_cols": 2,
            "existing_tables": [],
            "boundary_width": 1080,
            "boundary_height": 820
        });
        let response = app
            .oneshot(json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
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

    #[sqlx::test(migrations = "../migrations")]
    async fn randomize_seating_chart_never_persists_anything(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        let table = insert_table(&pool, classroom.id, 0, 2, 2, 40, 40).await;
        let student_id = insert_student_in_classroom(&pool, classroom.id, 1, "Alice").await;
        insert_seat(&pool, table.id, Some(student_id), 0).await;
        let app = app(pool.clone());

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
            .oneshot(json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let tables_after = fetch_tables_for_classroom(&pool, classroom.id).await;
        assert_eq!(tables_after.len(), 1);
        assert_eq!(tables_after[0].id, table.id);

        let seats_after = sqlx::query_as!(
            SeatModel,
            r#"SELECT * FROM seats WHERE table_id = $1"#,
            table.id
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(seats_after.len(), 1);
        assert_eq!(seats_after[0].student_id, Some(student_id));

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn randomize_seating_chart_errors_when_boundary_too_small(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        for i in 0..8 {
            insert_student_in_classroom(&pool, classroom.id, i, "Student").await;
        }
        let app = app(pool);

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
            .oneshot(json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn randomize_seating_chart_packs_within_constrained_boundary(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        for i in 0..16 {
            insert_student_in_classroom(&pool, classroom.id, i, "Student").await;
        }
        let app = app(pool);

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
            .oneshot(json_request(
                "POST",
                &format!(
                    "/api/v1/classrooms/{}/seating-chart/randomize",
                    classroom.id
                ),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
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
}

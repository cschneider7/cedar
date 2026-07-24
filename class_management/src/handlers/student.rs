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
    model::StudentModel,
    schema::{StudentSchema, UpdateStudentSchema},
};

/// Lists every student, ordered by name.
pub async fn student_list_handler(
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let students = sqlx::query_as!(StudentModel, r#"SELECT * FROM students ORDER by name"#)
        .fetch_all(&data.db)
        .await?;

    Ok((StatusCode::OK, Json(json!({"data": students}))))
}

/// Fetches a single student by its uuid.
pub async fn get_student_handler(
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let student = sqlx::query_as!(StudentModel, r#"SELECT * FROM students WHERE id = $1"#, &id)
        .fetch_one(&data.db)
        .await?;

    Ok((StatusCode::OK, Json(json!({"data": student}))))
}

/// Creates a new student, optionally assigned to a classroom.
pub async fn create_student_handler(
    State(data): State<Arc<AppState>>,
    Json(body): Json<StudentSchema>,
) -> Result<impl IntoResponse, AppError> {
    let student = sqlx::query_as!(
        StudentModel,
        r#"INSERT INTO students (
            classroom_id,
            student_id,
            name
        )
        VALUES ($1, $2, $3)
        RETURNING *"#,
        body.classroom_id,
        body.student_id,
        &body.name
    )
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::CREATED, Json(json!({"data": student}))))
}

/// Partially updates a student, merging provided fields over its existing
/// values before writing them back.
pub async fn update_student_handler(
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
    Json(body): Json<UpdateStudentSchema>,
) -> Result<impl IntoResponse, AppError> {
    let student = sqlx::query_as!(StudentModel, r#"SELECT * FROM students WHERE id = $1"#, &id)
        .fetch_one(&data.db)
        .await?;

    let new_classroom_id = body.classroom_id.unwrap_or(student.classroom_id);
    let new_student_id = body.student_id.unwrap_or(student.student_id);
    let new_name = body.name.as_ref().unwrap_or(&student.name);

    let updated_student = sqlx::query_as!(
        StudentModel,
        r#"UPDATE students SET
            classroom_id = $1,
            student_id = $2,
            name = $3
        WHERE id = $4
        RETURNING *"#,
        new_classroom_id,
        new_student_id,
        &new_name,
        student.id
    )
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({"data": updated_student}))))
}

/// Deletes a student by its uuid.
pub async fn delete_student_handler(
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let student = sqlx::query_as!(
        StudentModel,
        r#"DELETE FROM students WHERE id = $1 RETURNING *"#,
        &id
    )
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({"data": student}))))
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
    use crate::test_support::{app, body_json, insert_classroom, json_request};

    async fn insert_student(
        pool: &sqlx::PgPool,
        classroom_id: Option<Uuid>,
        student_id: i32,
        name: &str,
    ) -> StudentModel {
        sqlx::query_as!(
            StudentModel,
            r#"INSERT INTO students (classroom_id, student_id, name)
            VALUES ($1, $2, $3)
            RETURNING *"#,
            classroom_id,
            student_id,
            name
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn fetch_student(pool: &sqlx::PgPool, id: Uuid) -> Option<StudentModel> {
        sqlx::query_as!(StudentModel, r#"SELECT * FROM students WHERE id = $1"#, id)
            .fetch_optional(pool)
            .await
            .unwrap()
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn create_student_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool);
        let body = json!({
            "student_id": 1,
            "name": "Bob Burger",
            "classroom_id": null,
            "seat_id": null,
        });

        let response = app
            .oneshot(json_request("POST", "/api/v1/students", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        let json = body_json(response).await;
        assert_eq!(json["data"]["student_id"], 1);
        assert_eq!(json["data"]["name"], "Bob Burger");
        assert!(json["data"]["classroom_id"].is_null());

        Ok(())
    }

    // `student_id` has no uniqueness constraint, so duplicates are accepted.
    #[sqlx::test(migrations = "../migrations")]
    async fn create_student_allows_duplicate_student_id(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool);
        let body =
            json!({"student_id": 42, "name": "First", "classroom_id": null, "seat_id": null});
        let first = app
            .clone()
            .oneshot(json_request("POST", "/api/v1/students", body))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::CREATED);

        let body =
            json!({"student_id": 42, "name": "Second", "classroom_id": null, "seat_id": null});
        let second = app
            .oneshot(json_request("POST", "/api/v1/students", body))
            .await
            .unwrap();
        assert_eq!(second.status(), StatusCode::CREATED);

        Ok(())
    }

    // `classroom_id` has a FK constraint, so a nonexistent one is rejected.
    #[sqlx::test(migrations = "../migrations")]
    async fn create_student_rejects_nonexistent_classroom_id(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool);
        let fake_classroom_id = Uuid::new_v4();
        let body = json!({
            "student_id": 1,
            "name": "Bob Burger",
            "classroom_id": fake_classroom_id,
            "seat_id": null,
        });

        let response = app
            .oneshot(json_request("POST", "/api/v1/students", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_student_partial_leaves_other_fields_unchanged(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let existing = insert_student(&pool, None, 7, "Original Name").await;
        let app = app(pool);

        let body = json!({"name": "Updated Name"});
        let response = app
            .oneshot(json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["name"], "Updated Name");
        assert_eq!(json["data"]["student_id"], existing.student_id);
        assert!(json["data"]["classroom_id"].is_null());
        assert!(json["data"]["seat_id"].is_null());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_student_nonexistent_id_returns_404(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool);
        let body = json!({"name": "Doesn't Matter"});

        let response = app
            .oneshot(json_request(
                "PATCH",
                &format!("/api/v1/students/{}", Uuid::new_v4()),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    // Double-Option deserialization: omitted keeps, explicit null clears.
    #[sqlx::test(migrations = "../migrations")]
    async fn update_student_omitted_classroom_id_keeps_existing_value(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        let existing = insert_student(&pool, Some(classroom.id), 1, "Bob").await;
        let app = app(pool);

        let body = json!({"name": "Bob Updated"});
        let response = app
            .oneshot(json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["classroom_id"], classroom.id.to_string());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_student_explicit_null_classroom_id_clears_value(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let classroom = insert_classroom(&pool, "Math 2", 3).await;
        let existing = insert_student(&pool, Some(classroom.id), 1, "Bob").await;
        let app = app(pool);

        let body = json!({"classroom_id": null});
        let response = app
            .oneshot(json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert!(json["data"]["classroom_id"].is_null());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_student_new_classroom_id_sets_value(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let existing = insert_student(&pool, None, 1, "Bob").await;
        let new_classroom = insert_classroom(&pool, "Math 2", 3).await;
        let app = app(pool);

        let body = json!({"classroom_id": new_classroom.id});
        let response = app
            .oneshot(json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["classroom_id"], new_classroom.id.to_string());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn delete_student_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let existing = insert_student(&pool, None, 1, "Bob").await;
        let app = app(pool.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/v1/students/{}", existing.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["id"], existing.id.to_string());

        assert!(fetch_student(&pool, existing.id).await.is_none());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn delete_student_nonexistent_id_returns_404(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool);

        let response = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/v1/students/{}", Uuid::new_v4()))
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
}

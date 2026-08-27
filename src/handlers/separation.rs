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
    AppState, auth::CurrentUserId, error::AppError, model::StudentSeparationModel,
    schema::CreateSeparationSchema,
};

/// Confirms `student_id` is owned by `user_id`.
async fn check_student_ownership(
    db: &sqlx::PgPool,
    student_id: Uuid,
    user_id: &str,
) -> Result<(), AppError> {
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM students WHERE id = $1 AND user_id = $2)")
            .bind(student_id)
            .bind(user_id)
            .fetch_one(db)
            .await?;
    if !exists {
        return Err(AppError::NotFound("Student not found".to_string()));
    }
    Ok(())
}

/// Lists every student separation pair belonging to the current user
pub async fn list_separations_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let separations: Vec<StudentSeparationModel> =
        sqlx::query_as("SELECT * FROM student_separations WHERE user_id = $1")
            .bind(user_id)
            .fetch_all(&data.db)
            .await?;
    Ok((StatusCode::OK, Json(json!({"data": separations}))))
}

/// Creates a student separation between two students
pub async fn create_separation_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
    Json(body): Json<CreateSeparationSchema>,
) -> Result<impl IntoResponse, AppError> {
    if body.student_id_a == body.student_id_b {
        return Err(AppError::BadRequest(
            "A student can't be separated from themselves".to_string(),
        ));
    }
    check_student_ownership(&data.db, body.student_id_a, &user_id).await?;
    check_student_ownership(&data.db, body.student_id_b, &user_id).await?;

    let (id_a, id_b) = if body.student_id_a < body.student_id_b {
        (body.student_id_a, body.student_id_b)
    } else {
        (body.student_id_b, body.student_id_a)
    };

    let inserted: Option<StudentSeparationModel> = sqlx::query_as(
        "INSERT INTO student_separations (user_id, student_id_a, student_id_b)
        VALUES ($1, $2, $3)
        ON CONFLICT (student_id_a, student_id_b) DO NOTHING
        RETURNING *",
    )
    .bind(user_id)
    .bind(id_a)
    .bind(id_b)
    .fetch_optional(&data.db)
    .await?;

    let separation =
        match inserted {
            Some(separation) => separation,
            None => sqlx::query_as(
                "SELECT * FROM student_separations WHERE student_id_a = $1 AND student_id_b = $2",
            )
            .bind(id_a)
            .bind(id_b)
            .fetch_one(&data.db)
            .await?,
        };

    Ok((StatusCode::CREATED, Json(json!({"data": separation}))))
}

/// Deletes a separation pair
pub async fn delete_separation_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let separation: StudentSeparationModel = sqlx::query_as(
        "DELETE FROM student_separations WHERE id = $1 AND user_id = $2 RETURNING *",
    )
    .bind(id)
    .bind(user_id)
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({"data": separation}))))
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;
    use serde_json::json;
    use tower::ServiceExt;
    use uuid::Uuid;

    use crate::test_support::{
        app, authenticated_json_request, authenticated_request, body_json, test_user_id,
    };

    async fn insert_student(
        pool: &sqlx::PgPool,
        user_id: &str,
        student_id: i32,
        name: &str,
    ) -> Uuid {
        sqlx::query_scalar(
            "INSERT INTO students (user_id, classroom_id, student_id, name)
            VALUES ($1, NULL, $2, $3)
            RETURNING id",
        )
        .bind(user_id)
        .bind(student_id)
        .bind(name)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    #[sqlx::test]
    async fn list_separations_scoped_to_user(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let other_id = test_user_id();
        let a = insert_student(&pool, &user_id, 1, "Alice").await;
        let b = insert_student(&pool, &user_id, 2, "Bob").await;
        let c = insert_student(&pool, &other_id, 3, "Carol").await;
        let d = insert_student(&pool, &other_id, 4, "Dan").await;

        app.clone()
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/separations",
                json!({"student_id_a": a, "student_id_b": b}),
                &user_id,
            ))
            .await
            .unwrap();
        app.clone()
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/separations",
                json!({"student_id_a": c, "student_id_b": d}),
                &other_id,
            ))
            .await
            .unwrap();

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/separations",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let data = json["data"].as_array().unwrap();
        assert_eq!(data.len(), 1);

        Ok(())
    }

    #[sqlx::test]
    async fn create_separation_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let a = insert_student(&pool, &user_id, 1, "Alice").await;
        let b = insert_student(&pool, &user_id, 2, "Bob").await;

        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/separations",
                json!({"student_id_a": a, "student_id_b": b}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        let json = body_json(response).await;
        let stored: std::collections::HashSet<String> = [
            json["data"]["student_id_a"].as_str().unwrap().to_string(),
            json["data"]["student_id_b"].as_str().unwrap().to_string(),
        ]
        .into_iter()
        .collect();
        assert_eq!(stored, [a.to_string(), b.to_string()].into_iter().collect());

        Ok(())
    }

    #[sqlx::test]
    async fn create_separation_is_idempotent_regardless_of_order(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let a = insert_student(&pool, &user_id, 1, "Alice").await;
        let b = insert_student(&pool, &user_id, 2, "Bob").await;

        let first = app
            .clone()
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/separations",
                json!({"student_id_a": a, "student_id_b": b}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::CREATED);
        let first_json = body_json(first).await;
        let first_id = first_json["data"]["id"].clone();

        let second = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/separations",
                json!({"student_id_a": b, "student_id_b": a}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(second.status(), StatusCode::CREATED);
        let second_json = body_json(second).await;
        assert_eq!(second_json["data"]["id"], first_id);

        Ok(())
    }

    #[sqlx::test]
    async fn create_separation_rejects_self_pair(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let a = insert_student(&pool, &user_id, 1, "Alice").await;

        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/separations",
                json!({"student_id_a": a, "student_id_b": a}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }

    #[sqlx::test]
    async fn create_separation_rejects_another_users_student(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let other_id = test_user_id();
        let a = insert_student(&pool, &user_id, 1, "Alice").await;
        let c = insert_student(&pool, &other_id, 3, "Carol").await;

        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/separations",
                json!({"student_id_a": a, "student_id_b": c}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[sqlx::test]
    async fn delete_separation_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let a = insert_student(&pool, &user_id, 1, "Alice").await;
        let b = insert_student(&pool, &user_id, 2, "Bob").await;

        let create_response = app
            .clone()
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/separations",
                json!({"student_id_a": a, "student_id_b": b}),
                &user_id,
            ))
            .await
            .unwrap();
        let created = body_json(create_response).await;
        let id = created["data"]["id"].as_str().unwrap();

        let response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/separations/{id}"),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        Ok(())
    }

    #[sqlx::test]
    async fn delete_separation_rejects_another_users_pair(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let other_id = test_user_id();
        let a = insert_student(&pool, &user_id, 1, "Alice").await;
        let b = insert_student(&pool, &user_id, 2, "Bob").await;

        let create_response = app
            .clone()
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/separations",
                json!({"student_id_a": a, "student_id_b": b}),
                &user_id,
            ))
            .await
            .unwrap();
        let created = body_json(create_response).await;
        let id = created["data"]["id"].as_str().unwrap();

        let response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/separations/{id}"),
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[sqlx::test]
    async fn deleting_a_student_cascades_to_its_separations(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let a = insert_student(&pool, &user_id, 1, "Alice").await;
        let b = insert_student(&pool, &user_id, 2, "Bob").await;

        app.clone()
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/separations",
                json!({"student_id_a": a, "student_id_b": b}),
                &user_id,
            ))
            .await
            .unwrap();

        sqlx::query("DELETE FROM students WHERE id = $1")
            .bind(a)
            .execute(&pool)
            .await
            .unwrap();

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/separations",
                &user_id,
            ))
            .await
            .unwrap();
        let json = body_json(response).await;
        assert_eq!(json["data"].as_array().unwrap().len(), 0);

        Ok(())
    }
}

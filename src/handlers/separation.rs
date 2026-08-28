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
    AppState, auth::CurrentUserId, error::AppError, model::StudentSeparationModel,
    schema::CreateSeparationSchema,
};

/// Confirms `student_id` is owned by `user_id`.
async fn check_student_ownership(
    client: &tokio_postgres::Client,
    student_id: Uuid,
    user_id: &str,
) -> Result<(), AppError> {
    let exists: bool = client
        .query_typed_one(
            "SELECT EXISTS(SELECT 1 FROM students WHERE id = $1 AND user_id = $2)",
            &[(&student_id, Type::UUID), (&user_id, Type::TEXT)],
        )
        .await?
        .get(0);
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
    let conn = data.db.get().await?;
    let rows = conn
        .query_typed(
            "SELECT * FROM student_separations WHERE user_id = $1",
            &[(&user_id, Type::TEXT)],
        )
        .await?;
    let separations = rows
        .iter()
        .map(StudentSeparationModel::try_from_row)
        .collect::<Result<Vec<_>, _>>()?;
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
    let conn = data.db.get().await?;
    check_student_ownership(&conn, body.student_id_a, &user_id).await?;
    check_student_ownership(&conn, body.student_id_b, &user_id).await?;

    let (id_a, id_b) = if body.student_id_a < body.student_id_b {
        (body.student_id_a, body.student_id_b)
    } else {
        (body.student_id_b, body.student_id_a)
    };

    let inserted = conn
        .query_typed_opt(
            "INSERT INTO student_separations (user_id, student_id_a, student_id_b)
        VALUES ($1, $2, $3)
        ON CONFLICT (student_id_a, student_id_b) DO NOTHING
        RETURNING *",
            &[
                (&user_id, Type::TEXT),
                (&id_a, Type::UUID),
                (&id_b, Type::UUID),
            ],
        )
        .await?;

    let row = match inserted {
        Some(row) => row,
        None => {
            conn.query_typed_one(
                "SELECT * FROM student_separations WHERE student_id_a = $1 AND student_id_b = $2",
                &[(&id_a, Type::UUID), (&id_b, Type::UUID)],
            )
            .await?
        }
    };
    let separation = StudentSeparationModel::try_from_row(&row)?;

    Ok((StatusCode::CREATED, Json(json!({"data": separation}))))
}

/// Deletes a separation pair
pub async fn delete_separation_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;
    let row = conn
        .query_typed_opt(
            "DELETE FROM student_separations WHERE id = $1 AND user_id = $2 RETURNING *",
            &[(&id, Type::UUID), (&user_id, Type::TEXT)],
        )
        .await?
        .ok_or_else(|| AppError::NotFound("Separation not found".to_string()))?;
    let separation = StudentSeparationModel::try_from_row(&row)?;

    Ok((StatusCode::OK, Json(json!({"data": separation}))))
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;
    use serde_json::json;
    use tokio_postgres::types::Type;
    use tower::ServiceExt;
    use uuid::Uuid;

    use crate::test_support::{
        app, authenticated_json_request, authenticated_request, body_json, seed_exec, seed_scalar,
        test_user_id,
    };

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

    #[tokio::test]
    async fn list_separations_scoped_to_user() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn create_separation_success() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn create_separation_is_idempotent_regardless_of_order() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn create_separation_rejects_self_pair() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn create_separation_rejects_another_users_student() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn delete_separation_success() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn delete_separation_rejects_another_users_pair() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn deleting_a_student_cascades_to_its_separations() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

        seed_exec(
            &pool,
            "DELETE FROM students WHERE id = $1",
            &[(&a, Type::UUID)],
        )
        .await;

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

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use axum_login::AuthSession;
use serde_json::json;
use uuid::Uuid;

use crate::{
    AppState,
    auth::Backend,
    error::AppError,
    model::StudentModel,
    schema::{StudentSchema, UpdateStudentSchema},
};

fn current_user_id(auth_session: &AuthSession<Backend>) -> Uuid {
    auth_session
        .user
        .as_ref()
        .expect("route is behind login_required")
        .id
}

/// Confirms `classroom_id` (if present) is owned by `user_id`, so a student
/// can't be assigned into another user's classroom.
async fn check_classroom_ownership(
    db: &sqlx::PgPool,
    classroom_id: Option<Uuid>,
    user_id: Uuid,
) -> Result<(), AppError> {
    let Some(classroom_id) = classroom_id else {
        return Ok(());
    };
    let exists = sqlx::query_scalar!(
        r#"SELECT EXISTS(SELECT 1 FROM classrooms WHERE id = $1 AND user_id = $2) as "exists!""#,
        classroom_id,
        user_id
    )
    .fetch_one(db)
    .await?;
    if !exists {
        return Err(AppError::NotFound("Classroom not found".to_string()));
    }
    Ok(())
}

/// Lists every student owned by the current user, ordered by name.
pub async fn student_list_handler(
    auth_session: AuthSession<Backend>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = current_user_id(&auth_session);
    let students = sqlx::query_as!(
        StudentModel,
        r#"SELECT * FROM students WHERE user_id = $1 ORDER by name"#,
        user_id
    )
    .fetch_all(&data.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({"data": students}))))
}

/// Fetches a single student by its uuid, scoped to the current user.
pub async fn get_student_handler(
    auth_session: AuthSession<Backend>,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = current_user_id(&auth_session);
    let student = sqlx::query_as!(
        StudentModel,
        r#"SELECT * FROM students WHERE id = $1 AND user_id = $2"#,
        &id,
        user_id
    )
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({"data": student}))))
}

/// Creates a new student owned by the current user, optionally assigned to
/// one of their classrooms.
pub async fn create_student_handler(
    auth_session: AuthSession<Backend>,
    State(data): State<Arc<AppState>>,
    Json(body): Json<StudentSchema>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = current_user_id(&auth_session);
    check_classroom_ownership(&data.db, body.classroom_id, user_id).await?;

    let student = sqlx::query_as!(
        StudentModel,
        r#"INSERT INTO students (
            user_id,
            classroom_id,
            student_id,
            name
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *"#,
        user_id,
        body.classroom_id,
        body.student_id,
        &body.name
    )
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::CREATED, Json(json!({"data": student}))))
}

/// Partially updates a student, merging provided fields over its existing
/// values before writing them back. Scoped to the current user.
pub async fn update_student_handler(
    auth_session: AuthSession<Backend>,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
    Json(body): Json<UpdateStudentSchema>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = current_user_id(&auth_session);
    let student = sqlx::query_as!(
        StudentModel,
        r#"SELECT * FROM students WHERE id = $1 AND user_id = $2"#,
        &id,
        user_id
    )
    .fetch_one(&data.db)
    .await?;

    let new_classroom_id = body.classroom_id.unwrap_or(student.classroom_id);
    let new_student_id = body.student_id.unwrap_or(student.student_id);
    let new_name = body.name.as_ref().unwrap_or(&student.name);

    check_classroom_ownership(&data.db, new_classroom_id, user_id).await?;

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

/// Deletes a student by its uuid, scoped to the current user.
pub async fn delete_student_handler(
    auth_session: AuthSession<Backend>,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = current_user_id(&auth_session);
    let student = sqlx::query_as!(
        StudentModel,
        r#"DELETE FROM students WHERE id = $1 AND user_id = $2 RETURNING *"#,
        &id,
        user_id
    )
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({"data": student}))))
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;
    use serde_json::json;
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;
    use crate::test_support::{
        app, authenticated_json_request, authenticated_request, body_json,
        insert_authenticated_user, insert_classroom,
    };

    async fn insert_student(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        classroom_id: Option<Uuid>,
        student_id: i32,
        name: &str,
    ) -> StudentModel {
        sqlx::query_as!(
            StudentModel,
            r#"INSERT INTO students (user_id, classroom_id, student_id, name)
            VALUES ($1, $2, $3, $4)
            RETURNING *"#,
            user_id,
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
        let app = app(pool.clone());
        let (_user, cookie) =
            insert_authenticated_user(app.clone(), &pool, "test@example.com").await;
        let body = json!({
            "student_id": 1,
            "name": "Bob Burger",
            "classroom_id": null,
            "seat_id": null,
        });

        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/students",
                body,
                &cookie,
            ))
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
        let app = app(pool.clone());
        let (_user, cookie) =
            insert_authenticated_user(app.clone(), &pool, "test@example.com").await;
        let body =
            json!({"student_id": 42, "name": "First", "classroom_id": null, "seat_id": null});
        let first = app
            .clone()
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/students",
                body,
                &cookie,
            ))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::CREATED);

        let body =
            json!({"student_id": 42, "name": "Second", "classroom_id": null, "seat_id": null});
        let second = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/students",
                body,
                &cookie,
            ))
            .await
            .unwrap();
        assert_eq!(second.status(), StatusCode::CREATED);

        Ok(())
    }

    // `check_classroom_ownership` rejects any classroom_id that doesn't
    // belong to the caller — including one that doesn't exist at all.
    #[sqlx::test(migrations = "../migrations")]
    async fn create_student_rejects_nonexistent_classroom_id(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let (_user, cookie) =
            insert_authenticated_user(app.clone(), &pool, "test@example.com").await;
        let fake_classroom_id = Uuid::new_v4();
        let body = json!({
            "student_id": 1,
            "name": "Bob Burger",
            "classroom_id": fake_classroom_id,
            "seat_id": null,
        });

        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/students",
                body,
                &cookie,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn create_student_rejects_another_users_classroom_id(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let (owner, _owner_cookie) =
            insert_authenticated_user(app.clone(), &pool, "owner@example.com").await;
        let (_other, other_cookie) =
            insert_authenticated_user(app.clone(), &pool, "other@example.com").await;
        let owners_classroom = insert_classroom(&pool, owner.id, "Math 2", 3).await;

        let body = json!({
            "student_id": 1,
            "name": "Evil Student",
            "classroom_id": owners_classroom.id,
            "seat_id": null,
        });
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/students",
                body,
                &other_cookie,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_student_partial_leaves_other_fields_unchanged(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let (user, cookie) =
            insert_authenticated_user(app.clone(), &pool, "test@example.com").await;
        let existing = insert_student(&pool, user.id, None, 7, "Original Name").await;

        let body = json!({"name": "Updated Name"});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &cookie,
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
        let app = app(pool.clone());
        let (_user, cookie) =
            insert_authenticated_user(app.clone(), &pool, "test@example.com").await;
        let body = json!({"name": "Doesn't Matter"});

        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", Uuid::new_v4()),
                body,
                &cookie,
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
        let app = app(pool.clone());
        let (user, cookie) =
            insert_authenticated_user(app.clone(), &pool, "test@example.com").await;
        let classroom = insert_classroom(&pool, user.id, "Math 2", 3).await;
        let existing = insert_student(&pool, user.id, Some(classroom.id), 1, "Bob").await;

        let body = json!({"name": "Bob Updated"});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &cookie,
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
        let app = app(pool.clone());
        let (user, cookie) =
            insert_authenticated_user(app.clone(), &pool, "test@example.com").await;
        let classroom = insert_classroom(&pool, user.id, "Math 2", 3).await;
        let existing = insert_student(&pool, user.id, Some(classroom.id), 1, "Bob").await;

        let body = json!({"classroom_id": null});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &cookie,
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
        let app = app(pool.clone());
        let (user, cookie) =
            insert_authenticated_user(app.clone(), &pool, "test@example.com").await;
        let existing = insert_student(&pool, user.id, None, 1, "Bob").await;
        let new_classroom = insert_classroom(&pool, user.id, "Math 2", 3).await;

        let body = json!({"classroom_id": new_classroom.id});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &cookie,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["classroom_id"], new_classroom.id.to_string());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn update_student_rejects_another_users_classroom_id(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let (owner, _owner_cookie) =
            insert_authenticated_user(app.clone(), &pool, "owner@example.com").await;
        let (other, other_cookie) =
            insert_authenticated_user(app.clone(), &pool, "other@example.com").await;
        let owners_classroom = insert_classroom(&pool, owner.id, "Math 2", 3).await;
        let others_student = insert_student(&pool, other.id, None, 1, "Bob").await;

        let body = json!({"classroom_id": owners_classroom.id});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", others_student.id),
                body,
                &other_cookie,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn delete_student_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let (user, cookie) =
            insert_authenticated_user(app.clone(), &pool, "test@example.com").await;
        let existing = insert_student(&pool, user.id, None, 1, "Bob").await;

        let response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/students/{}", existing.id),
                &cookie,
            ))
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
        let app = app(pool.clone());
        let (_user, cookie) =
            insert_authenticated_user(app.clone(), &pool, "test@example.com").await;

        let response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/students/{}", Uuid::new_v4()),
                &cookie,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    // --- auth/scoping coverage ---

    #[sqlx::test(migrations = "../migrations")]
    async fn unauthenticated_requests_return_401(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let student_id = Uuid::new_v4();

        for (method, uri) in [
            ("GET", "/api/v1/students".to_string()),
            ("POST", "/api/v1/students".to_string()),
            ("GET", format!("/api/v1/students/{student_id}")),
            ("PATCH", format!("/api/v1/students/{student_id}")),
            ("DELETE", format!("/api/v1/students/{student_id}")),
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

    #[sqlx::test(migrations = "../migrations")]
    async fn cross_user_get_update_delete_student_returns_404(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let (owner, _owner_cookie) =
            insert_authenticated_user(app.clone(), &pool, "owner@example.com").await;
        let (_other, other_cookie) =
            insert_authenticated_user(app.clone(), &pool, "other@example.com").await;
        let student = insert_student(&pool, owner.id, None, 1, "Bob").await;

        let get_response = app
            .clone()
            .oneshot(authenticated_request(
                "GET",
                &format!("/api/v1/students/{}", student.id),
                &other_cookie,
            ))
            .await
            .unwrap();
        assert_eq!(get_response.status(), StatusCode::NOT_FOUND);

        let update_response = app
            .clone()
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", student.id),
                json!({"name": "Hijacked"}),
                &other_cookie,
            ))
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::NOT_FOUND);

        let delete_response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/students/{}", student.id),
                &other_cookie,
            ))
            .await
            .unwrap();
        assert_eq!(delete_response.status(), StatusCode::NOT_FOUND);

        assert!(fetch_student(&pool, student.id).await.is_some());

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn list_students_excludes_other_users_students(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let (user_a, cookie_a) =
            insert_authenticated_user(app.clone(), &pool, "usera@example.com").await;
        let (user_b, _cookie_b) =
            insert_authenticated_user(app.clone(), &pool, "userb@example.com").await;
        let student_a = insert_student(&pool, user_a.id, None, 1, "Alice").await;
        insert_student(&pool, user_b.id, None, 2, "Bob").await;

        let response = app
            .oneshot(authenticated_request("GET", "/api/v1/students", &cookie_a))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let students = json["data"].as_array().unwrap();
        assert_eq!(students.len(), 1);
        assert_eq!(students[0]["id"], student_a.id.to_string());

        Ok(())
    }
}

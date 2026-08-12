use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde_json::json;
use uuid::Uuid;

use crate::{
    AppState,
    auth::CurrentUserId,
    error::AppError,
    model::StudentModel,
    schema::{
        BulkDeleteStudentsSchema, SortDir, StudentListParams, StudentSchema, StudentSortBy,
        UpdateStudentSchema,
    },
};

/// Cost/infra protection ceiling: a flat cap on students per user account,
/// counted across all of their classrooms (including unassigned students).
const MAX_STUDENTS_PER_USER: i64 = 850;

/// Rejects a new student if `user_id` is already at `MAX_STUDENTS_PER_USER`.
async fn check_student_limit(db: &sqlx::PgPool, user_id: &str) -> Result<(), AppError> {
    let count = sqlx::query_scalar!(
        r#"SELECT COUNT(*) as "count!" FROM students WHERE user_id = $1"#,
        user_id
    )
    .fetch_one(db)
    .await?;
    if count >= MAX_STUDENTS_PER_USER {
        return Err(AppError::BadRequest(
            "Student limit reached (850 students per account).".to_string(),
        ));
    }
    Ok(())
}

/// Confirms `classroom_id` (if present) is owned by `user_id`, so a student
/// can't be assigned into another user's classroom.
async fn check_classroom_ownership(
    db: &sqlx::PgPool,
    classroom_id: Option<Uuid>,
    user_id: &str,
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

/// Lists students owned by the current user, ordered by name. With no query
/// params, returns the full unpaginated roster (today's exact behavior,
/// still consumed unchanged by classroom pages). With any of
/// `page`/`page_size`/`q`/`sort_by`/`sort_dir` present, returns a paginated
/// `{students, page, page_size, total_count, total_pages}` envelope instead,
/// filtering `name` via case-insensitive `ILIKE` when `q` is set and
/// ordering by `sort_by`/`sort_dir` (default: name ascending). Sorting by
/// `classroom` orders by period, with unassigned students always last
/// regardless of direction. Out-of-range `page` is clamped server-side to
/// `[1, total_pages]`.
pub async fn student_list_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
    Query(params): Query<StudentListParams>,
) -> Result<impl IntoResponse, AppError> {
    if params.page.is_none()
        && params.page_size.is_none()
        && params.q.is_none()
        && params.sort_by.is_none()
        && params.sort_dir.is_none()
    {
        let students = sqlx::query_as!(
            StudentModel,
            r#"SELECT * FROM students WHERE user_id = $1 ORDER by name"#,
            user_id
        )
        .fetch_all(&data.db)
        .await?;
        return Ok((StatusCode::OK, Json(json!({"data": students}))));
    }

    let page_size = params.page_size.unwrap_or(20).clamp(1, 100);
    let requested_page = params.page.unwrap_or(1).max(1);
    let q = params.q.filter(|q| !q.is_empty());
    let like_pattern = q.as_ref().map(|q| format!("%{q}%"));
    let sort_by = params.sort_by.unwrap_or(StudentSortBy::Name);
    let sort_dir = params.sort_dir.unwrap_or(SortDir::Asc);

    let total_count = sqlx::query_scalar!(
        r#"SELECT COUNT(*) as "count!" FROM students
           WHERE user_id = $1 AND ($2::text IS NULL OR name ILIKE $2)"#,
        &user_id,
        like_pattern
    )
    .fetch_one(&data.db)
    .await?;

    let total_pages = ((total_count as f64) / (page_size as f64)).ceil().max(1.0) as i64;
    let page = requested_page.min(total_pages);
    let offset = (page - 1) * page_size;

    let students = match (sort_by, sort_dir) {
        (StudentSortBy::Name, SortDir::Asc) => {
            sqlx::query_as!(
                StudentModel,
                r#"SELECT * FROM students
                   WHERE user_id = $1 AND ($2::text IS NULL OR name ILIKE $2)
                   ORDER BY name ASC
                   LIMIT $3 OFFSET $4"#,
                &user_id,
                like_pattern,
                page_size,
                offset
            )
            .fetch_all(&data.db)
            .await?
        }
        (StudentSortBy::Name, SortDir::Desc) => {
            sqlx::query_as!(
                StudentModel,
                r#"SELECT * FROM students
                   WHERE user_id = $1 AND ($2::text IS NULL OR name ILIKE $2)
                   ORDER BY name DESC
                   LIMIT $3 OFFSET $4"#,
                &user_id,
                like_pattern,
                page_size,
                offset
            )
            .fetch_all(&data.db)
            .await?
        }
        (StudentSortBy::StudentId, SortDir::Asc) => {
            sqlx::query_as!(
                StudentModel,
                r#"SELECT * FROM students
                   WHERE user_id = $1 AND ($2::text IS NULL OR name ILIKE $2)
                   ORDER BY student_id ASC, name ASC
                   LIMIT $3 OFFSET $4"#,
                &user_id,
                like_pattern,
                page_size,
                offset
            )
            .fetch_all(&data.db)
            .await?
        }
        (StudentSortBy::StudentId, SortDir::Desc) => {
            sqlx::query_as!(
                StudentModel,
                r#"SELECT * FROM students
                   WHERE user_id = $1 AND ($2::text IS NULL OR name ILIKE $2)
                   ORDER BY student_id DESC, name ASC
                   LIMIT $3 OFFSET $4"#,
                &user_id,
                like_pattern,
                page_size,
                offset
            )
            .fetch_all(&data.db)
            .await?
        }
        (StudentSortBy::Classroom, SortDir::Asc) => {
            sqlx::query_as!(
                StudentModel,
                r#"SELECT students.* FROM students
                   LEFT JOIN classrooms ON classrooms.id = students.classroom_id
                   WHERE students.user_id = $1 AND ($2::text IS NULL OR students.name ILIKE $2)
                   ORDER BY (students.classroom_id IS NULL) ASC, classrooms.period ASC, students.name ASC
                   LIMIT $3 OFFSET $4"#,
                &user_id,
                like_pattern,
                page_size,
                offset
            )
            .fetch_all(&data.db)
            .await?
        }
        (StudentSortBy::Classroom, SortDir::Desc) => {
            sqlx::query_as!(
                StudentModel,
                r#"SELECT students.* FROM students
                   LEFT JOIN classrooms ON classrooms.id = students.classroom_id
                   WHERE students.user_id = $1 AND ($2::text IS NULL OR students.name ILIKE $2)
                   ORDER BY (students.classroom_id IS NULL) ASC, classrooms.period DESC, students.name ASC
                   LIMIT $3 OFFSET $4"#,
                &user_id,
                like_pattern,
                page_size,
                offset
            )
            .fetch_all(&data.db)
            .await?
        }
    };

    Ok((
        StatusCode::OK,
        Json(json!({
            "data": {
                "students": students,
                "page": page,
                "page_size": page_size,
                "total_count": total_count,
                "total_pages": total_pages,
            }
        })),
    ))
}

/// Fetches a single student by its uuid, scoped to the current user.
pub async fn get_student_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
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
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
    Json(body): Json<StudentSchema>,
) -> Result<impl IntoResponse, AppError> {
    check_student_limit(&data.db, &user_id).await?;
    check_classroom_ownership(&data.db, body.classroom_id, &user_id).await?;

    let student = sqlx::query_as!(
        StudentModel,
        r#"INSERT INTO students (
            user_id,
            classroom_id,
            student_id,
            name,
            image_url
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *"#,
        user_id,
        body.classroom_id,
        body.student_id,
        &body.name,
        body.image_url
    )
    .fetch_one(&data.db)
    .await?;

    Ok((StatusCode::CREATED, Json(json!({"data": student}))))
}

/// Returns the current user's total student count alongside the account cap
/// (`MAX_STUDENTS_PER_USER`), so the frontend can warn/block near the limit
/// ahead of a create actually failing.
pub async fn count_students_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let count = sqlx::query_scalar!(
        r#"SELECT COUNT(*) as "count!" FROM students WHERE user_id = $1"#,
        user_id
    )
    .fetch_one(&data.db)
    .await?;

    Ok((
        StatusCode::OK,
        Json(json!({"data": {"count": count, "limit": MAX_STUDENTS_PER_USER}})),
    ))
}

/// Partially updates a student, merging provided fields over its existing
/// values before writing them back. Scoped to the current user.
pub async fn update_student_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
    Json(body): Json<UpdateStudentSchema>,
) -> Result<impl IntoResponse, AppError> {
    let student = sqlx::query_as!(
        StudentModel,
        r#"SELECT * FROM students WHERE id = $1 AND user_id = $2"#,
        &id,
        &user_id
    )
    .fetch_one(&data.db)
    .await?;

    let new_classroom_id = body.classroom_id.unwrap_or(student.classroom_id);
    let new_student_id = body.student_id.unwrap_or(student.student_id);
    let new_name = body.name.as_ref().unwrap_or(&student.name);
    let new_image_url = body
        .image_url
        .clone()
        .unwrap_or_else(|| student.image_url.clone());

    check_classroom_ownership(&data.db, new_classroom_id, &user_id).await?;

    let updated_student = sqlx::query_as!(
        StudentModel,
        r#"UPDATE students SET
            classroom_id = $1,
            student_id = $2,
            name = $3,
            image_url = $4
        WHERE id = $5
        RETURNING *"#,
        new_classroom_id,
        new_student_id,
        &new_name,
        new_image_url,
        student.id
    )
    .fetch_one(&data.db)
    .await?;

    if student.image_url != updated_student.image_url
        && let Some(old_url) = student.image_url
    {
        data.blob_deleter.delete(old_url).await;
    }

    Ok((StatusCode::OK, Json(json!({"data": updated_student}))))
}

/// Deletes a student by its uuid, scoped to the current user.
pub async fn delete_student_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let student = sqlx::query_as!(
        StudentModel,
        r#"DELETE FROM students WHERE id = $1 AND user_id = $2 RETURNING *"#,
        &id,
        user_id
    )
    .fetch_one(&data.db)
    .await?;

    if let Some(url) = student.image_url.clone() {
        data.blob_deleter.delete(url).await;
    }

    Ok((StatusCode::OK, Json(json!({"data": student}))))
}

/// Deletes multiple students by uuid in one statement, scoped to the
/// current user. IDs that don't exist or aren't owned by the caller are
/// silently skipped (not an error) — `deleted_count` reflects how many
/// rows actually matched.
pub async fn bulk_delete_students_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
    Json(body): Json<BulkDeleteStudentsSchema>,
) -> Result<impl IntoResponse, AppError> {
    struct DeletedImageUrl {
        image_url: Option<String>,
    }

    let deleted = sqlx::query_as!(
        DeletedImageUrl,
        r#"DELETE FROM students WHERE user_id = $1 AND id = ANY($2) RETURNING image_url"#,
        user_id,
        &body.ids
    )
    .fetch_all(&data.db)
    .await?;

    for row in &deleted {
        if let Some(url) = row.image_url.clone() {
            data.blob_deleter.delete(url).await;
        }
    }

    Ok((
        StatusCode::OK,
        Json(json!({"data": {"deleted_count": deleted.len()}})),
    ))
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;
    use serde_json::json;
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;
    use crate::test_support::{
        RecordingBlobDeleter, app, app_with_blob_deleter, authenticated_json_request,
        authenticated_request, body_json, insert_classroom, test_user_id,
    };

    async fn insert_student(
        pool: &sqlx::PgPool,
        user_id: &str,
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

    async fn insert_student_with_image_url(
        pool: &sqlx::PgPool,
        user_id: &str,
        student_id: i32,
        name: &str,
        image_url: &str,
    ) -> StudentModel {
        sqlx::query_as!(
            StudentModel,
            r#"INSERT INTO students (user_id, classroom_id, student_id, name, image_url)
            VALUES ($1, NULL, $2, $3, $4)
            RETURNING *"#,
            user_id,
            student_id,
            name,
            image_url
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

    async fn seed_students(pool: &sqlx::PgPool, user_id: &str, count: i64) {
        sqlx::query!(
            r#"INSERT INTO students (user_id, student_id, name)
            SELECT $1, gs, 'Student ' || gs FROM generate_series(1, $2::int) AS gs"#,
            user_id,
            count as i32
        )
        .execute(pool)
        .await
        .unwrap();
    }

    #[sqlx::test]
    async fn create_student_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
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
                &user_id,
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

    #[sqlx::test]
    async fn create_student_rejects_at_limit(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        seed_students(&pool, &user_id, 850).await;

        let body = json!({"student_id": 851, "name": "One Too Many", "classroom_id": null});
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/students",
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }

    #[sqlx::test]
    async fn create_student_allows_up_to_limit(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        seed_students(&pool, &user_id, 849).await;

        let body = json!({"student_id": 850, "name": "Last One", "classroom_id": null});
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/students",
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        Ok(())
    }

    #[sqlx::test]
    async fn create_student_limit_is_per_user(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_a = test_user_id();
        let user_b = test_user_id();
        seed_students(&pool, &user_a, 850).await;

        let body = json!({"student_id": 1, "name": "New For B", "classroom_id": null});
        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/students",
                body,
                &user_b,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        Ok(())
    }

    #[sqlx::test]
    async fn count_students_handler_returns_count_and_limit(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let other_user_id = test_user_id();
        seed_students(&pool, &user_id, 3).await;
        seed_students(&pool, &other_user_id, 5).await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students/count",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["count"], 3);
        assert_eq!(json["data"]["limit"], 850);

        Ok(())
    }

    #[sqlx::test]
    async fn create_student_with_image_url_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let body = json!({
            "student_id": 1,
            "name": "Bob Burger",
            "classroom_id": null,
            "image_url": "students/user_1/bob.jpg",
        });

        let response = app
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/students",
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        let json = body_json(response).await;
        assert_eq!(json["data"]["image_url"], "students/user_1/bob.jpg");

        Ok(())
    }

    // `student_id` has no uniqueness constraint, so duplicates are accepted.
    #[sqlx::test]
    async fn create_student_allows_duplicate_student_id(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let body =
            json!({"student_id": 42, "name": "First", "classroom_id": null, "seat_id": null});
        let first = app
            .clone()
            .oneshot(authenticated_json_request(
                "POST",
                "/api/v1/students",
                body,
                &user_id,
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
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(second.status(), StatusCode::CREATED);

        Ok(())
    }

    // `check_classroom_ownership` rejects any classroom_id that doesn't
    // belong to the caller — including one that doesn't exist at all.
    #[sqlx::test]
    async fn create_student_rejects_nonexistent_classroom_id(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
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
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    #[sqlx::test]
    async fn create_student_rejects_another_users_classroom_id(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let owner_id = test_user_id();
        let other_id = test_user_id();
        let owners_classroom = insert_classroom(&pool, &owner_id, "Math 2", 3).await;

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
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[sqlx::test]
    async fn update_student_partial_leaves_other_fields_unchanged(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_student(&pool, &user_id, None, 7, "Original Name").await;

        let body = json!({"name": "Updated Name"});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &user_id,
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

    #[sqlx::test]
    async fn update_student_nonexistent_id_returns_404(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let body = json!({"name": "Doesn't Matter"});

        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", Uuid::new_v4()),
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

    // Double-Option deserialization: omitted keeps, explicit null clears.
    #[sqlx::test]
    async fn update_student_omitted_classroom_id_keeps_existing_value(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        let existing = insert_student(&pool, &user_id, Some(classroom.id), 1, "Bob").await;

        let body = json!({"name": "Bob Updated"});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["classroom_id"], classroom.id.to_string());

        Ok(())
    }

    #[sqlx::test]
    async fn update_student_explicit_null_classroom_id_clears_value(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;
        let existing = insert_student(&pool, &user_id, Some(classroom.id), 1, "Bob").await;

        let body = json!({"classroom_id": null});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert!(json["data"]["classroom_id"].is_null());

        Ok(())
    }

    #[sqlx::test]
    async fn update_student_new_classroom_id_sets_value(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_student(&pool, &user_id, None, 1, "Bob").await;
        let new_classroom = insert_classroom(&pool, &user_id, "Math 2", 3).await;

        let body = json!({"classroom_id": new_classroom.id});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["classroom_id"], new_classroom.id.to_string());

        Ok(())
    }

    #[sqlx::test]
    async fn update_student_rejects_another_users_classroom_id(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let owner_id = test_user_id();
        let other_id = test_user_id();
        let owners_classroom = insert_classroom(&pool, &owner_id, "Math 2", 3).await;
        let others_student = insert_student(&pool, &other_id, None, 1, "Bob").await;

        let body = json!({"classroom_id": owners_classroom.id});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", others_student.id),
                body,
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    // Double-Option deserialization for image_url: omitted keeps, explicit
    // null clears — same pattern as classroom_id above.
    #[sqlx::test]
    async fn update_student_omitted_image_url_keeps_existing_value(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing =
            insert_student_with_image_url(&pool, &user_id, 1, "Bob", "students/user_1/bob.jpg")
                .await;

        let body = json!({"name": "Bob Updated"});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["image_url"], "students/user_1/bob.jpg");

        Ok(())
    }

    #[sqlx::test]
    async fn update_student_explicit_null_image_url_clears_value(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing =
            insert_student_with_image_url(&pool, &user_id, 1, "Bob", "students/user_1/bob.jpg")
                .await;

        let body = json!({"image_url": null});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert!(json["data"]["image_url"].is_null());

        Ok(())
    }

    #[sqlx::test]
    async fn update_student_replacing_image_url_deletes_old_blob(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let recorder = std::sync::Arc::new(RecordingBlobDeleter::default());
        let app = app_with_blob_deleter(pool.clone(), recorder.clone());
        let user_id = test_user_id();
        let existing =
            insert_student_with_image_url(&pool, &user_id, 1, "Bob", "students/user_1/old.jpg")
                .await;

        let body = json!({"image_url": "students/user_1/new.jpg"});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        assert_eq!(
            *recorder.0.lock().unwrap(),
            vec!["students/user_1/old.jpg".to_string()]
        );

        Ok(())
    }

    #[sqlx::test]
    async fn update_student_unchanged_image_url_does_not_delete_blob(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let recorder = std::sync::Arc::new(RecordingBlobDeleter::default());
        let app = app_with_blob_deleter(pool.clone(), recorder.clone());
        let user_id = test_user_id();
        let existing =
            insert_student_with_image_url(&pool, &user_id, 1, "Bob", "students/user_1/bob.jpg")
                .await;

        let body = json!({"name": "Bob Updated"});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        assert!(recorder.0.lock().unwrap().is_empty());

        Ok(())
    }

    #[sqlx::test]
    async fn delete_student_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_student(&pool, &user_id, None, 1, "Bob").await;

        let response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/students/{}", existing.id),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["id"], existing.id.to_string());

        assert!(fetch_student(&pool, existing.id).await.is_none());

        Ok(())
    }

    #[sqlx::test]
    async fn delete_student_with_image_url_deletes_blob(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let recorder = std::sync::Arc::new(RecordingBlobDeleter::default());
        let app = app_with_blob_deleter(pool.clone(), recorder.clone());
        let user_id = test_user_id();
        let existing =
            insert_student_with_image_url(&pool, &user_id, 1, "Bob", "students/user_1/bob.jpg")
                .await;

        let response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/students/{}", existing.id),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        assert_eq!(
            *recorder.0.lock().unwrap(),
            vec!["students/user_1/bob.jpg".to_string()]
        );

        Ok(())
    }

    #[sqlx::test]
    async fn delete_student_nonexistent_id_returns_404(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();

        let response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/students/{}", Uuid::new_v4()),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let json = body_json(response).await;
        assert!(json["message"].is_string());

        Ok(())
    }

    // --- auth/scoping coverage ---

    #[sqlx::test]
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

    #[sqlx::test]
    async fn cross_user_get_update_delete_student_returns_404(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let owner_id = test_user_id();
        let other_id = test_user_id();
        let student = insert_student(&pool, &owner_id, None, 1, "Bob").await;

        let get_response = app
            .clone()
            .oneshot(authenticated_request(
                "GET",
                &format!("/api/v1/students/{}", student.id),
                &other_id,
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
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::NOT_FOUND);

        let delete_response = app
            .oneshot(authenticated_request(
                "DELETE",
                &format!("/api/v1/students/{}", student.id),
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(delete_response.status(), StatusCode::NOT_FOUND);

        assert!(fetch_student(&pool, student.id).await.is_some());

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_excludes_other_users_students(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_a_id = test_user_id();
        let user_b_id = test_user_id();
        let student_a = insert_student(&pool, &user_a_id, None, 1, "Alice").await;
        insert_student(&pool, &user_b_id, None, 2, "Bob").await;

        let response = app
            .oneshot(authenticated_request("GET", "/api/v1/students", &user_a_id))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let students = json["data"].as_array().unwrap();
        assert_eq!(students.len(), 1);
        assert_eq!(students[0]["id"], student_a.id.to_string());

        Ok(())
    }

    // --- pagination/search coverage ---

    #[sqlx::test]
    async fn list_students_unpaginated_when_no_params_matches_current_behavior(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        for (i, name) in ["Alice", "Bob", "Carl"].iter().enumerate() {
            insert_student(&pool, &user_id, None, i as i32, name).await;
        }

        let response = app
            .oneshot(authenticated_request("GET", "/api/v1/students", &user_id))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let students = json["data"].as_array().unwrap();
        assert_eq!(students.len(), 3);

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_paginated_returns_correct_slice_and_count(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        for (i, name) in ["Alice", "Bob", "Carl", "Dana", "Eve"].iter().enumerate() {
            insert_student(&pool, &user_id, None, i as i32, name).await;
        }

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?page=1&page_size=2",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let students = json["data"]["students"].as_array().unwrap();
        assert_eq!(students.len(), 2);
        assert_eq!(students[0]["name"], "Alice");
        assert_eq!(students[1]["name"], "Bob");
        assert_eq!(json["data"]["total_count"], 5);
        assert_eq!(json["data"]["total_pages"], 3);
        assert_eq!(json["data"]["page"], 1);
        assert_eq!(json["data"]["page_size"], 2);

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_paginated_second_page_returns_remaining_slice(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        for (i, name) in ["Alice", "Bob", "Carl", "Dana", "Eve"].iter().enumerate() {
            insert_student(&pool, &user_id, None, i as i32, name).await;
        }

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?page=2&page_size=2",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let students = json["data"]["students"].as_array().unwrap();
        assert_eq!(students.len(), 2);
        assert_eq!(students[0]["name"], "Carl");
        assert_eq!(students[1]["name"], "Dana");

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_search_filters_by_name_case_insensitively(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        insert_student(&pool, &user_id, None, 1, "Alice").await;
        insert_student(&pool, &user_id, None, 2, "alicia").await;
        insert_student(&pool, &user_id, None, 3, "Bob").await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?q=ali",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let students = json["data"]["students"].as_array().unwrap();
        assert_eq!(students.len(), 2);
        assert_eq!(json["data"]["total_count"], 2);

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_search_no_matches_returns_empty_with_zero_count(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        insert_student(&pool, &user_id, None, 1, "Alice").await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?q=zzz",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["students"].as_array().unwrap().len(), 0);
        assert_eq!(json["data"]["total_count"], 0);
        assert_eq!(json["data"]["total_pages"], 1);
        assert_eq!(json["data"]["page"], 1);

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_out_of_range_page_clamps_to_last_page(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        for (i, name) in ["Alice", "Bob", "Carl"].iter().enumerate() {
            insert_student(&pool, &user_id, None, i as i32, name).await;
        }

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?page=99&page_size=2",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["page"], 2);
        let students = json["data"]["students"].as_array().unwrap();
        assert_eq!(students.len(), 1);
        assert_eq!(students[0]["name"], "Carl");

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_respects_page_size(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        for i in 0..10 {
            insert_student(&pool, &user_id, None, i, &format!("Student{i:02}")).await;
        }

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?page=1&page_size=3",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["students"].as_array().unwrap().len(), 3);
        assert_eq!(json["data"]["total_pages"], 4);

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_page_size_is_capped_at_100(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?page_size=9999",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["page_size"], 100);

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_pagination_excludes_other_users_students(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_a_id = test_user_id();
        let user_b_id = test_user_id();
        insert_student(&pool, &user_a_id, None, 1, "Alice").await;
        insert_student(&pool, &user_b_id, None, 2, "Bob").await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?page=1",
                &user_a_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["total_count"], 1);

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_q_alone_without_page_triggers_paginated_branch(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        insert_student(&pool, &user_id, None, 1, "Alice").await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?q=ali",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert!(json["data"]["students"].is_array());
        assert_eq!(json["data"]["page"], 1);
        assert_eq!(json["data"]["page_size"], 20);

        Ok(())
    }

    // --- sorting coverage ---

    #[sqlx::test]
    async fn list_students_sorts_by_name_desc(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        for (i, name) in ["Alice", "Bob", "Carl"].iter().enumerate() {
            insert_student(&pool, &user_id, None, i as i32, name).await;
        }

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?sort_by=name&sort_dir=desc",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let students = json["data"]["students"].as_array().unwrap();
        assert_eq!(students[0]["name"], "Carl");
        assert_eq!(students[1]["name"], "Bob");
        assert_eq!(students[2]["name"], "Alice");

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_sorts_by_student_id_asc(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        insert_student(&pool, &user_id, None, 30, "Zed").await;
        insert_student(&pool, &user_id, None, 10, "Amy").await;
        insert_student(&pool, &user_id, None, 20, "Mel").await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?sort_by=student_id&sort_dir=asc",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let students = json["data"]["students"].as_array().unwrap();
        assert_eq!(students[0]["student_id"], 10);
        assert_eq!(students[1]["student_id"], 20);
        assert_eq!(students[2]["student_id"], 30);

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_sorts_by_student_id_desc(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        insert_student(&pool, &user_id, None, 30, "Zed").await;
        insert_student(&pool, &user_id, None, 10, "Amy").await;
        insert_student(&pool, &user_id, None, 20, "Mel").await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?sort_by=student_id&sort_dir=desc",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let students = json["data"]["students"].as_array().unwrap();
        assert_eq!(students[0]["student_id"], 30);
        assert_eq!(students[1]["student_id"], 20);
        assert_eq!(students[2]["student_id"], 10);

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_sorts_by_classroom_period_asc(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let period5 = insert_classroom(&pool, &user_id, "History", 5).await;
        let period2 = insert_classroom(&pool, &user_id, "Math", 2).await;
        insert_student(&pool, &user_id, Some(period5.id), 1, "InPeriod5").await;
        insert_student(&pool, &user_id, Some(period2.id), 2, "InPeriod2").await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                "/api/v1/students?sort_by=classroom&sort_dir=asc",
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        let students = json["data"]["students"].as_array().unwrap();
        assert_eq!(students[0]["name"], "InPeriod2");
        assert_eq!(students[1]["name"], "InPeriod5");

        Ok(())
    }

    #[sqlx::test]
    async fn list_students_sorts_by_classroom_puts_unassigned_last_regardless_of_direction(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math", 2).await;
        insert_student(&pool, &user_id, None, 1, "NoClassroom").await;
        insert_student(&pool, &user_id, Some(classroom.id), 2, "HasClassroom").await;

        for dir in ["asc", "desc"] {
            let response = app
                .clone()
                .oneshot(authenticated_request(
                    "GET",
                    &format!("/api/v1/students?sort_by=classroom&sort_dir={dir}"),
                    &user_id,
                ))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);

            let json = body_json(response).await;
            let students = json["data"]["students"].as_array().unwrap();
            assert_eq!(students[0]["name"], "HasClassroom", "dir={dir}");
            assert_eq!(students[1]["name"], "NoClassroom", "dir={dir}");
        }

        Ok(())
    }

    // --- bulk delete coverage ---

    #[sqlx::test]
    async fn bulk_delete_students_removes_only_callers_own_students(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_a_id = test_user_id();
        let user_b_id = test_user_id();
        let a1 = insert_student(&pool, &user_a_id, None, 1, "A1").await;
        let a2 = insert_student(&pool, &user_a_id, None, 2, "A2").await;
        let b1 = insert_student(&pool, &user_b_id, None, 3, "B1").await;

        let response = app
            .oneshot(authenticated_json_request(
                "DELETE",
                "/api/v1/students",
                json!({"ids": [a1.id, a2.id, b1.id]}),
                &user_a_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["deleted_count"], 2);

        assert!(fetch_student(&pool, a1.id).await.is_none());
        assert!(fetch_student(&pool, a2.id).await.is_none());
        assert!(fetch_student(&pool, b1.id).await.is_some());

        Ok(())
    }

    #[sqlx::test]
    async fn bulk_delete_students_deletes_blobs_for_each_row(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let recorder = std::sync::Arc::new(RecordingBlobDeleter::default());
        let app = app_with_blob_deleter(pool.clone(), recorder.clone());
        let user_id = test_user_id();
        let with_image =
            insert_student_with_image_url(&pool, &user_id, 1, "Bob", "students/user_1/bob.jpg")
                .await;
        let without_image = insert_student(&pool, &user_id, None, 2, "Alice").await;

        let response = app
            .oneshot(authenticated_json_request(
                "DELETE",
                "/api/v1/students",
                json!({"ids": [with_image.id, without_image.id]}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        assert_eq!(
            *recorder.0.lock().unwrap(),
            vec!["students/user_1/bob.jpg".to_string()]
        );

        Ok(())
    }

    #[sqlx::test]
    async fn bulk_delete_students_ignores_nonexistent_ids(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_student(&pool, &user_id, None, 1, "Bob").await;
        let fake_id = Uuid::new_v4();

        let response = app
            .oneshot(authenticated_json_request(
                "DELETE",
                "/api/v1/students",
                json!({"ids": [existing.id, fake_id]}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["deleted_count"], 1);
        assert!(fetch_student(&pool, existing.id).await.is_none());

        Ok(())
    }

    #[sqlx::test]
    async fn bulk_delete_students_empty_ids_is_a_noop(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_student(&pool, &user_id, None, 1, "Bob").await;

        let response = app
            .oneshot(authenticated_json_request(
                "DELETE",
                "/api/v1/students",
                json!({"ids": []}),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let json = body_json(response).await;
        assert_eq!(json["data"]["deleted_count"], 0);
        assert!(fetch_student(&pool, existing.id).await.is_some());

        Ok(())
    }
}

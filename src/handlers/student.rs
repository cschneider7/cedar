use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
    http::{StatusCode, header},
    response::IntoResponse,
};
use postgres_from_row::FromRow;
use serde_json::json;
use tokio_postgres::types::{ToSql, Type};
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

const MAX_STUDENTS_PER_USER: i64 = 850;

fn not_found(what: &str) -> AppError {
    AppError::NotFound(format!("{what} not found"))
}

/// Rejects a new student if `user_id` is already at `MAX_STUDENTS_PER_USER`.
async fn check_student_limit(
    client: &tokio_postgres::Client,
    user_id: &str,
) -> Result<(), AppError> {
    let count: i64 = client
        .query_typed_one(
            "SELECT COUNT(*) FROM students WHERE user_id = $1",
            &[(&user_id, Type::TEXT)],
        )
        .await?
        .get(0);
    if count >= MAX_STUDENTS_PER_USER {
        return Err(AppError::BadRequest(
            "Student limit reached (850 students per account).".to_string(),
        ));
    }
    Ok(())
}

/// Confirms that a classroom is owned by the user
async fn check_classroom_ownership(
    client: &tokio_postgres::Client,
    classroom_id: Option<Uuid>,
    user_id: &str,
) -> Result<(), AppError> {
    let Some(classroom_id) = classroom_id else {
        return Ok(());
    };
    let exists: bool = client
        .query_typed_one(
            "SELECT EXISTS(SELECT 1 FROM classrooms WHERE id = $1 AND user_id = $2)",
            &[(&classroom_id, Type::UUID), (&user_id, Type::TEXT)],
        )
        .await?
        .get(0);
    if !exists {
        return Err(AppError::NotFound("Classroom not found".to_string()));
    }
    Ok(())
}

/// The blob-storage key prefix under which a user's student photos live
fn student_image_prefix(user_id: &str) -> String {
    format!("students/{user_id}/")
}

/// Confirms that an image is owned by the user
fn check_image_url_ownership(image_url: &Option<String>, user_id: &str) -> Result<(), AppError> {
    let Some(image_url) = image_url else {
        return Ok(());
    };
    if !image_url.starts_with(&student_image_prefix(user_id)) {
        return Err(AppError::BadRequest("Invalid image_url".to_string()));
    }
    Ok(())
}

/// Lists students owned by the current user, ordered by name
pub async fn student_list_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
    Query(params): Query<StudentListParams>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;

    if params.page.is_none()
        && params.page_size.is_none()
        && params.q.is_none()
        && params.sort_by.is_none()
        && params.sort_dir.is_none()
    {
        let rows = conn
            .query_typed(
                "SELECT * FROM students WHERE user_id = $1 ORDER BY name",
                &[(&user_id, Type::TEXT)],
            )
            .await?;
        let students = rows
            .iter()
            .map(StudentModel::try_from_row)
            .collect::<Result<Vec<_>, _>>()?;
        return Ok((StatusCode::OK, Json(json!({"data": students}))));
    }

    let page_size = params.page_size.unwrap_or(20).clamp(1, 100);
    let requested_page = params.page.unwrap_or(1).max(1);
    let q = params.q.filter(|q| !q.is_empty());
    let like_pattern = q.as_ref().map(|q| format!("%{q}%"));
    let sort_by = params.sort_by.unwrap_or(StudentSortBy::Name);
    let sort_dir = params.sort_dir.unwrap_or(SortDir::Asc);

    let total_count: i64 = match &like_pattern {
        Some(pattern) => conn
            .query_typed_one(
                "SELECT COUNT(*) FROM students WHERE user_id = $1 AND name ILIKE $2",
                &[(&user_id, Type::TEXT), (pattern, Type::TEXT)],
            )
            .await?
            .get(0),
        None => conn
            .query_typed_one(
                "SELECT COUNT(*) FROM students WHERE user_id = $1",
                &[(&user_id, Type::TEXT)],
            )
            .await?
            .get(0),
    };

    let total_pages = ((total_count as f64) / (page_size as f64)).ceil().max(1.0) as i64;
    let page = requested_page.min(total_pages);
    let offset = (page - 1) * page_size;

    let order_by = match (sort_by, sort_dir) {
        (StudentSortBy::Name, SortDir::Asc) => "students.name ASC",
        (StudentSortBy::Name, SortDir::Desc) => "students.name DESC",
        (StudentSortBy::StudentId, SortDir::Asc) => "students.student_id ASC, students.name ASC",
        (StudentSortBy::StudentId, SortDir::Desc) => "students.student_id DESC, students.name ASC",
        (StudentSortBy::Classroom, SortDir::Asc) => {
            "(students.classroom_id IS NULL) ASC, classrooms.period ASC, students.name ASC"
        }
        (StudentSortBy::Classroom, SortDir::Desc) => {
            "(students.classroom_id IS NULL) ASC, classrooms.period DESC, students.name ASC"
        }
    };

    let mut sql = String::from(
        "SELECT students.* FROM students \
         LEFT JOIN classrooms ON classrooms.id = students.classroom_id \
         WHERE students.user_id = $1 AND (",
    );
    let mut sql_params: Vec<(&(dyn ToSql + Sync), Type)> = vec![(&user_id, Type::TEXT)];
    match &like_pattern {
        Some(pattern) => {
            sql_params.push((pattern, Type::TEXT));
            sql.push_str(&format!("students.name ILIKE ${}", sql_params.len()));
        }
        None => sql.push_str("TRUE"),
    }
    sql.push_str(") ORDER BY ");
    sql.push_str(order_by);
    sql_params.push((&page_size, Type::INT8));
    sql.push_str(&format!(" LIMIT ${}", sql_params.len()));
    sql_params.push((&offset, Type::INT8));
    sql.push_str(&format!(" OFFSET ${}", sql_params.len()));

    let rows = conn.query_typed(&sql, &sql_params).await?;
    let students = rows
        .iter()
        .map(StudentModel::try_from_row)
        .collect::<Result<Vec<_>, _>>()?;

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
    let conn = data.db.get().await?;
    let row = conn
        .query_typed_opt(
            "SELECT * FROM students WHERE id = $1 AND user_id = $2",
            &[(&id, Type::UUID), (&user_id, Type::TEXT)],
        )
        .await?
        .ok_or_else(|| not_found("Student"))?;
    let student = StudentModel::try_from_row(&row)?;

    Ok((StatusCode::OK, Json(json!({"data": student}))))
}

/// Streams a student's private photo, scoped to the current user
pub async fn get_student_image_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;
    let image_url: Option<String> = conn
        .query_typed_opt(
            "SELECT image_url FROM students WHERE id = $1 AND user_id = $2",
            &[(&id, Type::UUID), (&user_id, Type::TEXT)],
        )
        .await?
        .ok_or_else(|| not_found("Student"))?
        .get(0);

    let key = image_url.ok_or_else(|| AppError::NotFound("Student has no photo".to_string()))?;
    if !key.starts_with(&student_image_prefix(&user_id)) {
        return Err(AppError::NotFound("Photo not found".to_string()));
    }

    let object = data
        .blob_reader
        .get(key)
        .await
        .ok_or_else(|| AppError::NotFound("Photo not found".to_string()))?;

    let content_type = object
        .content_type
        .unwrap_or_else(|| "application/octet-stream".to_string());

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, "private, max-age=3600".to_string()),
        ],
        object.bytes,
    ))
}

const ALLOWED_UPLOAD_CONTENT_TYPE: &str = "image/webp";
const MAX_UPLOAD_SIZE_BYTES: i64 = 5 * 1024 * 1024;

#[derive(serde::Deserialize)]
pub struct ImageUploadUrlSchema {
    content_length: i64,
}

/// Issues a presigned S3 URL for a student photo upload, scoped to the current user
pub async fn create_student_image_upload_url_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
    Json(body): Json<ImageUploadUrlSchema>,
) -> Result<impl IntoResponse, AppError> {
    if body.content_length <= 0 || body.content_length > MAX_UPLOAD_SIZE_BYTES {
        return Err(AppError::BadRequest("Invalid content length".to_string()));
    }

    let key = format!(
        "{}{}.webp",
        student_image_prefix(&user_id),
        uuid::Uuid::new_v4()
    );
    let url = data
        .blob_uploader
        .presign_put(
            key.clone(),
            ALLOWED_UPLOAD_CONTENT_TYPE.to_string(),
            body.content_length,
        )
        .await
        .ok_or_else(|| AppError::Internal("Failed to presign upload URL".to_string()))?;

    Ok((
        StatusCode::OK,
        Json(json!({"data": {"url": url, "key": key}})),
    ))
}

/// Creates a new student owned by the current user
pub async fn create_student_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
    Json(body): Json<StudentSchema>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;
    check_student_limit(&conn, &user_id).await?;
    check_classroom_ownership(&conn, body.classroom_id, &user_id).await?;
    check_image_url_ownership(&body.image_url, &user_id)?;

    let seating_preference = body.seating_preference.map(|p| p.as_str());
    let row = conn
        .query_typed_one(
            "INSERT INTO students (
            user_id,
            classroom_id,
            student_id,
            name,
            image_url,
            seating_preference
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *",
            &[
                (&user_id, Type::TEXT),
                (&body.classroom_id, Type::UUID),
                (&body.student_id, Type::INT4),
                (&body.name, Type::TEXT),
                (&body.image_url, Type::TEXT),
                (&seating_preference, Type::TEXT),
            ],
        )
        .await?;
    let student = StudentModel::try_from_row(&row)?;

    Ok((StatusCode::CREATED, Json(json!({"data": student}))))
}

/// Returns the current user's total student count
pub async fn count_students_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;
    let count: i64 = conn
        .query_typed_one(
            "SELECT COUNT(*) FROM students WHERE user_id = $1",
            &[(&user_id, Type::TEXT)],
        )
        .await?
        .get(0);

    Ok((
        StatusCode::OK,
        Json(json!({"data": {"count": count, "limit": MAX_STUDENTS_PER_USER}})),
    ))
}

/// Partially updates a student
pub async fn update_student_handler(
    CurrentUserId(user_id): CurrentUserId,
    Path(id): Path<Uuid>,
    State(data): State<Arc<AppState>>,
    Json(body): Json<UpdateStudentSchema>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = data.db.get().await?;
    let row = conn
        .query_typed_opt(
            "SELECT * FROM students WHERE id = $1 AND user_id = $2",
            &[(&id, Type::UUID), (&user_id, Type::TEXT)],
        )
        .await?
        .ok_or_else(|| not_found("Student"))?;
    let student = StudentModel::try_from_row(&row)?;

    let new_classroom_id = body.classroom_id.unwrap_or(student.classroom_id);
    let new_student_id = body.student_id.unwrap_or(student.student_id);
    let new_name = body.name.as_ref().unwrap_or(&student.name).as_str();
    let new_image_url = body
        .image_url
        .clone()
        .unwrap_or_else(|| student.image_url.clone());
    let new_seating_preference: Option<&str> = match &body.seating_preference {
        Some(pref) => pref.as_ref().map(|p| p.as_str()),
        None => student.seating_preference.as_deref(),
    };

    check_classroom_ownership(&conn, new_classroom_id, &user_id).await?;
    check_image_url_ownership(&new_image_url, &user_id)?;

    let tx = conn.transaction().await?;

    let row = tx
        .query_typed_one(
            "UPDATE students SET
            classroom_id = $1,
            student_id = $2,
            name = $3,
            image_url = $4,
            seating_preference = $5
        WHERE id = $6
        RETURNING *",
            &[
                (&new_classroom_id, Type::UUID),
                (&new_student_id, Type::INT4),
                (&new_name, Type::TEXT),
                (&new_image_url, Type::TEXT),
                (&new_seating_preference, Type::TEXT),
                (&student.id, Type::UUID),
            ],
        )
        .await?;
    let updated_student = StudentModel::try_from_row(&row)?;

    // Mark the deleted student's seat as empty
    if student.classroom_id.is_some() && new_classroom_id != student.classroom_id {
        tx.execute_typed(
            "UPDATE seats SET student_id = NULL
            WHERE student_id = $1
              AND table_id IN (SELECT id FROM tables WHERE classroom_id = $2)",
            &[
                (&student.id, Type::UUID),
                (&student.classroom_id, Type::UUID),
            ],
        )
        .await?;
    }

    tx.commit().await?;

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
    let conn = data.db.get().await?;
    let row = conn
        .query_typed_opt(
            "DELETE FROM students WHERE id = $1 AND user_id = $2 RETURNING *",
            &[(&id, Type::UUID), (&user_id, Type::TEXT)],
        )
        .await?
        .ok_or_else(|| not_found("Student"))?;
    let student = StudentModel::try_from_row(&row)?;

    if let Some(url) = student.image_url.clone() {
        data.blob_deleter.delete(url).await;
    }

    Ok((StatusCode::OK, Json(json!({"data": student}))))
}

/// Deletes multiple students
pub async fn bulk_delete_students_handler(
    CurrentUserId(user_id): CurrentUserId,
    State(data): State<Arc<AppState>>,
    Json(body): Json<BulkDeleteStudentsSchema>,
) -> Result<impl IntoResponse, AppError> {
    let conn = data.db.get().await?;
    let deleted: Vec<Option<String>> = conn
        .query_typed(
            "DELETE FROM students WHERE user_id = $1 AND id = ANY($2) RETURNING image_url",
            &[(&user_id, Type::TEXT), (&body.ids, Type::UUID_ARRAY)],
        )
        .await?
        .iter()
        .map(|row| row.get(0))
        .collect();

    for url in deleted.iter().flatten() {
        data.blob_deleter.delete(url.clone()).await;
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
    use tokio_postgres::types::Type;
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;
    use crate::model::{SeatModel, TableModel};
    use crate::test_support::{
        RecordingBlobDeleter, app, app_with_blob_deleter, authenticated_json_request,
        authenticated_request, body_json, insert_classroom, seed_exec, seed_one, seed_opt,
        test_user_id,
    };

    async fn insert_table(
        pool: &crate::db::Db,
        classroom_id: Uuid,
        table_number: i32,
    ) -> TableModel {
        seed_one(
            pool,
            "INSERT INTO tables (classroom_id, table_number, rows, cols, x_pos, y_pos)
            VALUES ($1, $2, 2, 2, 0, 0)
            RETURNING *",
            &[(&classroom_id, Type::UUID), (&table_number, Type::INT4)],
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

    async fn fetch_seat(pool: &crate::db::Db, id: Uuid) -> SeatModel {
        seed_one(
            pool,
            "SELECT * FROM seats WHERE id = $1",
            &[(&id, Type::UUID)],
        )
        .await
    }

    async fn insert_student(
        pool: &crate::db::Db,
        user_id: &str,
        classroom_id: Option<Uuid>,
        student_id: i32,
        name: &str,
    ) -> StudentModel {
        seed_one(
            pool,
            "INSERT INTO students (user_id, classroom_id, student_id, name)
            VALUES ($1, $2, $3, $4)
            RETURNING *",
            &[
                (&user_id, Type::TEXT),
                (&classroom_id, Type::UUID),
                (&student_id, Type::INT4),
                (&name, Type::TEXT),
            ],
        )
        .await
    }

    async fn insert_student_with_image_url(
        pool: &crate::db::Db,
        user_id: &str,
        student_id: i32,
        name: &str,
        image_url: &str,
    ) -> StudentModel {
        seed_one(
            pool,
            "INSERT INTO students (user_id, classroom_id, student_id, name, image_url)
            VALUES ($1, NULL, $2, $3, $4)
            RETURNING *",
            &[
                (&user_id, Type::TEXT),
                (&student_id, Type::INT4),
                (&name, Type::TEXT),
                (&image_url, Type::TEXT),
            ],
        )
        .await
    }

    async fn insert_student_with_seating_preference(
        pool: &crate::db::Db,
        user_id: &str,
        student_id: i32,
        name: &str,
        preference: &str,
    ) -> StudentModel {
        seed_one(
            pool,
            "INSERT INTO students (user_id, classroom_id, student_id, name, seating_preference)
            VALUES ($1, NULL, $2, $3, $4)
            RETURNING *",
            &[
                (&user_id, Type::TEXT),
                (&student_id, Type::INT4),
                (&name, Type::TEXT),
                (&preference, Type::TEXT),
            ],
        )
        .await
    }

    async fn fetch_student(pool: &crate::db::Db, id: Uuid) -> Option<StudentModel> {
        seed_opt(
            pool,
            "SELECT * FROM students WHERE id = $1",
            &[(&id, Type::UUID)],
        )
        .await
    }

    async fn seed_students(pool: &crate::db::Db, user_id: &str, count: i64) {
        let count = count as i32;
        seed_exec(
            pool,
            "INSERT INTO students (user_id, student_id, name)
            SELECT $1, gs, 'Student ' || gs FROM generate_series(1, $2::int) AS gs",
            &[(&user_id, Type::TEXT), (&count, Type::INT4)],
        )
        .await;
    }

    #[tokio::test]
    async fn image_upload_url_rejects_invalid_content_length() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();

        for content_length in [0, -1, MAX_UPLOAD_SIZE_BYTES + 1] {
            let response = app
                .clone()
                .oneshot(authenticated_json_request(
                    "POST",
                    "/api/v1/students/image-upload-url",
                    json!({"content_length": content_length}),
                    &user_id,
                ))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        }

        Ok(())
    }

    #[tokio::test]
    async fn create_student_success() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn create_student_rejects_at_limit() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn create_student_allows_up_to_limit() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn create_student_limit_is_per_user() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn count_students_handler_returns_count_and_limit() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn create_student_with_image_url_success() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let image_url = format!("students/{user_id}/bob.jpg");
        let body = json!({
            "student_id": 1,
            "name": "Bob Burger",
            "classroom_id": null,
            "image_url": image_url,
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
        assert_eq!(json["data"]["image_url"], image_url);

        Ok(())
    }

    #[tokio::test]
    async fn create_student_rejects_image_url_outside_own_prefix() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let other_id = test_user_id();
        let body = json!({
            "student_id": 1,
            "name": "Bob Burger",
            "classroom_id": null,
            "image_url": format!("students/{other_id}/bob.jpg"),
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
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }

    #[tokio::test]
    async fn create_student_with_seating_preference_success() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let body = json!({
            "student_id": 1,
            "name": "Bob Burger",
            "classroom_id": null,
            "seating_preference": "front",
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
        assert_eq!(json["data"]["seating_preference"], "front");

        Ok(())
    }

    #[tokio::test]
    async fn create_student_omits_seating_preference_defaults_to_null() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let body = json!({
            "student_id": 1,
            "name": "Bob Burger",
            "classroom_id": null,
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
        assert!(json["data"]["seating_preference"].is_null());

        Ok(())
    }

    // `student_id` has no uniqueness constraint, so duplicates are accepted.
    #[tokio::test]
    async fn create_student_allows_duplicate_student_id() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn create_student_rejects_another_users_classroom_id() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn update_student_partial_leaves_other_fields_unchanged() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn update_student_nonexistent_id_returns_404() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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
    #[tokio::test]
    async fn update_student_omitted_classroom_id_keeps_existing_value() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn update_student_explicit_null_classroom_id_clears_value() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn update_student_new_classroom_id_sets_value() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn update_student_rejects_another_users_classroom_id() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn update_student_rejects_image_url_outside_own_prefix() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let other_id = test_user_id();
        let existing = insert_student(&pool, &user_id, None, 1, "Bob").await;

        let body = json!({"image_url": format!("students/{other_id}/bob.jpg")});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", existing.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }

    // Double-Option deserialization for image_url: omitted keeps, explicit
    // null clears — same pattern as classroom_id above.
    #[tokio::test]
    async fn update_student_omitted_image_url_keeps_existing_value() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let image_url = format!("students/{user_id}/bob.jpg");
        let existing = insert_student_with_image_url(&pool, &user_id, 1, "Bob", &image_url).await;

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
        assert_eq!(json["data"]["image_url"], image_url);

        Ok(())
    }

    #[tokio::test]
    async fn update_student_explicit_null_image_url_clears_value() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    // Double-Option deserialization for seating_preference: omitted keeps,
    // explicit null clears — same pattern as classroom_id/image_url above.
    #[tokio::test]
    async fn update_student_omitted_seating_preference_keeps_existing_value() -> anyhow::Result<()>
    {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing =
            insert_student_with_seating_preference(&pool, &user_id, 1, "Bob", "front").await;

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
        assert_eq!(json["data"]["seating_preference"], "front");

        Ok(())
    }

    #[tokio::test]
    async fn update_student_explicit_null_seating_preference_clears_value() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing =
            insert_student_with_seating_preference(&pool, &user_id, 1, "Bob", "front").await;

        let body = json!({"seating_preference": null});
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
        assert!(json["data"]["seating_preference"].is_null());

        Ok(())
    }

    #[tokio::test]
    async fn update_student_new_seating_preference_sets_value() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let existing = insert_student(&pool, &user_id, None, 1, "Bob").await;

        let body = json!({"seating_preference": "back"});
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
        assert_eq!(json["data"]["seating_preference"], "back");

        Ok(())
    }

    #[tokio::test]
    async fn update_student_unassign_clears_seat_in_old_classroom() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math", 1).await;
        let table = insert_table(&pool, classroom.id, 1).await;
        let student = insert_student(&pool, &user_id, Some(classroom.id), 1, "Alice").await;
        let seat = insert_seat(&pool, table.id, Some(student.id), 0).await;

        let body = json!({"classroom_id": null});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", student.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let updated_seat = fetch_seat(&pool, seat.id).await;
        assert_eq!(updated_seat.student_id, None);

        Ok(())
    }

    #[tokio::test]
    async fn update_student_moved_to_new_classroom_clears_seat_in_old_classroom()
    -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let old_classroom = insert_classroom(&pool, &user_id, "Math", 1).await;
        let new_classroom = insert_classroom(&pool, &user_id, "Science", 2).await;
        let table = insert_table(&pool, old_classroom.id, 1).await;
        let student = insert_student(&pool, &user_id, Some(old_classroom.id), 1, "Alice").await;
        let seat = insert_seat(&pool, table.id, Some(student.id), 0).await;

        let body = json!({"classroom_id": new_classroom.id});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", student.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let updated_seat = fetch_seat(&pool, seat.id).await;
        assert_eq!(updated_seat.student_id, None);

        Ok(())
    }

    #[tokio::test]
    async fn update_student_same_classroom_id_does_not_clear_seat() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let classroom = insert_classroom(&pool, &user_id, "Math", 1).await;
        let table = insert_table(&pool, classroom.id, 1).await;
        let student = insert_student(&pool, &user_id, Some(classroom.id), 1, "Alice").await;
        let seat = insert_seat(&pool, table.id, Some(student.id), 0).await;

        let body = json!({"classroom_id": classroom.id, "name": "Alice R."});
        let response = app
            .oneshot(authenticated_json_request(
                "PATCH",
                &format!("/api/v1/students/{}", student.id),
                body,
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let updated_seat = fetch_seat(&pool, seat.id).await;
        assert_eq!(updated_seat.student_id, Some(student.id));

        Ok(())
    }

    #[tokio::test]
    async fn update_student_replacing_image_url_deletes_old_blob() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let recorder = std::sync::Arc::new(RecordingBlobDeleter::default());
        let app = app_with_blob_deleter(pool.clone(), recorder.clone());
        let user_id = test_user_id();
        let old_url = format!("students/{user_id}/old.jpg");
        let existing = insert_student_with_image_url(&pool, &user_id, 1, "Bob", &old_url).await;

        let body = json!({"image_url": format!("students/{user_id}/new.jpg")});
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

        assert_eq!(*recorder.0.lock().unwrap(), vec![old_url]);

        Ok(())
    }

    #[tokio::test]
    async fn update_student_unchanged_image_url_does_not_delete_blob() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let recorder = std::sync::Arc::new(RecordingBlobDeleter::default());
        let app = app_with_blob_deleter(pool.clone(), recorder.clone());
        let user_id = test_user_id();
        let image_url = format!("students/{user_id}/bob.jpg");
        let existing = insert_student_with_image_url(&pool, &user_id, 1, "Bob", &image_url).await;

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

    #[tokio::test]
    async fn delete_student_success() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn delete_student_with_image_url_deletes_blob() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn delete_student_nonexistent_id_returns_404() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn unauthenticated_requests_return_401() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let student_id = Uuid::new_v4();

        for (method, uri) in [
            ("GET", "/api/v1/students".to_string()),
            ("POST", "/api/v1/students".to_string()),
            ("GET", format!("/api/v1/students/{student_id}")),
            ("GET", format!("/api/v1/students/{student_id}/image")),
            ("POST", "/api/v1/students/image-upload-url".to_string()),
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

    #[tokio::test]
    async fn cross_user_get_update_delete_student_returns_404() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn get_student_image_without_photo_returns_404() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let user_id = test_user_id();
        let student = insert_student(&pool, &user_id, None, 1, "Bob").await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                &format!("/api/v1/students/{}/image", student.id),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[tokio::test]
    async fn get_student_image_scoped_to_owner() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        let app = app(pool.clone());
        let owner_id = test_user_id();
        let other_id = test_user_id();
        let student =
            insert_student_with_image_url(&pool, &owner_id, 1, "Bob", "students/owner/bob.jpg")
                .await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                &format!("/api/v1/students/{}/image", student.id),
                &other_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[tokio::test]
    async fn get_student_image_rejects_key_outside_own_prefix() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
        // A row with a mismatched image_url can't be produced through the
        // API anymore (see check_image_url_ownership), but this defends a
        // pre-existing row (or a future write path that forgets the check)
        // from ever being read back.
        let app = app(pool.clone());
        let user_id = test_user_id();
        let victim_id = test_user_id();
        let student = insert_student_with_image_url(
            &pool,
            &user_id,
            1,
            "Bob",
            &format!("students/{victim_id}/photo.jpg"),
        )
        .await;

        let response = app
            .oneshot(authenticated_request(
                "GET",
                &format!("/api/v1/students/{}/image", student.id),
                &user_id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        Ok(())
    }

    #[tokio::test]
    async fn list_students_excludes_other_users_students() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_unpaginated_when_no_params_matches_current_behavior()
    -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_paginated_returns_correct_slice_and_count() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_paginated_second_page_returns_remaining_slice() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_search_filters_by_name_case_insensitively() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_search_no_matches_returns_empty_with_zero_count() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_out_of_range_page_clamps_to_last_page() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_respects_page_size() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_page_size_is_capped_at_100() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_pagination_excludes_other_users_students() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_q_alone_without_page_triggers_paginated_branch() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_sorts_by_name_desc() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_sorts_by_student_id_asc() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_sorts_by_student_id_desc() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_sorts_by_classroom_period_asc() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn list_students_sorts_by_classroom_puts_unassigned_last_regardless_of_direction()
    -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn bulk_delete_students_removes_only_callers_own_students() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn bulk_delete_students_deletes_blobs_for_each_row() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn bulk_delete_students_ignores_nonexistent_ids() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

    #[tokio::test]
    async fn bulk_delete_students_empty_ids_is_a_noop() -> anyhow::Result<()> {
        let __tdb = crate::test_support::TestDb::new().await;
        let pool = __tdb.pool();
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

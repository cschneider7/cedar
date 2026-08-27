#![cfg(test)]

use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use axum::{Router, body::Body, http::Request, response::Response};
use http_body_util::BodyExt;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    AppState,
    auth::SupabaseAuthClaims,
    blob::{BlobDeleter, BlobObject, BlobReader, BlobUploader},
    model::ClassroomModel,
    routes::create_router,
};

const TEST_FRONTEND_ORIGIN: &str = "http://localhost:5173";

/// A `BlobDeleter` test double that records every URL passed to `delete`
#[derive(Clone, Default)]
pub struct RecordingBlobDeleter(pub Arc<Mutex<Vec<String>>>);

impl BlobDeleter for RecordingBlobDeleter {
    fn delete(&self, url: String) -> Pin<Box<dyn Future<Output = ()> + Send>> {
        self.0.lock().unwrap().push(url);
        Box::pin(async {})
    }
}

/// A `BlobReader` test double that always reports the object missing
#[derive(Clone, Default)]
pub struct EmptyBlobReader;

impl BlobReader for EmptyBlobReader {
    fn get(&self, _key: String) -> Pin<Box<dyn Future<Output = Option<BlobObject>> + Send>> {
        Box::pin(async { None })
    }
}

/// A `BlobUploader` test double that always fails to presign
#[derive(Clone, Default)]
pub struct EmptyBlobUploader;

impl BlobUploader for EmptyBlobUploader {
    fn presign_put(
        &self,
        _key: String,
        _content_type: String,
        _content_length: i64,
    ) -> Pin<Box<dyn Future<Output = Option<String>> + Send>> {
        Box::pin(async { None })
    }
}

/// Builds the app router for tests
pub fn app(pool: sqlx::PgPool) -> Router {
    app_with_blob_deleter(pool, Arc::new(RecordingBlobDeleter::default()))
}

pub fn app_with_blob_deleter(pool: sqlx::PgPool, blob_deleter: Arc<dyn BlobDeleter>) -> Router {
    let app_state = Arc::new(AppState {
        db: pool,
        blob_deleter,
        blob_reader: Arc::new(EmptyBlobReader),
        blob_uploader: Arc::new(EmptyBlobUploader),
    });
    create_router(app_state, None, TEST_FRONTEND_ORIGIN.to_string())
}

pub async fn body_json(response: Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

/// A fresh, opaque user id for scoping test data
pub fn test_user_id() -> String {
    format!("user_test_{}", Uuid::new_v4())
}

fn test_jwt(user_id: &str) -> SupabaseAuthClaims {
    SupabaseAuthClaims {
        sub: user_id.to_string(),
    }
}

/// Builds a JSON POST/PATCH/PUT request
pub fn authenticated_json_request(
    method: &str,
    uri: &str,
    body: Value,
    user_id: &str,
) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .extension(test_jwt(user_id))
        .body(Body::from(body.to_string()))
        .unwrap()
}

/// Same as `authenticated_json_request`, but for bodyless requests (GET/DELETE).
pub fn authenticated_request(method: &str, uri: &str, user_id: &str) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .extension(test_jwt(user_id))
        .body(Body::empty())
        .unwrap()
}

/// Inserts a classroom with a hardcoded default term ("fall" 2026)
pub async fn insert_classroom(
    pool: &sqlx::PgPool,
    user_id: &str,
    subject: &str,
    period: i16,
) -> ClassroomModel {
    sqlx::query_as(
        "INSERT INTO classrooms (user_id, subject, period, term_season, term_year)
        VALUES ($1, $2, $3, 'fall', 2026) RETURNING *",
    )
    .bind(user_id)
    .bind(subject)
    .bind(period)
    .fetch_one(pool)
    .await
    .unwrap()
}

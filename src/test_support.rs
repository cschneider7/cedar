#![cfg(test)]

use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use axum::{Router, body::Body, http::Request, response::Response};
use clerk_rs::validators::authorizer::ClerkJwt;
use http_body_util::BodyExt;
use serde_json::Value;
use uuid::Uuid;

use crate::{AppState, blob::BlobDeleter, model::ClassroomModel, routes::create_router};

const TEST_FRONTEND_ORIGIN: &str = "http://localhost:5173";

/// A `BlobDeleter` test double that records every URL passed to `delete`
/// instead of making a real network call, so tests can assert on cleanup
/// behavior without mocking HTTP.
#[derive(Clone, Default)]
pub struct RecordingBlobDeleter(pub Arc<Mutex<Vec<String>>>);

impl BlobDeleter for RecordingBlobDeleter {
    fn delete(&self, url: String) -> Pin<Box<dyn Future<Output = ()> + Send>> {
        self.0.lock().unwrap().push(url);
        Box::pin(async {})
    }
}

/// Builds the app router for tests with no Clerk layer attached — tests
/// authenticate by attaching a hand-built `ClerkJwt` extension directly to
/// the request (see `authenticated_request`/`authenticated_json_request`)
/// rather than exercising real JWT/JWKS verification. Every handler's own
/// auth-extraction and user-scoping logic is still exercised the same way;
/// only Clerk's signature-verification step is bypassed.
pub fn app(pool: sqlx::PgPool) -> Router {
    app_with_blob_deleter(pool, Arc::new(RecordingBlobDeleter::default()))
}

/// Same as `app`, but with an injectable `BlobDeleter` for tests asserting on
/// blob cleanup calls (see `RecordingBlobDeleter`).
pub fn app_with_blob_deleter(pool: sqlx::PgPool, blob_deleter: Arc<dyn BlobDeleter>) -> Router {
    let app_state = Arc::new(AppState {
        db: pool,
        blob_deleter,
    });
    create_router(app_state, None, TEST_FRONTEND_ORIGIN.to_string())
}

pub async fn body_json(response: Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

/// A fresh, Clerk-shaped user id for scoping test data, e.g. `user_test_<uuid>`.
pub fn test_user_id() -> String {
    format!("user_test_{}", Uuid::new_v4())
}

fn test_jwt(user_id: &str) -> ClerkJwt {
    ClerkJwt {
        azp: None,
        exp: i32::MAX,
        iat: 0,
        iss: "test".to_string(),
        nbf: 0,
        sid: None,
        sub: user_id.to_string(),
        act: None,
        org: None,
        other: serde_json::Map::new(),
    }
}

/// Builds a JSON POST/PATCH/PUT request, with a `ClerkJwt` extension for
/// `user_id` so the request is authenticated as that user.
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

/// Inserts a classroom with a hardcoded default term ("fall" 2026) — term
/// isn't relevant to most callers of this helper; tests exercising term
/// behavior go through the real create/update handlers instead.
pub async fn insert_classroom(
    pool: &sqlx::PgPool,
    user_id: &str,
    subject: &str,
    period: i16,
) -> ClassroomModel {
    sqlx::query_as!(
        ClassroomModel,
        r#"INSERT INTO classrooms (user_id, subject, period, term_season, term_year)
        VALUES ($1, $2, $3, 'fall', 2026) RETURNING *"#,
        user_id,
        subject,
        period
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

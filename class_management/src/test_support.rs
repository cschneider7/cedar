#![cfg(test)]

use std::sync::Arc;

use axum::{Router, body::Body, http::Request, response::Response};
use clerk_rs::validators::authorizer::ClerkJwt;
use http_body_util::BodyExt;
use serde_json::Value;
use uuid::Uuid;

use crate::{AppState, model::ClassroomModel, routes::create_router};

const TEST_FRONTEND_ORIGIN: &str = "http://localhost:5173";

/// Builds the app router for tests with no Clerk layer attached — tests
/// authenticate by attaching a hand-built `ClerkJwt` extension directly to
/// the request (see `authenticated_request`/`authenticated_json_request`)
/// rather than exercising real JWT/JWKS verification. Every handler's own
/// auth-extraction and user-scoping logic is still exercised the same way;
/// only Clerk's signature-verification step is bypassed.
pub fn app(pool: sqlx::PgPool) -> Router {
    let app_state = Arc::new(AppState { db: pool });
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

pub async fn insert_classroom(
    pool: &sqlx::PgPool,
    user_id: &str,
    subject: &str,
    period: i16,
) -> ClassroomModel {
    sqlx::query_as!(
        ClassroomModel,
        r#"INSERT INTO classrooms (user_id, subject, period) VALUES ($1, $2, $3) RETURNING *"#,
        user_id,
        subject,
        period
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

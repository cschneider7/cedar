#![cfg(test)]

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    Router,
    body::Body,
    extract::ConnectInfo,
    http::{Request, header},
    response::Response,
};
use axum_login::AuthManagerLayerBuilder;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;
use tower_sessions::{MemoryStore, SessionManagerLayer};
use uuid::Uuid;

use crate::{
    AppState,
    auth::Backend,
    mailer::LoggingMailer,
    model::{ClassroomModel, UserModel},
    routes::create_router,
};

const TEST_FRONTEND_ORIGIN: &str = "http://localhost:5173";
/// Fixed password used by every test user created via `insert_authenticated_user`.
pub const TEST_PASSWORD: &str = "password12345";
/// `tower_governor` needs a `ConnectInfo` extension (normally added
/// per-connection in production); `oneshot()` tests never go through that.
const TEST_CLIENT_ADDR: SocketAddr =
    SocketAddr::new(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST), 12345);

/// Builds the app router for tests, backed by an in-memory session store
/// rather than `PostgresStore` — the session *behavior* (login/logout/auth
/// extraction) is what's under test, not the storage backend, and
/// `MemoryStore` fully implements the same `SessionStore` trait, sidestepping
/// the need for a second sqlx-0.8 pool per test.
pub fn app(pool: sqlx::PgPool) -> Router {
    let backend = Backend { db: pool.clone() };
    let session_layer = SessionManagerLayer::new(MemoryStore::default()).with_secure(false);
    let auth_layer = AuthManagerLayerBuilder::new(backend, session_layer).build();
    let app_state = Arc::new(AppState {
        db: pool,
        mailer: Box::new(LoggingMailer),
    });
    create_router(app_state, auth_layer, TEST_FRONTEND_ORIGIN.to_string())
}

pub async fn body_json(response: Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

pub fn json_request(method: &str, uri: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .extension(ConnectInfo(TEST_CLIENT_ADDR))
        .body(Body::from(body.to_string()))
        .unwrap()
}

/// Same as `json_request`, but attaches a session cookie (from
/// `insert_authenticated_user`) so the request is authenticated.
pub fn authenticated_json_request(
    method: &str,
    uri: &str,
    body: Value,
    cookie: &str,
) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .header(header::COOKIE, cookie)
        .extension(ConnectInfo(TEST_CLIENT_ADDR))
        .body(Body::from(body.to_string()))
        .unwrap()
}

/// Same as `authenticated_json_request`, but for bodyless requests (GET/DELETE).
pub fn authenticated_request(method: &str, uri: &str, cookie: &str) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header(header::COOKIE, cookie)
        .extension(ConnectInfo(TEST_CLIENT_ADDR))
        .body(Body::empty())
        .unwrap()
}

pub async fn insert_classroom(
    pool: &sqlx::PgPool,
    user_id: Uuid,
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

/// Inserts a pre-verified user (real `password_auth` hash of `TEST_PASSWORD`),
/// then logs in through the real `/api/v1/auth/login` route on the given
/// `app` to obtain a genuine session cookie — round-trips the actual
/// `AuthnBackend`/session layer rather than hand-rolling the session-store
/// row format. Callers must reuse the same (cloned) `app` for subsequent
/// requests, since a fresh `app(pool)` call builds an unrelated session store.
pub async fn insert_authenticated_user(
    app: Router,
    pool: &sqlx::PgPool,
    email: &str,
) -> (UserModel, String) {
    let password_hash = password_auth::generate_hash(TEST_PASSWORD);
    let user = sqlx::query_as!(
        UserModel,
        r#"INSERT INTO users (email, password_hash, email_verified)
           VALUES ($1, $2, true) RETURNING *"#,
        email,
        password_hash
    )
    .fetch_one(pool)
    .await
    .unwrap();

    let response = app
        .oneshot(json_request(
            "POST",
            "/api/v1/auth/login",
            json!({ "email": email, "password": TEST_PASSWORD }),
        ))
        .await
        .unwrap();
    let cookie = response
        .headers()
        .get(header::SET_COOKIE)
        .expect("login should set a session cookie")
        .to_str()
        .unwrap()
        .to_string();

    (user, cookie)
}

#![cfg(test)]

use std::{
    future::Future,
    pin::Pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
};

use axum::{Router, body::Body, http::Request, response::Response};
use http_body_util::BodyExt;
use serde_json::Value;
use uuid::Uuid;

use postgres_from_row::FromRow;
use tokio_postgres::types::{FromSqlOwned, ToSql, Type};

use crate::{
    AppState,
    auth::SupabaseAuthClaims,
    blob::{BlobDeleter, BlobObject, BlobReader, BlobUploader},
    db,
    model::ClassroomModel,
    routes::create_router,
};

/// A `query_typed` parameter, spelled out for the seed helpers below.
pub type P<'a> = (&'a (dyn ToSql + Sync), Type);

const TEST_FRONTEND_ORIGIN: &str = "http://localhost:5173";

/// Table DDL + indexes only
fn migration_sql() -> &'static str {
    let full = include_str!("../supabase/migrations/20260826203344_create_tables.sql");
    full.split_once("-- Cluster roles and Data API lockdown")
        .map(|(tables, _)| tables)
        .unwrap_or(full)
}

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

/// An isolated database for one test
pub struct TestDb {
    admin_url: String,
    db_name: String,
    pool: db::Db,
}

fn base_url() -> String {
    std::env::var("POSTGRES_URL").expect("POSTGRES_URL must be set to run tests")
}

fn with_db_name(url: &str, name: &str) -> String {
    let mut url = url::Url::parse(url).expect("POSTGRES_URL must be a valid URL");
    url.set_path(&format!("/{name}"));
    url.into()
}

impl TestDb {
    pub async fn new() -> Self {
        static LOAD_ENV: std::sync::Once = std::sync::Once::new();
        LOAD_ENV.call_once(|| {
            dotenv::dotenv().ok();
        });

        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let admin_url = base_url();
        let db_name = format!(
            "cedar_test_{}_{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        );

        let admin = db::build_pool(&admin_url, 1)
            .await
            .expect("failed to connect admin pool");
        admin
            .get()
            .await
            .expect("failed to acquire admin connection")
            .batch_execute(&format!("CREATE DATABASE \"{db_name}\""))
            .await
            .expect("failed to create test database");

        let pool = db::build_pool(&with_db_name(&admin_url, &db_name), 4)
            .await
            .expect("failed to connect test pool");
        pool.get()
            .await
            .expect("failed to acquire test connection")
            .batch_execute(migration_sql())
            .await
            .expect("failed to run migrations");

        Self {
            admin_url,
            db_name,
            pool,
        }
    }

    pub fn pool(&self) -> db::Db {
        self.pool.clone()
    }
}

impl Drop for TestDb {
    fn drop(&mut self) {
        let admin_url = self.admin_url.clone();
        let db_name = self.db_name.clone();
        // The pool must be closed before the database can be dropped.
        self.pool.close();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("failed to build teardown runtime");
            rt.block_on(async {
                let Ok(admin) = db::build_pool(&admin_url, 1).await else {
                    return;
                };
                if let Ok(client) = admin.get().await {
                    let _ = client
                        .batch_execute(&format!(
                            "DROP DATABASE IF EXISTS \"{db_name}\" WITH (FORCE)"
                        ))
                        .await;
                }
            });
        })
        .join()
        .ok();
    }
}

/// Builds the app router for tests
pub fn app(pool: db::Db) -> Router {
    app_with_blob_deleter(pool, Arc::new(RecordingBlobDeleter::default()))
}

pub fn app_with_blob_deleter(pool: db::Db, blob_deleter: Arc<dyn BlobDeleter>) -> Router {
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
    pool: &db::Db,
    user_id: &str,
    subject: &str,
    period: i16,
) -> ClassroomModel {
    seed_one(
        pool,
        "INSERT INTO classrooms (user_id, subject, period, term_season, term_year)
        VALUES ($1, $2, $3, 'fall', 2026) RETURNING *",
        &[
            (&user_id, Type::TEXT),
            (&subject, Type::TEXT),
            (&period, Type::INT2),
        ],
    )
    .await
}

// --- unwrapping fixture helpers for handler test modules ---

/// `query_typed_one` + `FromRow`, unwrapping.
pub async fn seed_one<T: FromRow>(pool: &db::Db, sql: &str, params: &[P<'_>]) -> T {
    let conn = pool.get().await.unwrap();
    T::from_row(&conn.query_typed_one(sql, params).await.unwrap())
}

/// `query_typed_opt` + `FromRow`, unwrapping.
pub async fn seed_opt<T: FromRow>(pool: &db::Db, sql: &str, params: &[P<'_>]) -> Option<T> {
    let conn = pool.get().await.unwrap();
    conn.query_typed_opt(sql, params)
        .await
        .unwrap()
        .map(|row| T::from_row(&row))
}

/// `query_typed` + `FromRow`, unwrapping.
pub async fn seed_all<T: FromRow>(pool: &db::Db, sql: &str, params: &[P<'_>]) -> Vec<T> {
    let conn = pool.get().await.unwrap();
    conn.query_typed(sql, params)
        .await
        .unwrap()
        .iter()
        .map(T::from_row)
        .collect()
}

/// `query_typed_one` returning the first column, unwrapping.
pub async fn seed_scalar<T: FromSqlOwned>(pool: &db::Db, sql: &str, params: &[P<'_>]) -> T {
    let conn = pool.get().await.unwrap();
    conn.query_typed_one(sql, params).await.unwrap().get(0)
}

/// `execute_typed`, unwrapping.
pub async fn seed_exec(pool: &db::Db, sql: &str, params: &[P<'_>]) {
    let conn = pool.get().await.unwrap();
    conn.execute_typed(sql, params).await.unwrap();
}

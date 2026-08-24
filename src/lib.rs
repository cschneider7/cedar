use std::{str::FromStr, sync::Arc};

use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions};

pub mod auth;
pub mod blob;
pub mod cold_call;
pub mod error;
pub mod handlers;
pub mod model;
pub mod routes;
pub mod schema;
pub mod seating_chart;
#[cfg(test)]
pub mod test_support;

pub use routes::create_router;

// Conservative starting value for Fluid Compute's multiple concurrent
// instances (each builds its own pool, unlike Fly's single long-lived VM) —
// tune from real Neon connection metrics post-cutover.
const MAX_CONNECTIONS: u32 = 4;

/// Shared state threaded through every handler via `Arc<AppState>`.
pub struct AppState {
    db: PgPool,
    blob_deleter: Arc<dyn blob::BlobDeleter>,
    blob_reader: Arc<dyn blob::BlobReader>,
    blob_uploader: Arc<dyn blob::BlobUploader>,
}

impl AppState {
    /// Reads the DB/blob-storage env vars, connects to Postgres, and builds
    /// the shared application state. Called by both the local-dev `main.rs`
    /// binary and the Vercel `api/index.rs` entrypoint so this wiring lives
    /// in one place rather than being duplicated across bins.
    pub async fn build() -> Arc<AppState> {
        let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
        let s3_endpoint = std::env::var("S3_ENDPOINT").expect("S3_ENDPOINT must be set");
        let s3_region = std::env::var("S3_REGION").expect("S3_REGION must be set");
        let s3_bucket = std::env::var("S3_BUCKET").expect("S3_BUCKET must be set");
        let s3_access_key_id =
            std::env::var("S3_ACCESS_KEY_ID").expect("S3_ACCESS_KEY_ID must be set");
        let s3_secret_access_key =
            std::env::var("S3_SECRET_ACCESS_KEY").expect("S3_SECRET_ACCESS_KEY must be set");
        // Browser-reachable endpoint for presigned upload URLs — can differ
        // from S3_ENDPOINT (e.g. MinIO's docker-network hostname isn't
        // resolvable from the host locally); falls back to S3_ENDPOINT when
        // unset, since they're the same real endpoint in Preview/Production.
        let s3_public_endpoint =
            std::env::var("S3_PUBLIC_ENDPOINT").unwrap_or_else(|_| s3_endpoint.clone());

        // Disables sqlx's client-side prepared-statement cache: Neon's pooled
        // (PgBouncer transaction-mode) connection string can route different
        // statements from the same logical connection to different backend
        // servers between transactions, so a cached *named* prepared
        // statement from one backend can go missing on another, surfacing as
        // a "prepared statement does not exist" error. Unnamed statements
        // (what this produces) are re-parsed per query but aren't backend-
        // pinned, which is safe under transaction pooling.
        let connect_options = PgConnectOptions::from_str(&db_url)
            .expect("DATABASE_URL must be a valid Postgres connection string")
            .statement_cache_capacity(0);

        let pool = match PgPoolOptions::new()
            .max_connections(MAX_CONNECTIONS)
            .connect_with(connect_options)
            .await
        {
            Ok(pool) => {
                println!("Connected to DB successfully");
                pool
            }
            Err(err) => {
                println!("Failed to connect to DB: {}", err);
                std::process::exit(1);
            }
        };

        let blob = Arc::new(blob::S3BlobDeleter::new(
            &s3_endpoint,
            &s3_region,
            s3_bucket.clone(),
            &s3_access_key_id,
            &s3_secret_access_key,
        ));
        let presigner = Arc::new(blob::S3Presigner::new(
            &s3_public_endpoint,
            &s3_region,
            s3_bucket,
            &s3_access_key_id,
            &s3_secret_access_key,
        ));

        Arc::new(AppState {
            db: pool,
            blob_deleter: blob.clone(),
            blob_reader: blob,
            blob_uploader: presigner,
        })
    }
}

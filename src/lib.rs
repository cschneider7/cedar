use std::sync::Arc;

pub mod auth;
pub mod blob;
pub mod cold_call;
pub mod db;
pub mod error;
pub mod handlers;
pub mod model;
pub mod routes;
pub mod schema;
pub mod seating_chart;
#[cfg(test)]
pub mod test_support;

pub use routes::create_router;

const MAX_CONNECTIONS: usize = 4;

/// Shared state threaded through every handler via `Arc<AppState>`.
pub struct AppState {
    db: db::Db,
    blob_deleter: Arc<dyn blob::BlobDeleter>,
    blob_reader: Arc<dyn blob::BlobReader>,
    blob_uploader: Arc<dyn blob::BlobUploader>,
}

impl AppState {
    /// Connects to Postgres and builds the shared application state
    pub async fn build() -> Arc<AppState> {
        let db_url = std::env::var("POSTGRES_URL").expect("POSTGRES_URL must be set");
        let s3_endpoint = std::env::var("S3_ENDPOINT").expect("S3_ENDPOINT must be set");
        let s3_region = std::env::var("S3_REGION").expect("S3_REGION must be set");
        let s3_bucket = std::env::var("S3_BUCKET").expect("S3_BUCKET must be set");
        let s3_access_key_id =
            std::env::var("S3_ACCESS_KEY_ID").expect("S3_ACCESS_KEY_ID must be set");
        let s3_secret_access_key =
            std::env::var("S3_SECRET_ACCESS_KEY").expect("S3_SECRET_ACCESS_KEY must be set");

        let pool = match db::build_pool(&db_url, MAX_CONNECTIONS).await {
            Ok(pool) => pool,
            Err(err) => {
                println!("Failed to build DB pool: {}", err);
                std::process::exit(1);
            }
        };
        match pool.get().await {
            Ok(_) => println!("Connected to DB successfully"),
            Err(err) => {
                println!("Failed to connect to DB: {}", err);
                std::process::exit(1);
            }
        }

        let blob = Arc::new(blob::S3BlobDeleter::new(
            &s3_endpoint,
            &s3_region,
            s3_bucket,
            &s3_access_key_id,
            &s3_secret_access_key,
        ));

        Arc::new(AppState {
            db: pool,
            blob_deleter: blob.clone(),
            blob_reader: blob.clone(),
            blob_uploader: blob,
        })
    }
}

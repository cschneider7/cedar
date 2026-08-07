use sqlx::postgres::{PgPool, PgPoolOptions};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::routes::create_router;

mod auth;
mod blob;
mod cold_call;
mod error;
mod handlers;
mod model;
mod routes;
mod schema;
mod seating_chart;
#[cfg(test)]
mod test_support;

const MAX_CONNECTIONS: u32 = 10;

/// Shared state threaded through every handler via `Arc<AppState>`.
pub struct AppState {
    db: PgPool,
    blob_deleter: std::sync::Arc<dyn blob::BlobDeleter>,
}

#[tokio::main]
async fn main() {
    dotenv::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!("{}=debug,tower_http=debug", env!("CARGO_CRATE_NAME")).into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let frontend_origin =
        std::env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_string());
    let clerk_secret_key = std::env::var("CLERK_SECRET_KEY").expect("CLERK_SECRET_KEY must be set");
    let s3_endpoint = std::env::var("S3_ENDPOINT").expect("S3_ENDPOINT must be set");
    let s3_region = std::env::var("S3_REGION").expect("S3_REGION must be set");
    let s3_bucket = std::env::var("S3_BUCKET").expect("S3_BUCKET must be set");
    let s3_access_key_id = std::env::var("S3_ACCESS_KEY_ID").expect("S3_ACCESS_KEY_ID must be set");
    let s3_secret_access_key =
        std::env::var("S3_SECRET_ACCESS_KEY").expect("S3_SECRET_ACCESS_KEY must be set");

    let pool = match PgPoolOptions::new()
        .max_connections(MAX_CONNECTIONS)
        .connect(&db_url)
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

    let clerk_layer = auth::clerk_layer(&clerk_secret_key);
    let app_state = std::sync::Arc::new(AppState {
        db: pool,
        blob_deleter: std::sync::Arc::new(blob::S3BlobDeleter::new(
            &s3_endpoint,
            &s3_region,
            s3_bucket,
            &s3_access_key_id,
            &s3_secret_access_key,
        )),
    });
    let app = create_router(app_state, Some(clerk_layer), frontend_origin);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Server started successfully at 0.0.0.0:3000");
    axum::serve(listener, app).await.unwrap();
}

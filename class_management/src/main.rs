use std::net::SocketAddr;
use std::sync::Arc;

use axum_login::AuthManagerLayerBuilder;
use dotenv::dotenv;
use sqlx::postgres::{PgPool, PgPoolOptions};
use tower_sessions::{Expiry, SessionManagerLayer};
use tower_sessions_sqlx_store::PostgresStore;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::auth::Backend;
use crate::mailer::{LoggingMailer, Mailer};
use crate::routes::create_router;

mod auth;
mod cold_call;
mod error;
mod handlers;
mod mailer;
mod model;
mod routes;
mod schema;
mod seating_chart;
#[cfg(test)]
mod test_support;

const MAX_CONNECTIONS: u32 = 10;
const SESSION_DAYS: i64 = 30;

/// Shared state threaded through every handler via `Arc<AppState>`.
pub struct AppState {
    db: PgPool,
    mailer: Box<dyn Mailer>,
}

#[tokio::main]
async fn main() {
    dotenv().ok();

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

    let session_pool = tower_sessions_sqlx_store::sqlx::PgPool::connect(&db_url)
        .await
        .expect("failed to connect session store pool");
    let session_store = PostgresStore::new(session_pool);
    session_store
        .migrate()
        .await
        .expect("failed to run session store migration");

    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(cfg!(not(debug_assertions)))
        .with_same_site(tower_sessions::cookie::SameSite::Lax)
        .with_path("/")
        .with_expiry(Expiry::AtDateTime(
            time::OffsetDateTime::now_utc() + time::Duration::days(SESSION_DAYS),
        ));
    let backend = Backend { db: pool.clone() };
    let auth_layer = AuthManagerLayerBuilder::new(backend, session_layer).build();

    let app_state = Arc::new(AppState {
        db: pool,
        mailer: Box::new(LoggingMailer),
    });
    let app = create_router(app_state, auth_layer, frontend_origin);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Server started successfully at 0.0.0.0:3000");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}

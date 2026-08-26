use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use class_management::{AppState, auth, create_router};

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

    let frontend_origin =
        std::env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_string());
    let neon_auth_url =
        std::env::var("NEON_AUTH_BASE_URL").expect("NEON_AUTH_BASE_URL must be set");

    let app_state = AppState::build().await;
    let jwks_verifier = auth::JwksVerifier::new(&neon_auth_url).await;
    let app = create_router(app_state, Some(jwks_verifier), frontend_origin);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Server started successfully at 0.0.0.0:3000");
    axum::serve(listener, app).await.unwrap();
}

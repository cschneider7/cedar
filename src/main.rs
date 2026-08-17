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
    let clerk_secret_key = std::env::var("CLERK_SECRET_KEY").expect("CLERK_SECRET_KEY must be set");

    let app_state = AppState::build().await;
    let clerk_layer = auth::clerk_layer(&clerk_secret_key);
    let app = create_router(app_state, Some(clerk_layer), frontend_origin);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Server started successfully at 0.0.0.0:3000");
    axum::serve(listener, app).await.unwrap();
}

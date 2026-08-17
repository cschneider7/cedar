use tower::ServiceBuilder;
use vercel_runtime::{Error, axum::VercelLayer, run};

use class_management::{AppState, auth, create_router};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let app_state = AppState::build().await;
    let clerk_secret_key = std::env::var("CLERK_SECRET_KEY").expect("CLERK_SECRET_KEY must be set");
    let clerk_layer = auth::clerk_layer(&clerk_secret_key);
    let frontend_origin =
        std::env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_string());
    let router = create_router(app_state, Some(clerk_layer), frontend_origin);

    let app = ServiceBuilder::new()
        .layer(VercelLayer::new())
        .service(router);
    run(app).await
}

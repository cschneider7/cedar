use tower::ServiceBuilder;
use vercel_runtime::{Error, axum::VercelLayer, run};

use class_management::{AppState, auth, create_router};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let app_state = AppState::build().await;
    let neon_auth_url = std::env::var("NEON_AUTH_BASE_URL").expect("NEON_AUTH_BASE_URL must be set");
    let jwks_verifier = auth::JwksVerifier::new(&neon_auth_url).await;
    let frontend_origin =
        std::env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_string());
    let router = create_router(app_state, Some(jwks_verifier), frontend_origin);

    let app = ServiceBuilder::new()
        .layer(VercelLayer::new())
        .service(router);
    run(app).await
}

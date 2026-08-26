use tower::ServiceBuilder;
use vercel_runtime::{Error, axum::VercelLayer, run};

use class_management::{AppState, auth, create_router};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let app_state = AppState::build().await;
    // SUPABASE_URL is injected automatically by the Supabase Vercel
    // Marketplace integration for the connected environment.
    let supabase_url = std::env::var("SUPABASE_URL").expect("SUPABASE_URL must be set");
    let supabase_auth_url = format!("{}/auth/v1", supabase_url.trim_end_matches('/'));
    let jwks_verifier = auth::JwksVerifier::new(&supabase_auth_url).await;
    let frontend_origin =
        std::env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_string());
    let router = create_router(app_state, Some(jwks_verifier), frontend_origin);

    let app = ServiceBuilder::new()
        .layer(VercelLayer::new())
        .service(router);
    run(app).await
}

use tower::ServiceBuilder;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use vercel_runtime::{Error, axum::VercelLayer, run};

use class_management::{AppState, auth, create_router};

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!("{}=info,tower_http=warn", env!("CARGO_CRATE_NAME")).into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let app_state = AppState::build().await;
    let supabase_url = std::env::var("SUPABASE_URL").expect("SUPABASE_URL must be set");
    let supabase_auth_url = format!("{}/auth/v1", supabase_url.trim_end_matches('/'));
    let jwks_verifier = auth::JwksVerifier::new(&supabase_auth_url).await;
    let router = create_router(app_state, Some(jwks_verifier));

    let app = ServiceBuilder::new()
        .layer(VercelLayer::new())
        .service(router);
    run(app).await
}

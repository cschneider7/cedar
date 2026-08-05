use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{MatchedPath, Request},
    http::{HeaderValue, Method, header},
    middleware::from_fn,
    routing::{delete, get, patch, post, put},
};
use clerk_rs::validators::{axum::ClerkLayer, jwks::MemoryCacheJwksProvider};
use serde_json::json;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::error::log_app_errors;
use crate::{AppState, handlers};

/// Builds the full `/api/v1/*` router, wiring every handler to its route and
/// attaching shared state plus Clerk-auth/CORS/tracing/error-logging
/// middleware. `clerk_layer` is `None` in tests, which bypass Clerk JWT
/// verification while still exercising every handler's own auth-extractor
/// logic (see `test_support.rs`).
pub fn create_router(
    app_state: Arc<AppState>,
    clerk_layer: Option<ClerkLayer<MemoryCacheJwksProvider>>,
    frontend_origin: String,
) -> Router {
    let cors_layer = CorsLayer::new()
        .allow_origin(
            frontend_origin
                .parse::<HeaderValue>()
                .expect("FRONTEND_ORIGIN must be a valid header value"),
        )
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::PUT,
            Method::DELETE,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    let health_routes =
        Router::new().route("/health", get(|| async { Json(json!({"message": "OK"})) }));

    let app_routes = Router::new()
        .route(
            "/api/v1/students",
            get(handlers::student::student_list_handler),
        )
        .route(
            "/api/v1/students",
            post(handlers::student::create_student_handler),
        )
        .route(
            "/api/v1/students",
            delete(handlers::student::bulk_delete_students_handler),
        )
        .route(
            "/api/v1/students/{student_id}",
            get(handlers::student::get_student_handler),
        )
        .route(
            "/api/v1/students/{student_id}",
            patch(handlers::student::update_student_handler),
        )
        .route(
            "/api/v1/students/{student_id}",
            delete(handlers::student::delete_student_handler),
        )
        .route(
            "/api/v1/classrooms",
            get(handlers::classroom::classroom_list_handler),
        )
        .route(
            "/api/v1/classrooms",
            post(handlers::classroom::create_classroom_handler),
        )
        .route(
            "/api/v1/classrooms/{classroom_id}",
            get(handlers::classroom::get_classroom_handler),
        )
        .route(
            "/api/v1/classrooms/{classroom_id}",
            patch(handlers::classroom::update_classroom_handler),
        )
        .route(
            "/api/v1/classrooms/{classroom_id}",
            delete(handlers::classroom::delete_classroom_handler),
        )
        .route(
            "/api/v1/classrooms/{classroom_id}/seating-chart",
            get(handlers::classroom::get_seating_chart_handler),
        )
        .route(
            "/api/v1/classrooms/{classroom_id}/seating-chart",
            put(handlers::classroom::update_seating_chart_handler),
        )
        .route(
            "/api/v1/classrooms/{classroom_id}/seating-chart/randomize",
            post(handlers::classroom::randomize_seating_chart_handler),
        )
        .route(
            "/api/v1/classrooms/{classroom_id}/cold-call",
            post(handlers::classroom::cold_call_handler),
        );

    let app_routes = match clerk_layer {
        Some(clerk_layer) => app_routes.layer(clerk_layer),
        None => app_routes,
    };

    health_routes
        .merge(app_routes)
        .layer(cors_layer)
        .layer(from_fn(log_app_errors))
        .layer(TraceLayer::new_for_http().make_span_with(|req: &Request| {
            let method = req.method();
            let uri = req.uri();

            // axum automatically adds this extension.
            let matched_path = req
                .extensions()
                .get::<MatchedPath>()
                .map(|matched_path| matched_path.as_str());

            tracing::debug_span!("request", %method, %uri, matched_path)
        }))
        .with_state(app_state)
}

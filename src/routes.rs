use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{MatchedPath, Request},
    middleware::from_fn,
    routing::{delete, get, patch, post, put},
};
use serde_json::json;
use tower_http::trace::TraceLayer;

use crate::auth::JwksVerifier;
use crate::error::log_app_errors;
use crate::{AppState, handlers};

/// Builds the full api router
///
/// The frontend reaches this router same-origin (Vite dev-server proxy locally,
/// `vercel.json` rewrite in prod), so there is no CORS layer.
pub fn create_router(app_state: Arc<AppState>, jwks_verifier: Option<JwksVerifier>) -> Router {
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
            "/api/v1/students/count",
            get(handlers::student::count_students_handler),
        )
        .route(
            "/api/v1/students/{student_id}",
            get(handlers::student::get_student_handler),
        )
        .route(
            "/api/v1/students/{student_id}/image",
            get(handlers::student::get_student_image_handler),
        )
        .route(
            "/api/v1/students/image-upload-url",
            post(handlers::student::create_student_image_upload_url_handler),
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
        )
        .route(
            "/api/v1/separations",
            get(handlers::separation::list_separations_handler),
        )
        .route(
            "/api/v1/separations",
            post(handlers::separation::create_separation_handler),
        )
        .route(
            "/api/v1/separations/{separation_id}",
            delete(handlers::separation::delete_separation_handler),
        );

    let app_routes = match jwks_verifier {
        Some(jwks_verifier) => app_routes.layer(axum::middleware::from_fn_with_state(
            jwks_verifier,
            crate::auth::supabase_auth_middleware,
        )),
        None => app_routes,
    };

    health_routes
        .merge(app_routes)
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

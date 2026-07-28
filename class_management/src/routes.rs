use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{MatchedPath, Request},
    http::{HeaderValue, Method, StatusCode, header},
    middleware::from_fn,
    routing::{delete, get, patch, post, put},
};
use axum_login::{AuthManagerLayer, AuthSession, predicate_required};
use serde_json::json;
use tower_governor::{GovernorLayer, governor::GovernorConfigBuilder};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tower_sessions::SessionStore;

use crate::auth::Backend;
use crate::error::log_app_errors;
use crate::{AppState, handlers};

async fn is_authenticated(auth_session: AuthSession<Backend>) -> bool {
    auth_session.user.is_some()
}

/// Builds the full `/api/v1/*` router, wiring every handler to its route
/// and attaching shared state plus session/CORS/rate-limit/tracing/
/// error-logging middleware.
pub fn create_router<Sessions>(
    app_state: Arc<AppState>,
    auth_layer: AuthManagerLayer<Backend, Sessions>,
    frontend_origin: String,
) -> Router
where
    Sessions: SessionStore + Clone,
{
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
        .allow_headers([header::CONTENT_TYPE]);

    let auth_rate_limit = GovernorLayer {
        config: Arc::new(
            GovernorConfigBuilder::default()
                .per_second(3)
                .burst_size(20)
                .finish()
                .expect("invalid governor rate-limit config"),
        ),
    };

    let public_auth_routes = Router::new()
        .route("/api/v1/auth/signup", post(handlers::auth::signup_handler))
        .route("/api/v1/auth/login", post(handlers::auth::login_handler))
        .route("/api/v1/auth/logout", post(handlers::auth::logout_handler))
        .route(
            "/api/v1/auth/resend-verification",
            post(handlers::auth::resend_verification_handler),
        )
        .route(
            "/api/v1/auth/verify-email",
            post(handlers::auth::verify_email_handler),
        )
        .route(
            "/api/v1/auth/forgot-password",
            post(handlers::auth::forgot_password_handler),
        )
        .route(
            "/api/v1/auth/reset-password",
            post(handlers::auth::reset_password_handler),
        );

    let protected_auth_routes = Router::new()
        .route("/api/v1/auth/me", get(handlers::auth::me_handler))
        .route_layer(predicate_required!(
            is_authenticated,
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "message": "Not authenticated" }))
            )
        ));

    let auth_routes = Router::new()
        .merge(public_auth_routes)
        .merge(protected_auth_routes)
        .layer(auth_rate_limit);

    let protected_app_routes = Router::new()
        .route(
            "/api/v1/students",
            get(handlers::student::student_list_handler),
        )
        .route(
            "/api/v1/students",
            post(handlers::student::create_student_handler),
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
        .route_layer(predicate_required!(
            is_authenticated,
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "message": "Not authenticated" }))
            )
        ));

    Router::new()
        .merge(auth_routes)
        .merge(protected_app_routes)
        .layer(auth_layer)
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

use std::sync::Arc;

use axum::{
    Json,
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde::Serialize;

/// Application-wide error type
#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    Internal(String),
    BadRequest(String),
    Unauthorized(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        #[derive(Serialize)]
        struct ErrorResponse {
            message: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            code: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            retry_after_secs: Option<i64>,
        }

        // Only unexpected failures (NotFound/Internal) are logged — the rest
        // are routine, caller-facing outcomes (bad input, auth failure, etc).
        let (status, message, code, retry_after_secs, loggable) = match &self {
            AppError::NotFound(_) => (
                StatusCode::NOT_FOUND,
                "Resource not found".to_string(),
                None,
                None,
                true,
            ),
            AppError::Internal(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Something went wrong".to_string(),
                None,
                None,
                true,
            ),
            AppError::BadRequest(message) => {
                (StatusCode::BAD_REQUEST, message.clone(), None, None, false)
            }
            AppError::Unauthorized(message) => {
                (StatusCode::UNAUTHORIZED, message.clone(), None, None, false)
            }
        };

        let mut response = (
            status,
            Json(ErrorResponse {
                message,
                code,
                retry_after_secs,
            }),
        )
            .into_response();
        if loggable {
            response.extensions_mut().insert(Arc::new(self));
        }
        response
    }
}

impl From<tokio_postgres::Error> for AppError {
    fn from(e: tokio_postgres::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}

impl From<deadpool_postgres::PoolError> for AppError {
    fn from(e: deadpool_postgres::PoolError) -> Self {
        AppError::Internal(e.to_string())
    }
}

impl AppError {
    fn detail(&self) -> &str {
        match self {
            AppError::NotFound(detail)
            | AppError::Internal(detail)
            | AppError::BadRequest(detail)
            | AppError::Unauthorized(detail) => detail,
        }
    }
}

/// Middleware that logs any `AppError`
pub async fn log_app_errors(request: Request, next: Next) -> Response {
    let response = next.run(request).await;
    if let Some(err) = response.extensions().get::<Arc<AppError>>() {
        tracing::error!(
            detail = err.detail(),
            "an unexpected error occurred inside a handler"
        );
    }
    response
}

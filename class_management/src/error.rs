use std::sync::Arc;

use axum::{
    Json,
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde::Serialize;

/// Application-wide error type returned by handlers; its `IntoResponse` impl
/// maps each variant to an HTTP status code and a `{"message": ...}` body.
#[derive(Debug)]
pub enum AppError {
    /// The requested resource does not exist.
    NotFound(String),
    /// An unexpected, non-recoverable failure occurred.
    Internal(String),
    /// The request was invalid; the message is shown directly to the caller.
    BadRequest(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        #[derive(Serialize)]
        struct ErrorResponse {
            message: String,
        }

        let (status, message, err) = match &self {
            AppError::NotFound(_message) => (
                StatusCode::NOT_FOUND,
                "Resource not found".to_string(),
                Some(self),
            ),
            AppError::Internal(_message) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Something went wrong".to_string(),
                Some(self),
            ),
            AppError::BadRequest(message) => (StatusCode::BAD_REQUEST, message.clone(), Some(self)),
        };

        let mut response = (status, Json(ErrorResponse { message })).into_response();
        if let Some(err) = err {
            response.extensions_mut().insert(Arc::new(err));
        }
        response
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match &e {
            sqlx::Error::RowNotFound => AppError::NotFound("Resource not found".to_string()),
            _ => AppError::Internal(e.to_string()),
        }
    }
}

/// Middleware that logs any `AppError` a handler attached to the response
/// extensions, after the inner handler has already produced the response.
pub async fn log_app_errors(request: Request, next: Next) -> Response {
    let response = next.run(request).await;
    if let Some(err) = response.extensions().get::<Arc<AppError>>() {
        tracing::error!(?err, "an unexpected error occurred inside a handler");
    }
    response
}

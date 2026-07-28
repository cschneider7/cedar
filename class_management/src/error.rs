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
/// maps each variant to an HTTP status code and a `{"message", "code"?}` body.
#[derive(Debug)]
pub enum AppError {
    /// The requested resource does not exist.
    NotFound(String),
    /// An unexpected, non-recoverable failure occurred.
    Internal(String),
    /// The request was invalid; the message is shown directly to the caller.
    BadRequest(String),
    /// The request conflicts with existing state (e.g. a duplicate email).
    Conflict(String),
    /// Authentication was attempted but failed (e.g. bad credentials).
    Unauthorized(String),
    /// The caller is authenticated but not allowed to perform this action,
    /// with a machine-readable `code` the frontend can branch on.
    Forbidden { message: String, code: String },
    /// The caller has exceeded a rate limit, with a machine-readable `code`
    /// and a hint for how long to wait before retrying.
    TooManyRequests {
        message: String,
        code: String,
        retry_after_secs: i64,
    },
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
            AppError::Conflict(message) => {
                (StatusCode::CONFLICT, message.clone(), None, None, false)
            }
            AppError::Unauthorized(message) => {
                (StatusCode::UNAUTHORIZED, message.clone(), None, None, false)
            }
            AppError::Forbidden { message, code } => (
                StatusCode::FORBIDDEN,
                message.clone(),
                Some(code.clone()),
                None,
                false,
            ),
            AppError::TooManyRequests {
                message,
                code,
                retry_after_secs,
            } => (
                StatusCode::TOO_MANY_REQUESTS,
                message.clone(),
                Some(code.clone()),
                Some(*retry_after_secs),
                false,
            ),
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

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match &e {
            sqlx::Error::RowNotFound => AppError::NotFound("Resource not found".to_string()),
            _ => AppError::Internal(e.to_string()),
        }
    }
}

impl AppError {
    /// The detailed, internal error message — distinct from the generic
    /// caller-facing message some variants (`NotFound`/`Internal`) return.
    fn detail(&self) -> &str {
        match self {
            AppError::NotFound(detail)
            | AppError::Internal(detail)
            | AppError::BadRequest(detail)
            | AppError::Conflict(detail)
            | AppError::Unauthorized(detail) => detail,
            AppError::Forbidden { message, .. } => message,
            AppError::TooManyRequests { message, .. } => message,
        }
    }
}

/// Middleware that logs any `AppError` a handler attached to the response
/// extensions, after the inner handler has already produced the response.
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

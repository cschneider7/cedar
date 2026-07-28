use std::sync::Arc;

use axum::{Json, extract::State, http::StatusCode};
use axum_login::AuthSession;
use chrono::{Duration, Utc};
use rand::RngCore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::AppState;
use crate::auth::{AuthError, Backend, Credentials};
use crate::error::AppError;
use crate::model::UserModel;
use crate::schema::{
    ForgotPasswordSchema, LoginSchema, ResendVerificationSchema, ResetPasswordSchema, SignupSchema,
    VerifyEmailSchema,
};

const VERIFICATION_TOKEN_HOURS: i64 = 24;
const RESET_TOKEN_HOURS: i64 = 1;
const RESEND_COOLDOWN_SECONDS: i64 = 60;
const MIN_PASSWORD_LEN: usize = 8;

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Generates a random 32-byte token and its hash
fn generate_token() -> (String, String) {
    let mut raw = [0u8; 32];
    rand::rng().fill_bytes(&mut raw);
    let raw_hex = hex_encode(&raw);
    let hash_hex = hex_encode(&Sha256::digest(raw_hex.as_bytes()));
    (raw_hex, hash_hex)
}

fn user_json(user: &UserModel) -> Value {
    json!({ "id": user.id, "email": user.email })
}

pub async fn signup_handler(
    State(app_state): State<Arc<AppState>>,
    Json(body): Json<SignupSchema>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    if body.password.len() < MIN_PASSWORD_LEN {
        return Err(AppError::BadRequest(format!(
            "Password must be at least {MIN_PASSWORD_LEN} characters"
        )));
    }
    let email = body.email.to_lowercase();
    let password_hash = password_auth::generate_hash(&body.password);

    let user = sqlx::query_as!(
        UserModel,
        r#"INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *"#,
        email,
        password_hash
    )
    .fetch_one(&app_state.db)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
            AppError::Conflict("An account with this email already exists".to_string())
        }
        _ => AppError::from(e),
    })?;

    let (raw_token, token_hash) = generate_token();
    let expires_at = Utc::now() + Duration::hours(VERIFICATION_TOKEN_HOURS);
    sqlx::query!(
        r#"INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at)
           VALUES ($1, $2, 'email_verification', $3)"#,
        user.id,
        token_hash,
        expires_at
    )
    .execute(&app_state.db)
    .await?;

    let frontend_origin =
        std::env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_string());
    app_state
        .mailer
        .send(
            &user.email,
            "Verify your email",
            &format!("{frontend_origin}/verify-email?token={raw_token}"),
        )
        .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "data": { "user": user_json(&user) } })),
    ))
}

pub async fn login_handler(
    mut auth_session: AuthSession<Backend>,
    Json(body): Json<LoginSchema>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    let creds = Credentials {
        email: body.email,
        password: body.password,
    };

    let user = match auth_session.authenticate(creds).await {
        Ok(Some(user)) => user,
        Ok(None) => {
            return Err(AppError::Unauthorized(
                "Invalid email or password".to_string(),
            ));
        }
        Err(axum_login::Error::Backend(AuthError::LockedOut { retry_after_secs })) => {
            let minutes = (retry_after_secs / 60).max(1);
            return Err(AppError::TooManyRequests {
                message: format!("Too many failed attempts. Try again in {minutes} minutes."),
                code: "locked_out".to_string(),
                retry_after_secs,
            });
        }
        Err(axum_login::Error::Backend(AuthError::Sqlx(e))) => return Err(AppError::from(e)),
        Err(axum_login::Error::Session(e)) => {
            return Err(AppError::Internal(e.to_string()));
        }
    };

    if !user.email_verified {
        return Err(AppError::Forbidden {
            message: "Please verify your email before logging in".to_string(),
            code: "unverified".to_string(),
        });
    }

    auth_session
        .login(&user)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(json!({ "data": { "user": user_json(&user) } })))
}

pub async fn logout_handler(
    mut auth_session: AuthSession<Backend>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    auth_session
        .logout()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(Json(json!({ "data": { "ok": true } })))
}

pub async fn me_handler(
    auth_session: AuthSession<Backend>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::Unauthorized("Not authenticated".to_string()))?;
    Ok(Json(json!({ "data": { "user": user_json(&user) } })))
}

pub async fn resend_verification_handler(
    State(app_state): State<Arc<AppState>>,
    Json(body): Json<ResendVerificationSchema>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    let email = body.email.to_lowercase();
    let user = sqlx::query_as!(UserModel, r#"SELECT * FROM users WHERE email = $1"#, email)
        .fetch_optional(&app_state.db)
        .await?;

    if let Some(user) = user
        && !user.email_verified
    {
        let cooldown_active = user.last_verification_email_sent_at.is_some_and(|sent_at| {
            Utc::now() - sent_at < Duration::seconds(RESEND_COOLDOWN_SECONDS)
        });
        if !cooldown_active {
            let (raw_token, token_hash) = generate_token();
            let expires_at = Utc::now() + Duration::hours(VERIFICATION_TOKEN_HOURS);
            sqlx::query!(
                r#"INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at)
                   VALUES ($1, $2, 'email_verification', $3)"#,
                user.id,
                token_hash,
                expires_at
            )
            .execute(&app_state.db)
            .await?;
            sqlx::query!(
                r#"UPDATE users SET last_verification_email_sent_at = now() WHERE id = $1"#,
                user.id
            )
            .execute(&app_state.db)
            .await?;

            let frontend_origin = std::env::var("FRONTEND_ORIGIN")
                .unwrap_or_else(|_| "http://localhost:5173".to_string());
            app_state
                .mailer
                .send(
                    &user.email,
                    "Verify your email",
                    &format!("{frontend_origin}/verify-email?token={raw_token}"),
                )
                .await;
        }
    }

    Ok(Json(json!({ "data": { "ok": true } })))
}

pub async fn verify_email_handler(
    State(app_state): State<Arc<AppState>>,
    Json(body): Json<VerifyEmailSchema>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    let token_hash = hex_encode(&Sha256::digest(body.token.as_bytes()));

    let mut tx = app_state.db.begin().await?;
    let token = sqlx::query!(
        r#"SELECT id, user_id FROM verification_tokens
           WHERE token_hash = $1 AND purpose = 'email_verification'
             AND used_at IS NULL AND expires_at > now()"#,
        token_hash
    )
    .fetch_optional(&mut *tx)
    .await?;

    let Some(token) = token else {
        return Err(AppError::BadRequest(
            "This verification link is invalid or has expired".to_string(),
        ));
    };

    sqlx::query!(
        r#"UPDATE users SET email_verified = true WHERE id = $1"#,
        token.user_id
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        r#"UPDATE verification_tokens SET used_at = now() WHERE id = $1"#,
        token.id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(json!({ "data": { "ok": true } })))
}

pub async fn forgot_password_handler(
    State(app_state): State<Arc<AppState>>,
    Json(body): Json<ForgotPasswordSchema>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    let email = body.email.to_lowercase();
    let user = sqlx::query_as!(UserModel, r#"SELECT * FROM users WHERE email = $1"#, email)
        .fetch_optional(&app_state.db)
        .await?;

    if let Some(user) = user {
        let (raw_token, token_hash) = generate_token();
        let expires_at = Utc::now() + Duration::hours(RESET_TOKEN_HOURS);
        sqlx::query!(
            r#"INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at)
               VALUES ($1, $2, 'password_reset', $3)"#,
            user.id,
            token_hash,
            expires_at
        )
        .execute(&app_state.db)
        .await?;

        let frontend_origin = std::env::var("FRONTEND_ORIGIN")
            .unwrap_or_else(|_| "http://localhost:5173".to_string());
        app_state
            .mailer
            .send(
                &user.email,
                "Reset your password",
                &format!("{frontend_origin}/reset-password?token={raw_token}"),
            )
            .await;
    }

    Ok(Json(json!({ "data": { "ok": true } })))
}

pub async fn reset_password_handler(
    State(app_state): State<Arc<AppState>>,
    Json(body): Json<ResetPasswordSchema>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    if body.password.len() < MIN_PASSWORD_LEN {
        return Err(AppError::BadRequest(format!(
            "Password must be at least {MIN_PASSWORD_LEN} characters"
        )));
    }
    let token_hash = hex_encode(&Sha256::digest(body.token.as_bytes()));

    let mut tx = app_state.db.begin().await?;
    let token = sqlx::query!(
        r#"SELECT id, user_id FROM verification_tokens
           WHERE token_hash = $1 AND purpose = 'password_reset'
             AND used_at IS NULL AND expires_at > now()"#,
        token_hash
    )
    .fetch_optional(&mut *tx)
    .await?;

    let Some(token) = token else {
        return Err(AppError::BadRequest(
            "This reset link is invalid or has expired".to_string(),
        ));
    };

    let password_hash = password_auth::generate_hash(&body.password);
    sqlx::query!(
        r#"UPDATE users SET password_hash = $1 WHERE id = $2"#,
        password_hash,
        token.user_id
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        r#"UPDATE verification_tokens SET used_at = now() WHERE id = $1"#,
        token.id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(json!({ "data": { "ok": true } })))
}

#[cfg(test)]
mod tests {
    use axum::http::{StatusCode, header};
    use chrono::{Duration, Utc};
    use serde_json::json;
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;
    use crate::test_support::{app, body_json, json_request};

    async fn insert_user(pool: &sqlx::PgPool, email: &str, verified: bool) -> UserModel {
        let password_hash = password_auth::generate_hash(crate::test_support::TEST_PASSWORD);
        sqlx::query_as!(
            UserModel,
            r#"INSERT INTO users (email, password_hash, email_verified)
               VALUES ($1, $2, $3) RETURNING *"#,
            email,
            password_hash,
            verified
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn insert_verification_token(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        token_hash: &str,
        purpose: &str,
        expires_at: chrono::DateTime<Utc>,
        used_at: Option<chrono::DateTime<Utc>>,
    ) {
        sqlx::query!(
            r#"INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at, used_at)
               VALUES ($1, $2, $3, $4, $5)"#,
            user_id,
            token_hash,
            purpose,
            expires_at,
            used_at
        )
        .execute(pool)
        .await
        .unwrap();
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn signup_success_creates_unverified_user_and_lowercases_email(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let body = json!({"email": "Test@Example.com", "password": "password123"});

        let response = app
            .oneshot(json_request("POST", "/api/v1/auth/signup", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);

        let json = body_json(response).await;
        assert_eq!(json["data"]["user"]["email"], "test@example.com");
        assert!(json["data"]["user"]["id"].is_string());

        let user = sqlx::query_as!(
            UserModel,
            r#"SELECT * FROM users WHERE email = 'test@example.com'"#
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(!user.email_verified);

        let token_count: i64 = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!" FROM verification_tokens WHERE user_id = $1 AND purpose = 'email_verification'"#,
            user.id
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(token_count, 1);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn signup_duplicate_email_returns_409(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        insert_user(&pool, "test@example.com", false).await;

        let body = json!({"email": "test@example.com", "password": "password123"});
        let response = app
            .oneshot(json_request("POST", "/api/v1/auth/signup", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CONFLICT);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn signup_rejects_short_password(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let body = json!({"email": "test@example.com", "password": "short"});

        let response = app
            .oneshot(json_request("POST", "/api/v1/auth/signup", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn login_success_sets_cookie_and_allows_me(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        insert_user(&pool, "test@example.com", true).await;

        let body =
            json!({"email": "test@example.com", "password": crate::test_support::TEST_PASSWORD});
        let response = app
            .clone()
            .oneshot(json_request("POST", "/api/v1/auth/login", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let json = body_json(response).await;
        assert_eq!(json["data"]["user"]["email"], "test@example.com");

        let me_response = app
            .oneshot(crate::test_support::authenticated_request(
                "GET",
                "/api/v1/auth/me",
                &cookie,
            ))
            .await
            .unwrap();
        assert_eq!(me_response.status(), StatusCode::OK);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn login_wrong_password_returns_401(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        insert_user(&pool, "test@example.com", true).await;

        let body = json!({"email": "test@example.com", "password": "wrong-password"});
        let response = app
            .oneshot(json_request("POST", "/api/v1/auth/login", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let json = body_json(response).await;
        assert_eq!(json["message"], "Invalid email or password");

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn login_unverified_account_returns_403_unverified(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        insert_user(&pool, "test@example.com", false).await;

        let body =
            json!({"email": "test@example.com", "password": crate::test_support::TEST_PASSWORD});
        let response = app
            .oneshot(json_request("POST", "/api/v1/auth/login", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let json = body_json(response).await;
        assert_eq!(json["code"], "unverified");

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn login_locked_out_after_five_failed_attempts(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        insert_user(&pool, "test@example.com", true).await;

        for _ in 0..4 {
            let body = json!({"email": "test@example.com", "password": "wrong-password"});
            let response = app
                .clone()
                .oneshot(json_request("POST", "/api/v1/auth/login", body))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }

        // 5th failure crosses the lockout threshold.
        let body = json!({"email": "test@example.com", "password": "wrong-password"});
        let response = app
            .clone()
            .oneshot(json_request("POST", "/api/v1/auth/login", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
        let json = body_json(response).await;
        assert_eq!(json["code"], "locked_out");

        // Even the correct password is rejected while locked out.
        let body =
            json!({"email": "test@example.com", "password": crate::test_support::TEST_PASSWORD});
        let response = app
            .oneshot(json_request("POST", "/api/v1/auth/login", body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn logout_is_idempotent_and_clears_session(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());

        // Logging out with no session at all still succeeds.
        let response = app
            .clone()
            .oneshot(json_request("POST", "/api/v1/auth/logout", json!({})))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response).await;
        assert_eq!(json["data"]["ok"], true);

        insert_user(&pool, "test@example.com", true).await;
        let login_response = app
            .clone()
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/login",
                json!({"email": "test@example.com", "password": crate::test_support::TEST_PASSWORD}),
            ))
            .await
            .unwrap();
        let cookie = login_response
            .headers()
            .get(header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();

        let logout_response = app
            .clone()
            .oneshot(crate::test_support::authenticated_request(
                "POST",
                "/api/v1/auth/logout",
                &cookie,
            ))
            .await
            .unwrap();
        assert_eq!(logout_response.status(), StatusCode::OK);

        let me_response = app
            .oneshot(crate::test_support::authenticated_request(
                "GET",
                "/api/v1/auth/me",
                &cookie,
            ))
            .await
            .unwrap();
        assert_eq!(me_response.status(), StatusCode::UNAUTHORIZED);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn me_unauthenticated_returns_401(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());

        let response = app
            .oneshot(json_request("GET", "/api/v1/auth/me", json!(null)))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn resend_verification_unknown_email_still_200(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());

        let response = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/resend-verification",
                json!({"email": "nobody@example.com"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn resend_verification_already_verified_no_new_token(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user = insert_user(&pool, "test@example.com", true).await;

        let response = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/resend-verification",
                json!({"email": "test@example.com"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let token_count: i64 = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!" FROM verification_tokens WHERE user_id = $1"#,
            user.id
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(token_count, 0);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn resend_verification_cooldown_blocks_second_call(
        pool: sqlx::PgPool,
    ) -> sqlx::Result<()> {
        let app = app(pool.clone());
        insert_user(&pool, "test@example.com", false).await;
        let user = sqlx::query_as!(
            UserModel,
            r#"SELECT * FROM users WHERE email = 'test@example.com'"#
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        let first = app
            .clone()
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/resend-verification",
                json!({"email": "test@example.com"}),
            ))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::OK);

        let second = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/resend-verification",
                json!({"email": "test@example.com"}),
            ))
            .await
            .unwrap();
        assert_eq!(second.status(), StatusCode::OK);

        let token_count: i64 = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!" FROM verification_tokens WHERE user_id = $1"#,
            user.id
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(token_count, 1);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn verify_email_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user = insert_user(&pool, "test@example.com", false).await;
        let (raw_token, token_hash) = generate_token();
        insert_verification_token(
            &pool,
            user.id,
            &token_hash,
            "email_verification",
            Utc::now() + Duration::hours(1),
            None,
        )
        .await;

        let response = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/verify-email",
                json!({"token": raw_token}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let updated = sqlx::query_as!(UserModel, r#"SELECT * FROM users WHERE id = $1"#, user.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(updated.email_verified);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn verify_email_invalid_token_returns_400(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());

        let response = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/verify-email",
                json!({"token": "not-a-real-token"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn verify_email_expired_token_returns_400(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user = insert_user(&pool, "test@example.com", false).await;
        let (raw_token, token_hash) = generate_token();
        insert_verification_token(
            &pool,
            user.id,
            &token_hash,
            "email_verification",
            Utc::now() - Duration::hours(1),
            None,
        )
        .await;

        let response = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/verify-email",
                json!({"token": raw_token}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn verify_email_already_used_token_returns_400(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user = insert_user(&pool, "test@example.com", false).await;
        let (raw_token, token_hash) = generate_token();
        insert_verification_token(
            &pool,
            user.id,
            &token_hash,
            "email_verification",
            Utc::now() + Duration::hours(1),
            Some(Utc::now()),
        )
        .await;

        let response = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/verify-email",
                json!({"token": raw_token}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn forgot_password_unknown_email_still_200(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());

        let response = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/forgot-password",
                json!({"email": "nobody@example.com"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn forgot_password_success_inserts_reset_token(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user = insert_user(&pool, "test@example.com", true).await;

        let response = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/forgot-password",
                json!({"email": "test@example.com"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let token_count: i64 = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!" FROM verification_tokens WHERE user_id = $1 AND purpose = 'password_reset'"#,
            user.id
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(token_count, 1);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn reset_password_success(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user = insert_user(&pool, "test@example.com", true).await;
        let (raw_token, token_hash) = generate_token();
        insert_verification_token(
            &pool,
            user.id,
            &token_hash,
            "password_reset",
            Utc::now() + Duration::hours(1),
            None,
        )
        .await;

        let response = app
            .clone()
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/reset-password",
                json!({"token": raw_token, "password": "new-password-123"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        // Old password no longer works; new one does.
        let old_login = app
            .clone()
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/login",
                json!({"email": "test@example.com", "password": crate::test_support::TEST_PASSWORD}),
            ))
            .await
            .unwrap();
        assert_eq!(old_login.status(), StatusCode::UNAUTHORIZED);

        let new_login = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/login",
                json!({"email": "test@example.com", "password": "new-password-123"}),
            ))
            .await
            .unwrap();
        assert_eq!(new_login.status(), StatusCode::OK);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn reset_password_invalid_token_returns_400(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());

        let response = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/reset-password",
                json!({"token": "not-a-real-token", "password": "new-password-123"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn reset_password_rejects_short_password(pool: sqlx::PgPool) -> sqlx::Result<()> {
        let app = app(pool.clone());
        let user = insert_user(&pool, "test@example.com", true).await;
        let (raw_token, token_hash) = generate_token();
        insert_verification_token(
            &pool,
            user.id,
            &token_hash,
            "password_reset",
            Utc::now() + Duration::hours(1),
            None,
        )
        .await;

        let response = app
            .oneshot(json_request(
                "POST",
                "/api/v1/auth/reset-password",
                json!({"token": raw_token, "password": "short"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok(())
    }
}

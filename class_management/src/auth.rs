use std::sync::LazyLock;

use axum_login::AuthnBackend;
use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::model::UserModel;

const MAX_FAILED_ATTEMPTS: i16 = 5;
const LOCKOUT_MINUTES: i64 = 10;

/// Credentials submitted to `/api/v1/auth/login`.
#[derive(Debug, Clone)]
pub struct Credentials {
    pub email: String,
    pub password: String,
}

/// `AuthnBackend::Error` — kept small since `authenticate`'s `Result` is the
/// only place lockout is distinguishable from "wrong password" (`Ok(None)`).
#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("account is locked for {retry_after_secs}s")]
    LockedOut { retry_after_secs: i64 },
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct Backend {
    pub db: PgPool,
}

/// Dummy password used in place of a real user's hash when the email isn't found
static DUMMY_PASSWORD_HASH: LazyLock<String> =
    LazyLock::new(|| password_auth::generate_hash("dummy-password-for-timing-safety"));

impl AuthnBackend for Backend {
    type User = UserModel;
    type Credentials = Credentials;
    type Error = AuthError;

    async fn authenticate(&self, creds: Credentials) -> Result<Option<UserModel>, AuthError> {
        let email = creds.email.to_lowercase();
        let user = sqlx::query_as!(UserModel, r#"SELECT * FROM users WHERE email = $1"#, email)
            .fetch_optional(&self.db)
            .await?;

        if let Some(ref user) = user
            && let Some(locked_until) = user.locked_until
            && locked_until > Utc::now()
        {
            let retry_after_secs = (locked_until - Utc::now()).num_seconds().max(0);
            return Err(AuthError::LockedOut { retry_after_secs });
        }

        let password_hash = user
            .as_ref()
            .map(|u| u.password_hash.as_str())
            .unwrap_or(DUMMY_PASSWORD_HASH.as_str());
        let verified = password_auth::verify_password(&creds.password, password_hash).is_ok();

        let Some(user) = user else {
            return Ok(None);
        };

        if !verified {
            let attempts = user.failed_login_attempts + 1;
            let locked_until = if attempts >= MAX_FAILED_ATTEMPTS {
                Some(Utc::now() + chrono::Duration::minutes(LOCKOUT_MINUTES))
            } else {
                None
            };
            sqlx::query!(
                r#"UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3"#,
                attempts,
                locked_until,
                user.id
            )
            .execute(&self.db)
            .await?;

            if let Some(locked_until) = locked_until {
                let retry_after_secs = (locked_until - Utc::now()).num_seconds().max(0);
                return Err(AuthError::LockedOut { retry_after_secs });
            }
            return Ok(None);
        }

        sqlx::query!(
            r#"UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1"#,
            user.id
        )
        .execute(&self.db)
        .await?;

        Ok(Some(user))
    }

    async fn get_user(&self, user_id: &Uuid) -> Result<Option<UserModel>, AuthError> {
        let user = sqlx::query_as!(UserModel, r#"SELECT * FROM users WHERE id = $1"#, user_id)
            .fetch_optional(&self.db)
            .await?;
        Ok(user)
    }
}

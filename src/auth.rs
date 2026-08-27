use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    extract::{Extension, FromRequestParts, Request, State},
    http::{header::AUTHORIZATION, request::Parts},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use tokio::sync::RwLock;

use crate::error::AppError;

#[derive(serde::Deserialize, Clone)]
pub struct SupabaseAuthClaims {
    pub sub: String,
}

/// Minimum time between JWKS refresh attempts triggered by an unknown `kid`
const JWKS_REFRESH_MIN_INTERVAL: Duration = Duration::from_secs(10);
const JWKS_FETCH_TIMEOUT: Duration = Duration::from_secs(5);

struct Inner {
    jwks_url: String,
    validation: Validation,
    http: reqwest::Client,
    keys: RwLock<HashMap<String, DecodingKey>>,
    last_refresh: RwLock<Instant>,
}

/// Fetches and caches Supabase Auth's JWKS
#[derive(Clone)]
pub struct JwksVerifier(Arc<Inner>);

impl JwksVerifier {
    /// Builds a verifier for the given Supabase URL
    pub async fn new(base_url: &str) -> Self {
        let issuer = base_url.trim_end_matches('/').to_string();
        let jwks_url = format!("{}/.well-known/jwks.json", issuer);
        let mut validation = Validation::new(Algorithm::ES256);
        validation.set_issuer(&[issuer.as_str()]);
        validation.set_audience(&["authenticated"]);
        let verifier = Self(Arc::new(Inner {
            jwks_url,
            validation,
            http: reqwest::Client::builder()
                .timeout(JWKS_FETCH_TIMEOUT)
                .build()
                .expect("failed to build Supabase Auth HTTP client"),
            keys: RwLock::new(HashMap::new()),
            last_refresh: RwLock::new(Instant::now()),
        }));
        verifier
            .refresh()
            .await
            .expect("failed to fetch Supabase Auth JWKS at startup");
        verifier
    }

    async fn refresh(&self) -> Result<(), reqwest::Error> {
        *self.0.last_refresh.write().await = Instant::now();
        let jwk_set: JwkSet = self
            .0
            .http
            .get(&self.0.jwks_url)
            .send()
            .await?
            .json()
            .await?;
        let mut keys = HashMap::new();
        for jwk in &jwk_set.keys {
            let (Some(kid), Ok(decoding_key)) =
                (jwk.common.key_id.clone(), DecodingKey::from_jwk(jwk))
            else {
                continue;
            };
            keys.insert(kid, decoding_key);
        }
        *self.0.keys.write().await = keys;
        Ok(())
    }

    async fn verify(&self, token: &str) -> Result<SupabaseAuthClaims, AppError> {
        let unauthorized = || AppError::Unauthorized("Not authenticated".to_string());
        let header = decode_header(token).map_err(|_| unauthorized())?;
        let kid = header.kid.ok_or_else(unauthorized)?;

        {
            let keys = self.0.keys.read().await;
            if let Some(decoding_key) = keys.get(&kid) {
                return decode::<SupabaseAuthClaims>(token, decoding_key, &self.0.validation)
                    .map(|data| data.claims)
                    .map_err(|_| unauthorized());
            }
        }

        let should_refresh =
            self.0.last_refresh.read().await.elapsed() >= JWKS_REFRESH_MIN_INTERVAL;
        if should_refresh {
            let _ = self.refresh().await;
        }

        let keys = self.0.keys.read().await;
        let decoding_key = keys.get(&kid).ok_or_else(unauthorized)?;
        decode::<SupabaseAuthClaims>(token, decoding_key, &self.0.validation)
            .map(|data| data.claims)
            .map_err(|_| unauthorized())
    }
}

/// Middleware verifying every request's `Authorization: Bearer <token>` against Supabase Auth's JWKS
pub async fn supabase_auth_middleware(
    State(verifier): State<JwksVerifier>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or_else(|| AppError::Unauthorized("Not authenticated".to_string()))?
        .to_string();

    let claims = verifier.verify(&token).await?;
    request.extensions_mut().insert(claims);
    Ok(next.run(request).await)
}

pub struct CurrentUserId(pub String);

impl<S> FromRequestParts<S> for CurrentUserId
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Extension(claims) = Extension::<SupabaseAuthClaims>::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Unauthorized("Not authenticated".to_string()))?;
        Ok(CurrentUserId(claims.sub))
    }
}

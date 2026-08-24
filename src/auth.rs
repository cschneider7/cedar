use std::{collections::HashMap, sync::Arc};

use axum::{
    extract::{Extension, FromRequestParts, Request, State},
    http::{header::AUTHORIZATION, request::Parts},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use tokio::sync::RwLock;

use crate::error::AppError;

/// The Neon Auth user id (`sub` claim) of a verified JWT. `jsonwebtoken`
/// validates `exp`/`iss`/`aud` against the raw token payload independently
/// of this struct's shape, so only the field the app actually needs is kept
/// here.
#[derive(serde::Deserialize, Clone)]
pub struct NeonAuthClaims {
    pub sub: String,
}

struct Inner {
    jwks_url: String,
    issuer: String,
    http: reqwest::Client,
    keys: RwLock<HashMap<String, DecodingKey>>,
}

/// Fetches and caches Neon Auth's JWKS, verifying request bearer tokens
/// against it. Refreshes on an unknown `kid` (e.g. after a Neon-side key
/// rotation) rather than only once at startup, so a rotation recovers
/// instead of failing closed forever.
#[derive(Clone)]
pub struct JwksVerifier(Arc<Inner>);

impl JwksVerifier {
    /// Builds a verifier for the given Neon Auth base URL, doing an initial
    /// JWKS fetch synchronously so a misconfigured/unreachable auth server
    /// fails the boot instead of silently accepting every request later.
    pub async fn new(base_url: &str) -> Self {
        let issuer = origin_of(base_url);
        let jwks_url = format!("{}/.well-known/jwks.json", base_url.trim_end_matches('/'));
        let verifier = Self(Arc::new(Inner {
            jwks_url,
            issuer,
            http: reqwest::Client::new(),
            keys: RwLock::new(HashMap::new()),
        }));
        verifier
            .refresh()
            .await
            .expect("failed to fetch Neon Auth JWKS at startup");
        verifier
    }

    async fn refresh(&self) -> Result<(), reqwest::Error> {
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

    async fn verify(&self, token: &str) -> Result<NeonAuthClaims, AppError> {
        let unauthorized = || AppError::Unauthorized("Not authenticated".to_string());
        let header = decode_header(token).map_err(|_| unauthorized())?;
        let kid = header.kid.ok_or_else(unauthorized)?;

        let mut decoding_key = self.0.keys.read().await.get(&kid).cloned();
        if decoding_key.is_none() {
            // Unknown kid: refresh once (covers a key rotation since our
            // last fetch) before giving up. A refresh failure here still
            // fails closed via the `ok_or_else` below.
            let _ = self.refresh().await;
            decoding_key = self.0.keys.read().await.get(&kid).cloned();
        }
        let decoding_key = decoding_key.ok_or_else(unauthorized)?;

        let mut validation = Validation::new(Algorithm::EdDSA);
        validation.set_issuer(&[self.0.issuer.as_str()]);
        validation.set_audience(&[self.0.issuer.as_str()]);

        decode::<NeonAuthClaims>(token, &decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|_| unauthorized())
    }
}

/// `scheme://host[:port]` of a Neon Auth base URL. Neon Auth JWTs' `iss`/
/// `aud` claims are this origin, not the full base URL (which also carries
/// a `/<db>/auth` path component).
fn origin_of(base_url: &str) -> String {
    let (scheme, rest) = base_url.split_once("://").unwrap_or(("https", base_url));
    let host_and_port = rest.split('/').next().unwrap_or(rest);
    format!("{scheme}://{host_and_port}")
}

/// Middleware verifying every request's `Authorization: Bearer <token>`
/// against Neon Auth's JWKS and attaching `NeonAuthClaims` as a request
/// extension on success. Fails closed (401) on a missing/invalid header, an
/// unverifiable token, or a JWKS lookup failure — never lets a request
/// through unauthenticated.
pub async fn neon_auth_middleware(
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

/// Extracts the Neon Auth user id (`sub` claim) that `neon_auth_middleware`
/// verified and attached to the request as a `NeonAuthClaims` extension.
pub struct CurrentUserId(pub String);

impl<S> FromRequestParts<S> for CurrentUserId
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Extension(claims) = Extension::<NeonAuthClaims>::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Unauthorized("Not authenticated".to_string()))?;
        Ok(CurrentUserId(claims.sub))
    }
}

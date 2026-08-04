use axum::{
    extract::{Extension, FromRequestParts},
    http::{StatusCode, request::Parts},
};
use clerk_rs::{
    ClerkConfiguration,
    clerk::Clerk,
    validators::{authorizer::ClerkJwt, axum::ClerkLayer, jwks::MemoryCacheJwksProvider},
};

/// Builds the tower `Layer` that verifies every request's `Authorization:
/// Bearer <token>` against Clerk's JWKS and inserts a `ClerkJwt` extension on
/// success. `routes: None` protects every route the layer is applied to —
/// there are no public backend-owned routes left now that auth lives in
/// Clerk. `validate_session_cookie: false` keeps this strictly Bearer-token
/// based (no `__session` cookie fallback), since the frontend and backend
/// live on different origins.
pub fn clerk_layer(secret_key: &str) -> ClerkLayer<MemoryCacheJwksProvider> {
    let config = ClerkConfiguration::new(None, None, Some(secret_key.to_string()), None);
    let jwks_provider = MemoryCacheJwksProvider::new(Clerk::new(config));
    ClerkLayer::new(jwks_provider, None, false)
}

/// Extracts the Clerk user id (`sub` claim) that `ClerkLayer` verified and
/// attached to the request as a `ClerkJwt` extension.
pub struct CurrentUserId(pub String);

impl<S> FromRequestParts<S> for CurrentUserId
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, &'static str);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Extension(jwt) = Extension::<ClerkJwt>::from_request_parts(parts, state)
            .await
            .map_err(|_| (StatusCode::UNAUTHORIZED, "Not authenticated"))?;
        Ok(CurrentUserId(jwt.sub))
    }
}

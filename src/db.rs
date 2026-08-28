//! Postgres connection pool wiring.
//!
//! Handlers talk to Postgres directly through `tokio_postgres`'s `query_typed`
//! / `query_typed_opt` / `execute_typed`.

use std::sync::Arc;

use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{CryptoProvider, verify_tls12_signature, verify_tls13_signature};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{DigitallySignedStruct, SignatureScheme};

/// The application's connection pool.
pub type Db = Pool;

/// Query-string params `tokio_postgres::Config` understands. Anything else
/// (e.g. Supabase's `supa=base-pooler.x`) makes `Config::from_str` error, so
/// it's stripped before parsing.
const KNOWN_PARAMS: &[&str] = &[
    "sslmode",
    "sslnegotiation",
    "application_name",
    "connect_timeout",
    "options",
    "channel_binding",
    "target_session_attrs",
    "keepalives",
    "keepalives_idle",
];

/// Connects a pool for `db_url`, capped at `max_size` connections.
pub async fn build_pool(
    db_url: &str,
    max_size: usize,
) -> Result<Db, Box<dyn std::error::Error + Send + Sync>> {
    let manager = Manager::from_config(
        parse_config(db_url)?,
        make_tls(),
        ManagerConfig {
            recycling_method: RecyclingMethod::Fast,
        },
    );
    Ok(Pool::builder(manager).max_size(max_size).build()?)
}

/// Drops unknown query params, touching only the `?...` portion so a password
/// with URL-special characters is left for `tokio_postgres` to decode itself.
fn parse_config(
    db_url: &str,
) -> Result<tokio_postgres::Config, Box<dyn std::error::Error + Send + Sync>> {
    let (base, query) = db_url
        .split_once('?')
        .map_or((db_url, None), |(b, q)| (b, Some(q)));
    let kept = query
        .into_iter()
        .flat_map(|q| q.split('&'))
        .filter(|pair| KNOWN_PARAMS.contains(&pair.split('=').next().unwrap_or_default()))
        .collect::<Vec<_>>()
        .join("&");

    let cleaned = if kept.is_empty() {
        base.to_string()
    } else {
        format!("{base}?{kept}")
    };
    Ok(cleaned.parse::<tokio_postgres::Config>()?)
}

/// TLS that encrypts the connection but does not authenticate the server
/// certificate — i.e. libpq's `sslmode=require` semantics, which is what the
/// previous `sqlx` setup used. `tokio-postgres-rustls` only offers full
/// verification or none; it has no `require`-equivalent middle mode. Supabase's
/// Supavisor pooler presents a cert signed by a private CA that is in no public
/// root store, so full verification (`verify-ca`/`verify-full`) is not an option
/// against it regardless. `sslmode` from the URL still gates whether TLS is used
/// at all (`disable` → plaintext, the local-dev default `prefer` → opportunistic).
fn make_tls() -> tokio_postgres_rustls::MakeRustlsConnect {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = rustls::ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .expect("rustls: ring provider supports TLS 1.2 and 1.3")
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(EncryptOnlyVerifier(provider)))
        .with_no_client_auth();
    tokio_postgres_rustls::MakeRustlsConnect::new(config)
}

/// Accepts any server certificate; the TLS handshake still negotiates
/// encryption. See `make_tls` for why this is the behavior we want here.
#[derive(Debug)]
struct EncryptOnlyVerifier(Arc<CryptoProvider>);

impl ServerCertVerifier for EncryptOnlyVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls12_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls13_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.0.signature_verification_algorithms.supported_schemes()
    }
}

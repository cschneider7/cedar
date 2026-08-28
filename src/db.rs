//! Postgres connection pool wiring.
//!
//! Handlers talk to Postgres directly through `tokio_postgres`'s `query_typed`
//! / `query_typed_opt` / `execute_typed`.

use std::sync::Arc;

use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use rustls::pki_types::{CertificateDer, pem::PemObject};
use tokio_postgres::config::SslMode;

/// The application's connection pool.
pub type Db = Pool;

/// The `Supabase Root 2021 CA` (self-signed, valid to 2031)
const SUPABASE_CA_PEM: &[u8] = include_bytes!("../certs/supabase-ca-2021.pem");

/// Query-string params `tokio_postgres::Config` understands
const KNOWN_PARAMS: &[&str] = &[
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
    let mut config = parse_config(db_url)?;
    config.ssl_mode(ssl_mode_from(sslmode_param(db_url).as_deref()));

    let manager = Manager::from_config(
        config,
        make_tls()?,
        ManagerConfig {
            recycling_method: RecyclingMethod::Fast,
        },
    );
    Ok(Pool::builder(manager).max_size(max_size).build()?)
}

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

/// The raw `sslmode` value from the URL query string, lowercased.
fn sslmode_param(db_url: &str) -> Option<String> {
    db_url
        .split_once('?')?
        .1
        .split('&')
        .find_map(|pair| pair.strip_prefix("sslmode="))
        .map(str::to_ascii_lowercase)
}

fn ssl_mode_from(sslmode: Option<&str>) -> SslMode {
    match sslmode {
        Some("disable") => SslMode::Disable,
        Some("allow" | "prefer") => SslMode::Prefer,
        _ => SslMode::Require,
    }
}

/// rustls connector trusting only Supabase's private root
fn make_tls()
-> Result<tokio_postgres_rustls::MakeRustlsConnect, Box<dyn std::error::Error + Send + Sync>> {
    let mut roots = rustls::RootCertStore::empty();
    for cert in CertificateDer::pem_slice_iter(SUPABASE_CA_PEM) {
        roots.add(cert?)?;
    }

    let config = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()?
    .with_root_certificates(roots)
    .with_no_client_auth();

    Ok(tokio_postgres_rustls::MakeRustlsConnect::new(config))
}

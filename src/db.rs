//! Postgres connection pool wiring.
//!
//! Handlers talk to Postgres directly through `tokio_postgres`'s `query_typed`
//! / `query_typed_opt` / `execute_typed`.

use std::sync::Arc;

use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use rustls::pki_types::{CertificateDer, pem::PemObject};

/// The application's connection pool.
pub type Db = Pool;

/// Supabase's Supavisor pooler serves a cert chained to this private root
/// (`Supabase Root 2021 CA`), which is in no public root store — so it's pinned
/// here. Published at
/// <https://supabase-downloads.s3.amazonaws.com/prod/ssl/prod-ca-2021.crt>.
const SUPABASE_ROOT_CA_PEM: &[u8] = include_bytes!("supabase_prod_ca_2021.pem");

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
        make_tls()?,
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

/// rustls connector trusting the public web roots plus Supabase's pinned root,
/// with the ring provider (explicit — no reliance on a process-default) and
/// full chain + hostname verification.
fn make_tls()
-> Result<tokio_postgres_rustls::MakeRustlsConnect, Box<dyn std::error::Error + Send + Sync>> {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    for cert in CertificateDer::pem_slice_iter(SUPABASE_ROOT_CA_PEM) {
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

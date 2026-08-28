//! Postgres connection pool wiring.
//!
//! Handlers talk to Postgres directly through `tokio_postgres`'s `query_typed`
//! / `query_typed_opt` / `execute_typed`.

use std::sync::Once;

use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};

/// The application's connection pool.
pub type Db = Pool;

/// Connects a pool for `db_url`, capped at `max_size` connections.
pub async fn build_pool(
    db_url: &str,
    max_size: usize,
) -> Result<Db, Box<dyn std::error::Error + Send + Sync>> {
    install_crypto_provider();

    let pg_config = parse_config(db_url)?;
    let manager = Manager::from_config(
        pg_config,
        make_tls(),
        ManagerConfig {
            recycling_method: RecyclingMethod::Fast,
        },
    );
    let pool = Pool::builder(manager).max_size(max_size).build()?;
    Ok(pool)
}

fn parse_config(
    db_url: &str,
) -> Result<tokio_postgres::Config, Box<dyn std::error::Error + Send + Sync>> {
    const KNOWN: &[&str] = &[
        "sslmode",
        "application_name",
        "connect_timeout",
        "options",
        "channel_binding",
        "target_session_attrs",
        "keepalives",
        "keepalives_idle",
    ];

    let mut url = url::Url::parse(db_url)?;
    let kept: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, _)| KNOWN.contains(&key.as_ref()))
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    url.set_query(None);
    for (key, value) in &kept {
        url.query_pairs_mut().append_pair(key, value);
    }

    Ok(url.as_str().parse::<tokio_postgres::Config>()?)
}

fn make_tls() -> tokio_postgres_rustls::MakeRustlsConnect {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = rustls::ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    tokio_postgres_rustls::MakeRustlsConnect::new(config)
}

fn install_crypto_provider() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    });
}

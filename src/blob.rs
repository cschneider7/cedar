use std::{future::Future, pin::Pin};

use tracing::warn;

/// Vercel Blob's API version this client speaks, mirrored from the official
/// `@vercel/blob` SDK's `BLOB_API_VERSION` constant. There's no Rust SDK, so
/// the delete-by-URL REST contract below is hand-implemented against
/// `vercel/storage`'s `packages/blob/src/api.ts`/`del.ts` (checked 2026-08) —
/// bump this if Vercel's Blob API version changes.
const BLOB_API_VERSION: &str = "12";
const BLOB_API_BASE_URL: &str = "https://vercel.com/api/blob";

/// Deletes a blob at the given URL, best-effort. Implementations must never
/// propagate a failure to the caller — handlers treat blob cleanup as
/// fire-and-forget: correctness of the Postgres row matters more than
/// storage tidiness, so implementations log and swallow errors internally.
pub trait BlobDeleter: Send + Sync {
    fn delete(&self, url: String) -> Pin<Box<dyn Future<Output = ()> + Send>>;
}

/// Calls Vercel Blob's authenticated REST delete endpoint directly.
pub struct VercelBlobDeleter {
    token: String,
    client: reqwest::Client,
}

impl VercelBlobDeleter {
    pub fn new(token: String) -> Self {
        Self {
            token,
            client: reqwest::Client::new(),
        }
    }

    /// A `BLOB_READ_WRITE_TOKEN` is shaped `vercel_blob_rw_<storeId>_<secret>`;
    /// the store id must also be sent as its own header.
    fn store_id(&self) -> &str {
        self.token.split('_').nth(3).unwrap_or_default()
    }
}

impl BlobDeleter for VercelBlobDeleter {
    fn delete(&self, url: String) -> Pin<Box<dyn Future<Output = ()> + Send>> {
        let token = self.token.clone();
        let store_id = self.store_id().to_string();
        let client = self.client.clone();
        Box::pin(async move {
            let result = client
                .post(format!("{BLOB_API_BASE_URL}/delete"))
                .bearer_auth(&token)
                .header("x-api-version", BLOB_API_VERSION)
                .header("x-vercel-blob-store-id", store_id)
                .json(&serde_json::json!({ "urls": [&url] }))
                .send()
                .await;

            match result {
                Ok(response) if !response.status().is_success() => {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    warn!(%url, %status, %body, "failed to delete blob");
                }
                Err(err) => {
                    warn!(%url, %err, "failed to delete blob");
                }
                _ => {}
            }
        })
    }
}

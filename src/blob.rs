use std::{future::Future, pin::Pin};

use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use tracing::warn;

/// Deletes an object at the given key, best-effort. Implementations must
/// never propagate a failure to the caller — handlers treat object cleanup
/// as fire-and-forget: correctness of the Postgres row matters more than
/// storage tidiness, so implementations log and swallow errors internally.
pub trait BlobDeleter: Send + Sync {
    fn delete(&self, key: String) -> Pin<Box<dyn Future<Output = ()> + Send>>;
}

/// Deletes objects from an S3-compatible bucket (MinIO locally, Cloudflare
/// R2 in Preview/Production) via `aws-sdk-s3`.
pub struct S3BlobDeleter {
    client: aws_sdk_s3::Client,
    bucket: String,
}

impl S3BlobDeleter {
    pub fn new(
        endpoint: &str,
        region: &str,
        bucket: String,
        access_key_id: &str,
        secret_access_key: &str,
    ) -> Self {
        let credentials = Credentials::new(access_key_id, secret_access_key, None, None, "static");
        let config = aws_sdk_s3::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new(region.to_string()))
            .endpoint_url(endpoint)
            .credentials_provider(credentials)
            .force_path_style(true)
            .build();

        Self {
            client: aws_sdk_s3::Client::from_conf(config),
            bucket,
        }
    }
}

impl BlobDeleter for S3BlobDeleter {
    fn delete(&self, key: String) -> Pin<Box<dyn Future<Output = ()> + Send>> {
        let client = self.client.clone();
        let bucket = self.bucket.clone();
        Box::pin(async move {
            let result = client
                .delete_object()
                .bucket(&bucket)
                .key(&key)
                .send()
                .await;

            if let Err(err) = result {
                warn!(%key, %bucket, %err, "failed to delete object");
            }
        })
    }
}

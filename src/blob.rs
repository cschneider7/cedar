use std::{future::Future, pin::Pin, time::Duration};

use aws_sdk_s3::{
    config::{BehaviorVersion, Credentials, Region},
    presigning::PresigningConfig,
};
use tracing::warn;

/// Deletes an object at the given key
pub trait BlobDeleter: Send + Sync {
    fn delete(&self, key: String) -> Pin<Box<dyn Future<Output = ()> + Send>>;
}

/// A fetched blob's bytes plus the `content-type` S3 stored it with, if any.
pub struct BlobObject {
    pub bytes: Vec<u8>,
    pub content_type: Option<String>,
}

/// Fetches an object at the given key
pub trait BlobReader: Send + Sync {
    fn get(&self, key: String) -> Pin<Box<dyn Future<Output = Option<BlobObject>> + Send>>;
}

/// Presigns a browser-uploadable PUT URL for the given key
pub trait BlobUploader: Send + Sync {
    fn presign_put(
        &self,
        key: String,
        content_type: String,
        content_length: i64,
    ) -> Pin<Box<dyn Future<Output = Option<String>> + Send>>;
}

/// Builds an S3-compatible client
fn build_s3_client(
    endpoint: &str,
    region: &str,
    access_key_id: &str,
    secret_access_key: &str,
) -> aws_sdk_s3::Client {
    let credentials = Credentials::new(access_key_id, secret_access_key, None, None, "static");
    let config = aws_sdk_s3::Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new(region.to_string()))
        .endpoint_url(endpoint)
        .credentials_provider(credentials)
        .force_path_style(true)
        .build();

    aws_sdk_s3::Client::from_conf(config)
}

/// Deletes/fetches objects from an S3-compatible bucket via `aws-sdk-s3`.
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
        Self {
            client: build_s3_client(endpoint, region, access_key_id, secret_access_key),
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

impl BlobReader for S3BlobDeleter {
    fn get(&self, key: String) -> Pin<Box<dyn Future<Output = Option<BlobObject>> + Send>> {
        let client = self.client.clone();
        let bucket = self.bucket.clone();
        Box::pin(async move {
            let output = client.get_object().bucket(&bucket).key(&key).send().await;
            let output = match output {
                Ok(output) => output,
                Err(err) => {
                    warn!(%key, %bucket, %err, "failed to fetch object");
                    return None;
                }
            };
            let content_type = output.content_type.clone();
            let bytes = output.body.collect().await.ok()?.into_bytes().to_vec();
            Some(BlobObject {
                bytes,
                content_type,
            })
        })
    }
}

const PRESIGNED_URL_EXPIRES_IN: Duration = Duration::from_secs(300);

impl BlobUploader for S3BlobDeleter {
    fn presign_put(
        &self,
        key: String,
        content_type: String,
        content_length: i64,
    ) -> Pin<Box<dyn Future<Output = Option<String>> + Send>> {
        let client = self.client.clone();
        let bucket = self.bucket.clone();
        Box::pin(async move {
            let presigning_config = PresigningConfig::expires_in(PRESIGNED_URL_EXPIRES_IN).ok()?;
            let presigned = client
                .put_object()
                .bucket(&bucket)
                .key(&key)
                .content_type(&content_type)
                .content_length(content_length)
                .presigned(presigning_config)
                .await;
            match presigned {
                Ok(presigned) => Some(presigned.uri().to_string()),
                Err(err) => {
                    warn!(%key, %bucket, %err, "failed to presign upload URL");
                    None
                }
            }
        })
    }
}

use std::future::Future;
use std::pin::Pin;

/// Sends transactional email. The only implementation today is
/// `LoggingMailer`, a dev-mode stub — a real provider can be swapped in later
/// without handler code changes. Manually boxes its `Future` (rather than
/// using `async fn`) so the trait stays object-safe for `Box<dyn Mailer>`.
pub trait Mailer: Send + Sync {
    fn send<'a>(
        &'a self,
        to: &'a str,
        subject: &'a str,
        body: &'a str,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>>;
}

/// Logs the email instead of sending it, so verification/reset links are
/// exercisable locally and in tests by reading the token straight out of the
/// `verification_tokens` table rather than an inbox.
pub struct LoggingMailer;

impl Mailer for LoggingMailer {
    fn send<'a>(
        &'a self,
        to: &'a str,
        subject: &'a str,
        body: &'a str,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            tracing::info!(%to, %subject, %body, "sending email (dev-mode stub, not actually sent)");
        })
    }
}

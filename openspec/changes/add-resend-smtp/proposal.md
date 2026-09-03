## Why

Supabase Auth currently sends confirmation, password-reset, and email-change
messages through Supabase's shared built-in email relay, which is rate-limited to
a handful of messages per hour, sends from a generic `noreply@mail.app.supabase.io`
address, and is explicitly "not for production" per Supabase. The
`ready-for-production-checklist` change (task 5.1, and the `account-security`
spec's "production email sender" requirement) depends on real transactional
email being in place before email confirmation can be turned on — an unverified
user with no delivered link is locked out. This change stands up that sender:
**Resend** as the project's SMTP provider, sending from a domain the project
owns.

Cedar has no custom domain today (it runs at `cedarcharts.vercel.app`, and
`.vercel.app` cannot be domain-verified for email). Acquiring a domain and
configuring its DNS is therefore a prerequisite step folded into this change.

## What Changes

- **Register a domain through Vercel and use Vercel DNS.** A domain the project
  controls (referred to here as `cedarchart.com`), registered via Vercel so its DNS is
  managed in the same dashboard as the deployment. Pointing
  `cedarcharts.vercel.app` at the domain / serving the app from it is **out of
  scope** (see `ready-for-production-checklist` non-goals); this change only
  needs the domain for email.
- **Create a standalone Resend account** and verify a sending subdomain
  (`send.cedarchart.com`) by adding Resend's SPF (`MX` + `TXT`), DKIM (`TXT`), and a
  DMARC (`TXT`) record to Vercel DNS.
- **Point Supabase Auth at Resend over SMTP.** Set the custom SMTP host
  (`smtp.resend.com`), port, username (`resend`), and password (a Resend API key
  stored as a Supabase secret), plus the sender address
  (`no-reply@send.cedarchart.com`) and sender name, in the Supabase dashboard. Mirror
  the same block, commented, in `supabase/config.toml` for documentation; local
  development keeps using the built-in Inbucket/Mailpit catcher (no Resend
  traffic from dev).
- **Raise Supabase Auth's email rate limits** off the built-in-relay defaults now
  that a real provider is behind them (e.g. the per-hour email cap, and
  `max_frequency` for resends).
- **Brand the auth email templates.** Custom subjects and HTML for the confirm-
  signup, password-reset (recovery), email-change, and magic-link / OTP flow
  templates, plus the `password_changed` and `email_changed` security-notification
  templates — checked into `supabase/templates/*.html`, referenced from
  `config.toml`, and pasted into the dashboard template editor for the live
  project. Templates use Supabase's Go template variables and a plain,
  accessible, single-column layout with the Cedar wordmark and tree logo (the
  logo is a small PNG served from the app's own domain).
- **Verify end to end:** a password-reset and a fresh-signup confirmation email
  each land in a real external inbox (Gmail), render correctly, pass SPF/DKIM
  alignment, and their links complete the flow.

## Capabilities

### New Capabilities

- `transactional-email`: Outbound account email from Supabase Auth (signup
  confirmation, password reset, email-change confirmation, magic-link/OTP, and the
  password-changed / email-changed security notifications) is delivered through a
  production transactional email provider authenticated for a domain the project
  owns — with SPF, DKIM, and DMARC aligned, project-branded templates carrying the
  logo, and sender rate limits set for production rather than the development
  relay's defaults.

### Modified Capabilities

<!-- None. `account-security` (from ready-for-production-checklist, not yet
archived) already carries a high-level "production email sender" clause that this
capability fulfils and refines; no existing requirement's behavior changes. -->

## Impact

- **New dependency (external service):** a Resend account (free tier: 3k
  emails/mo, 100/day — well within Cedar's footprint) and a domain registered
  through Vercel with a recurring registration cost.
- **DNS:** ~4-5 records on `send.cedarchart.com` in Vercel DNS (SPF `MX`+`TXT`, DKIM
  `TXT`, DMARC `TXT`).
- **Supabase project config:** Authentication → Emails → SMTP settings; the
  Auth rate-limit settings; the six email templates in the template editor. One
  new secret (the Resend API key) via `supabase secrets` / dashboard.
- **Repo:** `supabase/config.toml` (`[auth.email.smtp]` +
  `[auth.email.template.*]` + `[auth.email.notification.*]` blocks, documented),
  new `supabase/templates/{confirmation,recovery,email_change,magic_link,
password_changed,email_changed}.html`, new `public/email/cedar-mark.png` (the
  logo, served at `cedarchart.com/email/cedar-mark.png`), `CLAUDE.md`
  (Auth section note that email goes through Resend in Preview/Production and
  Inbucket locally). No application code (`app/`, `src/`) changes.
- **Depends on / unblocks:** unblocks `ready-for-production-checklist` task 5.3
  (enable email confirmations) and de-risks task 5.1. Ships as two small PRs
  (both deployed) to publish `public/email/cedar-mark.png` and settle its URL;
  otherwise this is console + repo-config work with no `app/` or `src/` change.
- **Tests:** none automated — email delivery is verified live during rollout, the
  same pattern the checklist change uses for infra steps.

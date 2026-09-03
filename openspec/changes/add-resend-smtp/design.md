## Context

See proposal.md — Why. Supabase Auth email currently goes through Supabase's
shared development relay (~2–4 messages/hour, generic `supabase.io` sender,
"not for production"). `ready-for-production-checklist` needs real email before
it can enable signup confirmation (task 5.3) without locking users out.

Constraints that shape the approach:

- **One Supabase project** (`Cedar` / `agnnihedsecipkgosizc`), hosted (not
  self-hosted). Its Auth email settings live in the dashboard; `config.toml`
  drives only the local CLI stack. Hosted projects do **not** pick up
  `config.toml` email templates automatically.
- **Local dev / CI / e2e** use the Supabase CLI's built-in Inbucket/Mailpit mail
  catcher (`supabase status` shows the inbox URL). No real email is sent from
  dev, and the e2e suite relies on reading messages out of the catcher.
- **No custom domain exists.** The app runs at `cedarcharts.vercel.app`;
  `.vercel.app` cannot be verified for email sending. The domain will be
  registered through Vercel and its DNS managed in Vercel DNS.
- Supabase Auth has **native custom-SMTP support** — host/port/user/pass/sender
  fields, no code. It also supports a `send-email` auth hook (call an HTTP
  endpoint instead), which requires hosting a function.
- `supabase/config.toml` `[auth.rate_limit].email_sent` defaults to `2`/hour and
  is gated on `auth.email.smtp` being enabled.

## Goals / Non-Goals

**Goals:**

- Real, domain-authenticated delivery of every Auth email type to arbitrary
  external inboxes, with SPF/DKIM/DMARC aligned.
- Project-branded subjects and HTML for those emails, version-controlled.
- Auth email rate limits appropriate for production signup/reset volume.
- Rollback is a single dashboard toggle.
- Zero application code change; no deployed function.

**Non-Goals:**

- Any frontend `site_url` / redirect-URL change, or making `cedarchart.com` the
  canonical app URL (out of scope per the checklist non-goals). `site_url` and
  auth redirect URLs keep pointing at the Vercel host. Note: registering the
  domain through Vercel attached the apex to the `cedar` project, so
  `cedarchart.com` already serves the app read-only alongside
  `cedarcharts.vercel.app` — this change only relies on that for the logo asset
  (`/email/cedar-mark.png`); a deliberate cutover is a separate decision.
- Marketing / broadcast email, a contact form, inbound email, or a
  `send-email` auth hook.
- Automated tests for delivery (verified live, matching the checklist's infra
  steps).
- Tightening DMARC to `quarantine`/`reject` (starts at `p=none`; tighten later).

## Decisions

### D1. Resend as the provider

Chosen by the owner. Over the alternatives: **Amazon SES** needs an AWS account
and a support request to leave the sandbox, and its own bounce/complaint
handling; **SendGrid**'s free tier and deliverability have degraded and it now
requires a paid plan for a dedicated domain in practice. Resend has a
zero-to-sending path in minutes, a free tier (3,000/month, 100/day — Cedar's
footprint is a handful/month), copy-paste DNS records that drop straight into
Vercel DNS, and Supabase documents it as a custom-SMTP option. The free tier permits one verified
custom domain, which is all this needs.

### D2. Standalone Resend account, not the Vercel Marketplace integration

The consumer of these credentials is **Supabase Auth**, which reads SMTP settings
from its own dashboard / project secrets. The Vercel Marketplace Resend
integration provisions an account and injects `RESEND_API_KEY` into Vercel's
environment — which nothing in this change reads (no `app/` or `src/` code
touches email). Going through the Marketplace would add a second place the
account is managed for no benefit. Sign up at resend.com directly.

### D3. SMTP transport, not the `send-email` auth hook

Custom SMTP is a pure configuration change in the Supabase dashboard. The
`send-email` hook would let us call Resend's HTTP API (slightly better
observability, retry control) but requires writing and deploying an edge function
and keeping it healthy — a new failure mode and moving part for a project that
otherwise has no serverless email code. Not worth it at this scale.

### D4. Send from a dedicated subdomain `send.cedarchart.com`

Resend (and email best practice) recommends isolating transactional mail on a
subdomain so the root domain's sending reputation and DMARC posture are
independent. Verify `send.cedarchart.com` in Resend; sender address
`no-reply@send.cedarchart.com`. The root domain needs no email records from this
change.

### D5. DMARC starts at `p=none` with aggregate reporting

Publish `_dmarc.send.cedarchart.com` as `v=DMARC1; p=none; rua=mailto:<report address>`.
`p=none` means recipients report on but never drop failing mail, so a
misconfigured SPF/DKIM during rollout degrades to "lands in spam", not "silently
discarded". Tighten to `p=quarantine` once reports show clean alignment (tracked
as an open question, not a task here).

### D6. Local dev keeps the built-in mail catcher

Do **not** set `enabled = true` under `[auth.email.smtp]` in `config.toml`. Doing
so would route local-stack and e2e auth email through Resend — sending real
messages from test runs and burning the daily quota. The `[auth.email.smtp]`
block is added **commented**, as documentation of the production values, with
`pass = "env(RESEND_API_KEY)"`. The e2e suite's dependence on the Inbucket
catcher is unaffected.

### D7. Templates: files in the repo are canonical; the dashboard is applied by hand

Hosted Supabase reads templates from the **dashboard template editor**, not
`config.toml`. So: author the templates as
`supabase/templates/{confirmation,recovery,email_change,magic_link,password_changed,email_changed}.html`,
reference them from `config.toml` (`[auth.email.template.*]`) so local dev renders
them, and **paste the same HTML into the dashboard** for the live project. They
must be kept in sync by hand — the same manual-sync situation CLAUDE.md already
describes for frontend/backend types. A short note goes in CLAUDE.md's Auth
section.

Templates use Supabase's Go template variables (`{{ .ConfirmationURL }}`,
`{{ .SiteURL }}`, `{{ .Email }}`, plus `{{ .NewEmail }}` / `{{ .OldEmail }}` in
the change / changed templates) and a minimal single-column layout — inline
styles only, dark-mode-safe colors, real text links.

**Logo:** one small PNG (`public/email/cedar-mark.png`, generated from
`public/favicon.svg`) referenced by absolute URL
`https://cedarchart.com/email/cedar-mark.png` (the branded apex, which Vercel
already serves the project on — a `.vercel.app` URL in transactional mail reads
as less trustworthy). This is the one deliberate exception to "no external
assets": a CSS-drawn mark can't reproduce the
overlapping-circle tree (Gmail strips `position`, negative margins, and floats,
and an earlier CSS attempt rendered as a clover), `data:` URI images are blocked
by Gmail, and inline `<svg>` is stripped. The image is first-party (same project
as the auth links), version-controlled, and deploys with the app. Ordering
consequence: the dashboard templates must not go live until the PR that adds the
PNG has deployed to production, or the logo 404s in mail sent in between.

**Notification templates:** `password_changed` and `email_changed` are
after-the-fact security notices (no CTA button beyond a "reset password" nudge).
They are enabled via `[auth.email.notification.*].enabled = true` in
`config.toml` and the project-level toggle in the dashboard.

### D8. Domain registered through Vercel, DNS in Vercel DNS

The domain is registered via Vercel (`vercel domains buy cedarchart.com`, or the
dashboard), which puts it on Vercel DNS automatically — no nameserver delegation
step, and records are managed in the same dashboard / CLI as the deployment.
Vercel DNS has no proxy layer, so every Resend record (`MX`, `TXT`, DKIM `TXT`)
goes in as a plain record with nothing extra to configure. Turnstile stays on
Cloudflare but contributes no DNS — only a captcha secret pasted into Supabase —
so there is no second DNS provider in play.

## Risks / Trade-offs

- **Misconfigured SMTP silently breaks all Auth email** (reset, confirm, change)
  → Mitigation: the very first verification step after saving SMTP is a
  password-reset to a real inbox; if it fails, toggling "Enable Custom SMTP" off
  in the dashboard instantly reverts to the built-in relay. Don't enable signup
  confirmation (checklist 5.3) until this change's verification passes.
- **DNS propagation / Resend not yet verified** → Mitigation: add all records,
  wait for Resend's dashboard to show the domain fully verified (it polls), and
  only then set the SMTP block in Supabase. Nothing is time-critical.
- **Recipient still spam-filters early mail** (cold sending domain) → Mitigation:
  `p=none` DMARC keeps it in the inbox-or-spam range, not dropped; low volume
  from a properly authenticated domain warms quickly; verification uses a Gmail
  account where the Spam folder is checked too.
- **Free-tier ceiling (100/day, 3,000/mo)** → Cedar sends single-digit
  emails/month today. If signups ever spike, Resend's paid tier is a card entry,
  no re-architecture. Note it, don't design for it.
- **Template variable typo produces a broken link** → Mitigation: every one of
  the flows is exercised end-to-end (click the link) before the change is
  considered done, locally against Inbucket first, then live.
- **Domain renewal lapses** → out-of-band operational concern; keep auto-renew on
  in Vercel. Recorded here so it isn't forgotten.

## Migration Plan

All steps are console + repo-config; there is no code deploy.

1. **Domain.** Register `cedarchart.com` through Vercel (dashboard → Domains, or
   `vercel domains buy cedarchart.com`). It lands on Vercel DNS automatically; confirm
   it shows active with Vercel nameservers.
2. **Resend account + domain.** Sign up at resend.com. Add domain `send.cedarchart.com`.
   Resend shows the required SPF (`MX` + `TXT`), DKIM (`TXT`), and (optional)
   DMARC records.
3. **Vercel DNS.** Add those records for `send.cedarchart.com` (dashboard → the domain
   → DNS Records, or `vercel dns add cedarchart.com <name> <type> <value>`). Add
   `_dmarc.send.cedarchart.com` `TXT` = `v=DMARC1; p=none; rua=mailto:<addr>`. Wait for
   Resend to report the domain verified.
4. **API key → secret.** Create a Resend API key scoped to sending. Store it as
   the Supabase project secret `RESEND_API_KEY` (dashboard → Project Settings →
   or `supabase secrets set`). Never commit it.
5. **Templates.** Write `supabase/templates/*.html`; wire `[auth.email.template.*]`
   in `config.toml`; `supabase start` / trigger each flow locally and read the
   result in Inbucket.
6. **Supabase SMTP.** Dashboard → Authentication → Emails → SMTP Settings: enable
   custom SMTP, host `smtp.resend.com`, port `465`, username `resend`, password =
   the API key, sender email `no-reply@send.cedarchart.com`, sender name. Save.
7. **Rate limits.** Dashboard → Authentication → Rate Limits: raise "emails per
   hour" to the production value (see open question). Mirror as
   `[auth.rate_limit].email_sent` in `config.toml`.
8. **Templates → dashboard.** Paste each of the six templates into the dashboard
   template editor (flow + notification tabs); enable the two notifications at the
   project level; save. Requires the PNG-adding PR to be deployed first.
9. **Verify.** From a real external (Gmail) account: request a password reset →
   email arrives, "Show original" shows `spf=pass dkim=pass dmarc=pass`, link
   resets the password. Create a new account → confirmation email arrives, link
   confirms, account signs in. Trigger an email-change and a magic-link →
   both arrive and work.
10. **Commit.** `config.toml`, `supabase/templates/*.html`, `CLAUDE.md` note.

**Rollback:** Dashboard → disable custom SMTP → Auth email reverts to the
built-in relay immediately. Revert the dashboard templates to default. The
Vercel DNS records and the Resend account can be left in place (inert) or
removed at leisure.

## Open Questions

- Exact production value for the Auth "emails per hour" limit (proposal: raise
  from `2` to somewhere around `30–50`; the real ceiling is Resend's 100/day).
- The sender local-part: `no-reply@` vs a monitored `hello@`.
- When to tighten DMARC from `p=none` to `p=quarantine` (after N days of clean
  `rua` reports) — a follow-up, not part of this change.
- Whether to also set a custom `mail.cedarchart.com` tracking/click domain in Resend
  (adds a CNAME; not needed for auth email, likely skip).

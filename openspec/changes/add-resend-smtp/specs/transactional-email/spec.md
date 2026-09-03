## Purpose

Account email from Supabase Auth (signup confirmation, password reset,
email-change confirmation, and magic-link / OTP) is delivered through a
production transactional email provider that is authenticated for a domain the
project owns, so messages actually arrive, are not spam-filtered, and carry the
project's branding rather than a generic development relay's.

## ADDED Requirements

### Requirement: Auth email is sent through a production provider

Supabase Auth outbound messages SHALL be delivered via a configured production
transactional email provider over authenticated SMTP, not the shared Supabase
development relay. The provider credentials SHALL be held as a project secret and
SHALL NOT appear in the repository; any committed configuration SHALL reference
the secret indirectly (e.g. `env(...)`).

#### Scenario: Password-reset email is delivered externally

- **WHEN** a registered user requests a password reset for an address hosted at
  an unrelated mail provider (e.g. Gmail)
- **THEN** the reset email arrives in that inbox within a minute
- **AND** its "From" address is at the project's own domain, not
  `supabase.io` or a development relay

#### Scenario: Signup confirmation email is delivered externally

- **WHEN** a new account is created with an external email address
- **THEN** a confirmation email arrives in that inbox
- **AND** clicking its link completes confirmation and the account can sign in

#### Scenario: Provider credentials are not in the repo

- **WHEN** the repository is scanned for the SMTP password / provider API key
- **THEN** no literal credential is found
- **AND** the checked-in SMTP configuration references it as an environment
  variable

### Requirement: Sender domain is authenticated (SPF, DKIM, DMARC)

Auth email SHALL be sent from an address at a domain the project controls, and
that domain SHALL publish SPF, DKIM, and DMARC DNS records for the provider such
that a recipient at a mainstream mail provider records SPF and DKIM as passing
and aligned, and DMARC as passing.

#### Scenario: Received mail passes authentication checks

- **WHEN** an auth email is received at a mainstream mail provider and its
  authentication results are inspected
- **THEN** `dkim=pass` and `spf=pass` are recorded with alignment to the sending
  domain
- **AND** `dmarc=pass` is recorded

#### Scenario: Provider dashboard reports the domain verified

- **WHEN** the sending domain is viewed in the email provider's dashboard
- **THEN** it is shown as verified with all required DNS records detected

### Requirement: Auth emails use project-branded templates

The confirm-signup, password-reset (recovery), email-change, and magic-link / OTP
flow emails, and the "password changed" and "email address changed" security
notifications, SHALL use project-specific subject lines and HTML bodies rather
than the provider or Supabase defaults. Each flow template SHALL preserve the
action link the flow depends on. Every template SHALL carry the project name and
logo and SHALL render as readable, single-column, accessible HTML in a major
webmail client, with no broken or missing images.

#### Scenario: Each auth email type is branded and functional

- **WHEN** any of the branded auth email types is received
- **THEN** its subject and body identify the application by name, show the logo,
  and match the project's wording
- **AND** for a flow email, the confirmation / reset / sign-in link in the body
  works when used

#### Scenario: Security-notification emails are sent and branded

- **WHEN** a user's password or email address is changed
- **THEN** a branded notification email is sent to the user recording the change
  and telling them what to do if it was not them

#### Scenario: Templates are version-controlled

- **WHEN** the repository is inspected
- **THEN** each auth email template exists as a file under source control and is
  referenced from `supabase/config.toml`
- **AND** the logo image referenced by the templates is also under source control

### Requirement: Email send limits are set for production

Supabase Auth email rate limits SHALL be raised above the development-relay
defaults so that ordinary signup and password-reset volume is not throttled,
while keeping a per-recipient minimum interval between successive emails to limit
abuse.

#### Scenario: Normal signup volume is not throttled

- **WHEN** several distinct users sign up or request resets within the same hour
- **THEN** every one of their emails is sent (no "email rate limit exceeded"
  error under ordinary use)

#### Scenario: Rapid repeat requests to one address are still spaced

- **WHEN** the same address requests a second confirmation or reset email
  immediately after the first
- **THEN** the second request is refused until the configured minimum interval
  has elapsed

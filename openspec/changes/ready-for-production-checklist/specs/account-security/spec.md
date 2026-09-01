## Purpose

Raises the security floor for account creation and sign-in so that a public
signup form cannot be used to create accounts with trivially weak or
known-compromised passwords, or be driven at scale by automated abuse.

## ADDED Requirements

### Requirement: Email verification required before data access

A newly registered account SHALL NOT be able to read or write user data until the
email address on the account has been verified. The application SHALL make the
unverified state visible to the user and provide a way to resend the
verification email.

Transactional email (verification and password reset) SHALL be delivered through
a production email sender configured for the project, not a shared development
relay.

#### Scenario: Unverified account is gated

- **WHEN** a user completes signup but has not clicked the verification link
- **THEN** attempts to reach the authenticated area redirect to a "verify your
  email" state rather than loading data

#### Scenario: Verified account has access

- **WHEN** a user clicks the verification link in the email they received
- **THEN** they can sign in and use the application normally

#### Scenario: Verification email can be resent

- **WHEN** an unverified user requests another verification email
- **THEN** a new verification email is delivered

### Requirement: Password strength enforcement

Passwords SHALL be rejected at both signup and password reset when they are
shorter than a configured minimum of at least 8 characters, or when they appear
in a public breached-password corpus.

#### Scenario: Too-short password is rejected

- **WHEN** a user submits a password below the minimum length at signup or reset
- **THEN** the request is rejected with a message explaining the requirement
- **AND** no account is created and no password is changed

#### Scenario: Known-compromised password is rejected

- **WHEN** a user submits a password that appears in the breached-password corpus
- **THEN** the request is rejected and the user is asked to choose another

### Requirement: Bot protection on signup

The signup flow SHALL require a valid CAPTCHA challenge response, and SHALL
reject a signup attempt that does not present one.

#### Scenario: Signup without CAPTCHA is rejected

- **WHEN** a signup request is submitted without a valid CAPTCHA token
- **THEN** the request is rejected and no account is created

#### Scenario: Signup with a valid CAPTCHA proceeds

- **WHEN** a user completes the CAPTCHA and submits valid signup details
- **THEN** the account is created and a verification email is sent

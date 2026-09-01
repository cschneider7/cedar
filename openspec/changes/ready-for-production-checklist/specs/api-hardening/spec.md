## Purpose

Hardens Cedar's public HTTP surface against common browser-side attacks and
against request-volume abuse, so that a publicly reachable deployment does not
depend solely on application correctness for its safety.

## ADDED Requirements

### Requirement: Security response headers

All HTML responses served by the frontend SHALL carry the following, in addition
to the `Strict-Transport-Security` header already sent:

- A `Content-Security-Policy` that restricts script, style, and connection
  sources to those the application actually uses.
- `X-Content-Type-Options: nosniff`.
- A `Referrer-Policy` no looser than `strict-origin-when-cross-origin`.
- A directive that forbids the application from being embedded in a frame by any
  other origin (`Content-Security-Policy: frame-ancestors 'none'` or an
  equivalent `X-Frame-Options`).

The Content-Security-Policy SHALL NOT break first-load, authentication, the
seating-chart canvas, or student-photo rendering.

#### Scenario: Headers present on the document response

- **WHEN** a browser requests any application page
- **THEN** the response includes `Content-Security-Policy`,
  `X-Content-Type-Options`, and `Referrer-Policy` headers

#### Scenario: Framing is blocked

- **WHEN** a page on another origin attempts to load the application in an
  `iframe`
- **THEN** the browser refuses to render the framed content

#### Scenario: Application still functions under the policy

- **WHEN** a user signs in and uses the roster and seating-chart pages with the
  Content-Security-Policy active
- **THEN** all scripts, styles, API calls, and student photos load without CSP
  violations

### Requirement: API rate limiting

Requests to `/api/v1/*` that exceed a configured per-client volume threshold
within a rolling window SHALL be rejected with HTTP `429`. The limit SHALL be
enforced at the platform edge (a Vercel WAF rate-limit rule), not in application
code, and SHALL be applied per client (keyed on client IP) so that one client's
excess does not affect another's requests.

#### Scenario: Burst beyond the threshold is throttled

- **WHEN** a single client sends requests to `/api/v1/*` faster than the
  configured threshold
- **THEN** requests over the threshold receive `429` before reaching the
  application

#### Scenario: Normal usage is unaffected

- **WHEN** a client uses the application at ordinary interactive rates
- **THEN** no request is rejected with `429`

#### Scenario: Throttling is isolated per client

- **WHEN** client A is being throttled for exceeding the threshold
- **THEN** client B's requests within the threshold still succeed

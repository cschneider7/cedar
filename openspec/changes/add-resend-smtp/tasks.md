<!--
Almost every task here is a console operation (Vercel, Resend, Supabase
dashboard) run by the owner, following design.md's Migration Plan. Only the template files, the config.toml block, and the CLAUDE.md note are
code/repo changes. No application code (app/, src/) changes and no deploy.

The project domain is `cedarchart.com` (acquired in group 1). Sender address is
`no-reply@send.cedarchart.com` unless the owner picks otherwise (design.md open
question).

Progress (2026-09-02): `cedarchart.com` bought through Vercel — 1.1 done.
Apply session (2026-09-02): repo-side work done (5.1 templates, 5.2 config.toml
blocks, 4.2 email_sent=30, 7.1 CLAUDE.md, 7.2 grep clean) + 2.2 Resend domain
created via MCP. Decisions: sender `no-reply@send.cedarchart.com`, sender name
"Cedar", DMARC `p=none` no rua, rate limit 30/hr. Remaining = Vercel DNS records
(owner, dashboard), Supabase dashboard config (owner), local + live verification
(owner).
Apply session cont. (2026-09-02): group 2 done (DNS + Resend verified + key).
Group 3 + 4.1 done by owner — custom SMTP live, confirmed via Resend logs;
rate limit 30/hr. Scope grew (owner requests): logo is now a hosted PNG
(`public/email/cedar-mark.png`, not CSS — Gmail stripped the CSS version) and
`password_changed` + `email_changed` notification templates added → 6 templates.
Artifacts (proposal/spec/design) updated to match. Remaining = 5.3 (local test),
7.3 (PR + deploy the PNG), 5.4 (re-paste 6 templates post-deploy), group 6
(live verification).
-->

## 1. Domain and DNS

- [x] 1.1 _(Vercel dashboard → Domains, or `vercel domains buy cedarchart.com`)_ Register `cedarchart.com` through Vercel with auto-renew enabled. Verify: the domain appears in the Vercel account and `dig NS cedarchart.com` returns `ns1.vercel-dns.com` / `ns2.vercel-dns.com`. — done: bought through Vercel 2026-09-02.
- [x] 1.2 _(Vercel dashboard → the domain)_ Confirm the domain is on Vercel DNS and active — registering through Vercel does this automatically, no delegation step. Verify: the domain's DNS Records tab is available in the Vercel dashboard. — done 2026-09-02: owner added the Resend DNS records in Vercel DNS and Resend verified them (2.4), which proves the zone is live on Vercel DNS.

## 2. Resend account and domain verification

- [ ] 2.1 _(resend.com)_ Create a standalone Resend account (not via the Vercel Marketplace). Verify: able to sign in to the Resend dashboard.
- [x] 2.2 _(Resend dashboard → Domains)_ Add `send.cedarchart.com` as a sending domain. Verify: Resend lists the domain as "not verified" and displays the required SPF (`MX` + `TXT`), DKIM (`TXT`), and DMARC records. — done 2026-09-02 via Resend MCP; domain id `840e4780-d8b9-4f3c-901d-84b17ef6aa17`, status `not_started`. Resend returned DKIM + SPF (MX/TXT) records; it does not generate a DMARC record (added manually in 2.3 per the `p=none` decision).
- [x] 2.3 _(Vercel dashboard → cedarchart.com → DNS Records)_ Add the 4 records below to the `cedarchart.com` zone (names are relative to the zone root), then Resend → verify. DMARC is `p=none` with no `rua` (decision 2026-09-02). Verify: `dig TXT resend._domainkey.send.cedarchart.com`, `dig MX send.send.cedarchart.com`, `dig TXT send.send.cedarchart.com`, `dig TXT _dmarc.send.cedarchart.com` all resolve. — done 2026-09-02 by owner: DKIM + SPF (MX/TXT) records added and confirmed `verified` by Resend. DMARC `_dmarc.send` TXT added; alignment confirmed live via a test send (see 2.4).
  - `resend._domainkey.send` — **TXT** — `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkwyedGvJacj6eIAWcHbHTLPIKl1qa6xeD8CsEKOOmZkpLS0mgAeTwwtRt6euAQaT8EmDRDe/A8ydx5eu7LR8qZXbPj/lBU6w1jCUmGDybVLkC7T2AomO37ZXTopiAKI9GP2q2NJUgg8mncfx0UCmgChjheKi696k6tpXAQjXVJQIDAQAB`
  - `send.send` — **MX** — `feedback-smtp.us-east-1.amazonses.com` (priority 10)
  - `send.send` — **TXT** — `v=spf1 include:amazonses.com ~all`
  - `_dmarc.send` — **TXT** — `v=DMARC1; p=none;`
- [x] 2.4 _(Resend dashboard)_ Wait for Resend to poll and mark `send.cedarchart.com` fully verified (SPF + DKIM + DMARC all green). Verify: the domain shows "Verified" in Resend. — done 2026-09-02: Resend reports domain + all DNS records `verified`, sending enabled. Live check: a test send `Cedar <no-reply@send.cedarchart.com>` → Gmail was `delivered` (Resend id `01a06470-1897-72da-8cfa-2073268b4008`); owner confirmed `spf=pass`, `dkim=pass`, `dmarc=pass` via Gmail "Show original" 2026-09-02.
- [x] 2.5 _(Resend dashboard → API Keys)_ Create an API key with sending permission for `send.cedarchart.com`. Store the key value securely for step 3.2; do not paste it anywhere in the repo. Verify: the key is listed in Resend. — done 2026-09-02 by owner: key "Sending Key" (id `ace24566-359d-42d2-a545-73b0472dcb53`) exists; value held by owner for step 3.1/3.2.

## 3. Supabase secret and SMTP configuration

- [ ] 3.1 _(Supabase dashboard → Project Settings, or `supabase secrets set`)_ Store the Resend API key as the project secret `RESEND_API_KEY`. Verify: `supabase secrets list` shows `RESEND_API_KEY` (digest only).
- [x] 3.2 _(Supabase dashboard → Authentication → Emails → SMTP Settings)_ Enable custom SMTP: host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key, sender email `no-reply@send.cedarchart.com`, sender name (app name). Save. Verify: the dashboard accepts the settings and shows custom SMTP enabled. — done 2026-09-02 by owner; confirmed live: a reset + a "password changed" notification both routed through Resend from `"Cedar" <no-reply@send.cedarchart.com>`.
- [x] 3.3 _(Supabase dashboard → Authentication → Emails → password-reset test)_ Immediately send a password-reset to a real external inbox (Gmail). Verify: the email arrives within a minute from `no-reply@send.cedarchart.com`; if it does not, disable custom SMTP to roll back and recheck steps 2–3. — done 2026-09-02: reset to `caserino31@gmail.com` `delivered` via Resend (id `01a06485-86a8-75ea-a228-ff3389644c7a`), branded "Reset your Cedar password" template. Inbox placement + link click covered by 6.1.

## 4. Auth email rate limits

- [x] 4.1 _(Supabase dashboard → Authentication → Rate Limits)_ Raise "number of emails sent per hour" from the relay default to the production value (~30–50). Verify: the dashboard reflects the new limit. — done 2026-09-02 by owner: set to 30/hour.
- [x] 4.2 Mirror the value as `[auth.rate_limit].email_sent` in `supabase/config.toml`. Verify: `supabase start` (or `supabase config` validation) accepts the file. — done 2026-09-02: `email_sent = 30`; `npx supabase status` parses config.toml with no error. Full `supabase start` acceptance to be re-confirmed during 5.3 (revert to a comment if the CLI rejects a value > 2 without local SMTP).

## 5. Branded email templates

- [x] 5.1 Create the branded templates under `supabase/templates/` — the four flow templates (`confirmation`, `recovery`, `email_change`, `magic_link`) and the two security notifications (`password_changed`, `email_changed`) — single-column, inline-styled, correct Supabase Go variables per type. Verify: each file exists and contains its flow's action variable / notification content. — done 2026-09-02: 6 files. Flow templates: button + fallback link on `{{ .ConfirmationURL }}`, no OTP line (the app has no code-entry screen — login is password + Google, all flows link-based); `email_change` uses `{{ .NewEmail }}`. Notifications: no CTA beyond a "reset password" nudge; `email_changed` uses `{{ .OldEmail }}` → `{{ .Email }}`. Table layout, `color-scheme` meta.
- [x] 5.1a Generate `public/email/cedar-mark.png` (the Cedar tree logo, transparent, from `public/favicon.svg`) and reference it in every template header as `https://cedarcharts.vercel.app/email/cedar-mark.png`. Verify: PNG exists, all 6 templates `<img>` it. — done 2026-09-02: 264×327 transparent PNG rendered from the favicon SVG. (An earlier CSS-drawn mark was dropped — Gmail strips `position`/negative-margins so it rendered as a clover; `data:` URIs and inline SVG are also blocked by Gmail. Hosted first-party PNG is the one accepted external asset — see design D7.)
- [x] 5.2 Add `subject` + `content_path` blocks in `supabase/config.toml` for the four `[auth.email.template.*]` and the two `[auth.email.notification.*]` (with `enabled = true`), plus the commented `[auth.email.smtp]` documentation block (`pass = "env(RESEND_API_KEY)"`, not enabled). Verify: `supabase start` picks up the templates locally. — done 2026-09-02: 6 blocks + commented SMTP block; TOML parses; `supabase start` pickup to be confirmed in 5.3.
- [ ] 5.3 With the local stack running, trigger each flow (signup, password reset, email change, magic link) and each notification (password change, email change) against a local test account and read each message in the Mailpit inbox. Verify: every email renders correctly (logo included), shows the branded subject, and its link works locally. Also confirms `supabase start` accepts `email_sent = 30` (4.2).
- [ ] 5.4 _(Supabase dashboard → Authentication → Emails)_ Paste all 6 templates (subject + HTML) into the dashboard editor for the `Cedar` project — flow templates + the two notification templates — and enable the password-changed / email-changed notifications at the project level. Save. **Do this only after 7.3's PR has deployed to production** (the logo URL 404s until then). Verify: the dashboard preview renders each template with the logo. — first paste (flow templates, v1) done 2026-09-02; superseded — re-paste all 6 post-deploy.

## 6. Live end-to-end verification

- [ ] 6.1 From a real Gmail account, request a password reset. Verify: email arrives, "Show original" reports `spf=pass`, `dkim=pass`, `dmarc=pass` aligned to `send.cedarchart.com`, and the link completes the reset.
- [ ] 6.2 Create a brand-new account with a Gmail address. Verify: the confirmation email arrives (check Spam too), the link confirms the account, and it can then sign in.
- [ ] 6.3 Trigger an email-change (from the account page) and, if wired, a magic-link sign-in for a test account. Verify: the email-change confirmation and the two notifications (`password_changed` from 6.1, `email_changed` from this step) arrive from `no-reply@send.cedarchart.com`, render with the logo, and the change flow completes.
- [ ] 6.4 _(Resend dashboard → Logs)_ Confirm the sends from 6.1–6.3 appear as delivered. Verify: no bounces or blocks logged; the `cedar-mark.png` requests from Gmail's image proxy succeed (no 404).

## 7. Repo changes

- [x] 7.1 Update `CLAUDE.md` (Supabase Auth section): note that Auth email is delivered via Resend custom SMTP from `no-reply@send.cedarchart.com` in Preview/Production, local dev uses the Inbucket/Mailpit catcher, and `supabase/templates/*.html` must be kept in sync with the dashboard template editor by hand. Verify: the note is present and accurate. — done 2026-09-02: new "Auth email delivery" bullet after the `auth.rs` bullet; covers the 6 templates, the notification blocks, and the `public/email/cedar-mark.png` logo + deploy-before-paste ordering.
- [x] 7.2 Confirm no secret landed in the repo: `git grep -iE "re_[a-z0-9]{10,}|RESEND_API_KEY *= *\"[^e]"` returns nothing, and `config.toml` references `env(RESEND_API_KEY)`. Verify: the grep is clean. — done 2026-09-02: grep clean; `config.toml:246` has `pass = "env(RESEND_API_KEY)"` (commented).
- [x] 7.3 Open the PR with `supabase/config.toml`, `supabase/templates/*.html`, `public/email/cedar-mark.png`, and the `CLAUDE.md` note. Verify: CI (Backend Tests + Frontend Tests) green; after merge, `https://cedarcharts.vercel.app/email/cedar-mark.png` returns the PNG (gates 5.4). — PR #101 opened 2026-09-02 (branch `feat/resend-auth-email`, off `main`). Both required checks green (Backend Tests, Frontend Tests) + Prettier/Rust Format/Cargo Audit/CodeQL. Awaiting review/merge + prod deploy; confirm the PNG URL 200s after deploy before doing 5.4.

## 8. Follow-up (not blocking this change)

- [ ] 8.1 After ~7 days of clean DMARC `rua` reports, tighten `_dmarc.send.cedarchart.com` to `p=quarantine` in Vercel DNS. Verify: reports still show pass; no legitimate mail quarantined.
- [ ] 8.2 Hand off to `ready-for-production-checklist` task 5.3 (enable `enable_confirmations`), now unblocked. Verify: that task's owner is notified.

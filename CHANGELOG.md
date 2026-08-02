# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Stripe checkout orchestrator end-to-end test (Stripe checkout Phase F): an env-gated (`OAUTH2_ENABLED=true STRIPE_E2E=true`) API-level Playwright flow that authenticates, builds a cart, and drives the order orchestrator with a Stripe test-mode PaymentMethod token — asserting server-side amount authority, order → PAID, cart cleared after PAID, and payment recorded with `gateway=stripe` on the happy path, and a 402 with the order left PENDING and the cart intact on decline. Also an always-on contract check (missing `paymentMethodId` → 400) and an OAuth2-gated empty-cart → 400 case. Validates the A–E checkout path against a live test-mode stack. Tracks the pre-existing tsc/lint baseline debt. Spec: `docs/plans/` Phase F Stripe checkout orchestrator e2e.
- `.githooks/pre-push`: pre-push hook to block accidental direct pushes from feature branches to main; bypass with `ALLOW_MAIN_PUSH=1`

### Changed
- Upgrade Node.js 20 → 22 (NODE_VERSION env var in e2e-tests.yml)

### Fixed
- Disabled `push` and `pull_request` triggers from `e2e-tests.yml` — API and flow test jobs require live services at localhost:8083/8000/8080 which do not exist in CI

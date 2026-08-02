# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Stripe checkout orchestrator end-to-end test (Stripe checkout Phase F): an env-gated (`OAUTH2_ENABLED=true STRIPE_E2E=true`) Playwright flow covering authenticated login → cart → Stripe Elements card entry → order orchestration → order PAID, validating the full A–E checkout path against a live test-mode stack. Also tracks the pre-existing tsc/lint baseline debt. Spec: `docs/plans/` Phase F Stripe checkout orchestrator e2e.
- `.githooks/pre-push`: pre-push hook to block accidental direct pushes from feature branches to main; bypass with `ALLOW_MAIN_PUSH=1`

### Changed
- Upgrade Node.js 20 → 22 (NODE_VERSION env var in e2e-tests.yml)

### Fixed
- Disabled `push` and `pull_request` triggers from `e2e-tests.yml` — API and flow test jobs require live services at localhost:8083/8000/8080 which do not exist in CI

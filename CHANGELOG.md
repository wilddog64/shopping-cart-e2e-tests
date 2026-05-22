# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Upgrade Node.js 20 → 22 (NODE_VERSION env var in e2e-tests.yml)

### Fixed
- Disabled `push` and `pull_request` triggers from `e2e-tests.yml` — API and flow test jobs require live services at localhost:8083/8000/8080 which do not exist in CI

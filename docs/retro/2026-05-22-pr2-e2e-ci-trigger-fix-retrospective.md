# Retrospective — PR #2: E2E CI Trigger Fix

**Date:** 2026-05-22
**PR:** #2 — merged to main (`a37a9d9801d85508d5e3ca74691b3ff96f24d262`)
**Participants:** Claude, Codex

## What Went Well
- Fix correctly identified that push/PR triggers cause ECONNREFUSED — live services don't exist in GitHub Actions
- `all-tests` job was already correctly gated; this PR applied the same intent at the trigger level
- CI (GitGuardian) green; no Copilot findings

## What Went Wrong
- PR was open and blocking Node.js upgrade PR creation — should have been merged before handing off Node.js task

## Process Rules Added
None — this was a straightforward CI config fix.

## Decisions Made
- `push`/`pull_request` triggers removed; re-enable only after adding service containers or staging environment secrets
- `workflow_dispatch` and `schedule` triggers remain active

## Theme
The e2e test workflow was silently failing on every push because it expected live services. Removing the broken triggers prevents noise and unblocks the repo for further work.

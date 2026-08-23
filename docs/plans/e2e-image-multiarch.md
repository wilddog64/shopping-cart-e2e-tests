# Publish `shopping-cart-e2e-tests` as a multi-arch image (add linux/arm64)

**Type:** CI fix (image build).
**Assigned to:** Codex.
**Branch:** `feat/e2e-image-multiarch` (do NOT push to `main`; open a PR).
**Priority:** high — blocks the k3d-manager v1.27.0 plan #2 M2 (Apple Silicon) remote E2E
runner acceptance gate. Cross-ref (k3d-manager repo):
`docs/bugs/2026-08-22-e2e-tests-image-amd64-only-blocks-arm64-m2-runner.md`.

## Problem

`ghcr.io/wilddog64/shopping-cart-e2e-tests:latest` is published **amd64-only**. Verified
against ghcr — the OCI index contains only:

```
platform: {architecture: amd64,   os: linux}
platform: {architecture: unknown, os: unknown}   # attestation, not runnable
```

No `linux/arm64`. On the k3d-manager M2 remote runner (Apple Silicon, arm64 k3d node)
the Playwright Job fails at pull time:

```
Failed to pull "ghcr.io/wilddog64/shopping-cart-e2e-tests:latest":
  no match for platform in manifest: not found  → ImagePullBackOff → Job DeadlineExceeded
```

The app images (product-catalog/basket/order) are already multi-arch and run on the same
node — only this test image is single-arch. It "works" on the M4 box solely because that
host's OrbStack has amd64 emulation; relying on host emulation is not portable.

## Root cause

`.github/workflows/publish-image.yml` builds with `docker/build-push-action@v6` but sets
**no `platforms:`**, so buildx builds only the runner's native arch (amd64 on
`ubuntu-latest`). There is also no `docker/setup-qemu-action` step, so cross-arch emulation
isn't available to buildx.

## Fix

Edit `.github/workflows/publish-image.yml` — add a QEMU setup step and the `platforms`
input. Minimal diff:

```yaml
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3          # NEW — enables arm64 emulation on the amd64 runner
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/wilddog64/shopping-cart-e2e-tests
          tags: |
            type=sha,prefix=sha-,format=long
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64   # NEW
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          provenance: false                    # NEW — avoids the "unknown/unknown" index entry noise
```

Notes:
- Keep all action versions pinned to tags (`@v3/@v5/@v6`) — no `@main`/`@latest` (supply-chain
  rule). `setup-qemu-action@v3` is the current major.
- `permissions:` already correct (`contents: read`, `packages: write`) — do not widen.
- `provenance: false` is optional but recommended: it drops the `unknown/unknown`
  attestation manifest so the index carries just the two real platforms. If you keep
  provenance, that's fine too — the arm64 entry is what matters.

## Dockerfile — no change needed (verified)

`Dockerfile` is arch-clean: base `mcr.microsoft.com/playwright:v1.57.0-jammy` is published
for both amd64 and arm64; `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is safe because the arm64
base ships arm64 browsers; `npm ci` resolves per-arch native deps during each platform's
build leg. No arch-specific downloads. **Confirm** the base tag has an arm64 variant before
building (`docker manifest inspect mcr.microsoft.com/playwright:v1.57.0-jammy | grep arm64`).

## Acceptance criteria

1. `docker manifest inspect ghcr.io/wilddog64/shopping-cart-e2e-tests:latest` lists **both**
   `linux/amd64` and `linux/arm64`.
2. The same for the `sha-<commit>` tag produced by the merge.
3. The workflow run is green (both platform legs build + push).
4. Hand back to k3d-manager: `make e2e-remote RUNNER=m2` pulls the image on the arm64 node
   and the Playwright Job runs to a real pass/fail (no `ImagePullBackOff`). (Verified by
   Claude on the M2 runner after this merges — not part of this repo's CI.)

## Constraints

- Feature branch + PR only; the repo has a pre-push main-guard hook — never push `main`.
- Pin all GitHub Actions to version tags.
- Do not change what the tests do or the ENTRYPOINT/CMD — this is a build-platform change only.
- Expect the arm64 leg to be slower (QEMU emulation on an amd64 runner); acceptable for this
  image. If build time is a problem, a native arm64 runner is a follow-up, not required here.

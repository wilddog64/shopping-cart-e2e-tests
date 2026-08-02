# Pre-existing baseline: `tsc --noEmit` red + `npm run lint` cannot run

**Date:** 2026-08-01
**Status:** Open — tracked cleanup, not yet fixed
**Discovered during:** Phase F (Stripe checkout orchestrator e2e, `680762a`) — the new
`tests/flows/stripe-checkout-orchestrator.spec.ts` typechecks clean; these failures are in
**other, pre-existing** files and block a green repo-wide gate.

---

## Summary

Two independent, pre-existing defects make the repo's own quality gates unusable:

1. `npm run typecheck` (`tsc --noEmit`) reports **11 errors across 4 spec files**.
2. `npm run lint` (`eslint tests --ext .ts`) **cannot run at all** — no ESLint config file
   exists, despite `eslint@^8.55.0` + `@typescript-eslint/*@^6` being devDependencies and a
   `lint` script being defined.

Neither is caused by Phase F. This doc records them so they are fixed as their own task and
not silently absorbed into the Phase F PR.

---

## Defect 1 — 11 `tsc` errors (`strict: true`)

`tsconfig.json` sets `"strict": true`. Two patterns trip it:

### 1a. `.find()` results dereferenced without a null guard (9 errors)

`Array.prototype.find()` returns `T | undefined`; the value is used directly.

```
tests/api/cross-service.spec.ts:72,73      'cartItem' is possibly 'undefined'
tests/api/cross-service.spec.ts:160,161,200 'orderItem' is possibly 'undefined'
tests/flows/checkout-flow.spec.ts:116       'laptopItem' is possibly 'undefined'
tests/flows/checkout-flow.spec.ts:120       'bookItem' is possibly 'undefined'
tests/flows/order-management.spec.ts:279    'pendingOrder' is possibly 'undefined'
tests/flows/order-management.spec.ts:290    'cancelledOrder' is possibly 'undefined'
```

**Fix:** guard before use — `expect(cartItem).toBeDefined()` then narrow, or assert
`const cartItem = items.find(...)!` where the test has already proven presence. Prefer the
explicit `toBeDefined()` guard so a genuine miss fails loudly rather than throwing on `!`.

### 1b. `OrderItem` type is missing `subtotal` (2 errors)

```
tests/api/orders.spec.ts:234              Property 'subtotal' does not exist on type 'OrderItem'
tests/flows/order-management.spec.ts:265  Property 'subtotal' does not exist on type 'OrderItem'
```

The `OrderItem` interface in `tests/helpers/api-client.ts:76` has only
`productId / productName / quantity / unitPrice` — but two tests read `item.subtotal`.

**Fix:** if the order service returns `subtotal` on each item, add `subtotal: number` to the
`OrderItem` interface. If it does not, the tests are asserting a non-existent field and should
compute `unitPrice * quantity` instead. Confirm against the order-service response before
choosing — do not guess.

---

## Defect 2 — `npm run lint` has no config

```
$ npm run lint
ESLint couldn't find a configuration file.
```

`package.json` defines `"lint": "eslint tests --ext .ts"` and carries
`eslint@^8.55.0`, `@typescript-eslint/eslint-plugin@^6.13.0`,
`@typescript-eslint/parser@^6.13.0` — but there is no `.eslintrc*`, no `eslint.config.*`, and
no `eslintConfig` key in `package.json`. The lint gate has never been runnable.

**Fix:** add a `.eslintrc.json` matching the installed toolchain (ESLint 8 = classic eslintrc,
not flat config), e.g.:

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "env": { "node": true, "es2022": true },
  "parserOptions": { "ecmaVersion": 2022, "sourceType": "module" }
}
```

Then run `npm run lint` and resolve any findings (expect unused-var / no-explicit-any hits in
the older specs) before wiring lint into CI.

---

## Definition of Done (for the future cleanup task)

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `.eslintrc.json` added; `npm run lint` runs and is clean
- [ ] No behavioral change to any test's assertions (type/guard fixes only)
- [ ] CI wires `typecheck` + `lint` as gates once both are green

---

## What this is NOT

- NOT introduced by Phase F — `tests/flows/stripe-checkout-orchestrator.spec.ts` typechecks
  clean on its own and lists all 4 tests under `playwright test --list`.
- NOT a runtime failure — Playwright transpiles per-file, so the suite still runs; this only
  blocks the static `tsc`/`eslint` gates.

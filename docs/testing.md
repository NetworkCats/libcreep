# Testing

## Prerequisites

The package accepts Node.js 22.12 or newer. Repository development and CI use
the Node.js version in `.nvmrc` (currently Node 26). Install the Playwright
browser builds before running browser tests locally:

```sh
nvm use
npm ci
npm exec playwright install chromium firefox webkit
```

On a fresh Linux environment, Playwright may also need operating-system
dependencies:

```sh
npm exec playwright install --with-deps chromium firefox webkit
```

Use `npm install` only when intentionally updating `package-lock.json`; use
`npm ci` for a reproducible checkout.

## Main commands

| Command                       | Purpose                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`        | Check Prettier formatting for source, configuration, and Markdown.                                                                           |
| `npm run lint`                | Run Oxlint with warnings denied over the configured source and test files.                                                                   |
| `npm run typecheck`           | Strictly type-check source and tests without emitting files.                                                                                 |
| `npm run build`               | Clean and build ESM/runtime/worker output and declarations, remove debug-only declarations, and scan production output for profiler leakage. |
| `npm run test:unit`           | Run Node-based unit tests.                                                                                                                   |
| `npm run test:browser`        | Build production output, then run browser tests in Chromium, Firefox, and WebKit.                                                            |
| `npm run test:node-compat`    | Verify the built package imports safely and fails clearly when collection is attempted in Node.                                              |
| `npm run test:types:consumer` | Compile an external TypeScript-consumer fixture against the packaged public types.                                                           |
| `npm test`                    | Run unit, browser, Node compatibility, and consumer-type tests.                                                                              |
| `npm run validate`            | Run the complete formatting, lint, type, test, build, package-lint, and type-resolution validation sequence.                                 |
| `npm run test:coverage`       | Build and run both unit and browser projects with Istanbul coverage.                                                                         |
| `npm run test:speed`          | Run the cross-browser collection benchmark and enforce timing budgets.                                                                       |

`npm run validate` is the closest local equivalent of release validation. In
addition to the test suites it runs `publint` and `@arethetypeswrong/cli` with
the package packed as ESM-only.

`npm run build` starts with `npm run clean`, which removes `dist`, coverage,
and browser test report directories. Do not expect those generated artifacts
to survive a build.

## Browser test selection

The default browser configuration creates Chromium, Firefox, and WebKit
instances. To run one browser while iterating, pass its name through Vitest:

```sh
npm run test:browser -- --browser.name=chromium
```

Browser tests load the production build's worker output, so worker packaging
and default URL resolution are exercised rather than mocked.

## Coverage

```sh
npm run test:coverage
```

This builds the production worker, runs the unit and browser projects, and
writes Istanbul output to `coverage/`. Global thresholds in
`vitest.config.ts` cover statements, branches, functions, and lines. The
thresholds are a regression floor, not a claim that every upstream branch can
execute in every browser engine.

Because coverage includes real browser probes, install all three Playwright
browsers first. The run can take substantially longer than unit tests.

## Speed benchmark

```sh
npm run test:speed
```

The benchmark performs one warm-up followed by five measured collections in
Chromium, Firefox, and WebKit. Each browser reports per-run wall and collection
times plus median and p95 timings for every detector. The default collection
duration median and p95 budgets are 15 and 30 seconds.

Sample count and budgets can be overridden for slower or more rigorous
environments:

```sh
LIBCREEP_SPEED_SAMPLES=10 \
LIBCREEP_SPEED_MAX_MEDIAN_MS=12000 \
LIBCREEP_SPEED_MAX_P95_MS=20000 \
npm run test:speed
```

Environment values must be finite and positive. Invalid values fall back to
the defaults; the sample count is floored to an integer with a minimum of one.

Development and test transforms include detailed speed tables when
`load({ debug: true })` is used. Production replaces the profiling gate with
`false`, tree-shakes the profiler, removes its declaration output, and scans
JavaScript and source maps so a build fails if profiler markers remain.

## Test structure

- `test/api.unit.test.ts` covers SSR-safe imports, minimum capability checks,
  public errors, versions, and detector manifests.
- `test/collector.unit.test.ts` covers load/collection option forwarding,
  cross-collector serialization, queued aborts, failure recovery, debug output,
  one-shot collection, strategy validation, and document readiness.
- `test/hash.unit.test.ts` covers canonical component hashing, key ordering,
  statuses, special JavaScript values, rejected lossy structures, diagnostic
  serialization, and missing Web Crypto support.
- `test/debug-profile.unit.test.ts` covers detector timing rankings and
  aggregate speed-profile output.
- `test/errors.unit.test.ts` covers detector error capture, guarded API access,
  and timing helpers.
- `test/webrtc.unit.test.ts` covers SDP codec merging and cleanup when WebRTC
  offer creation never settles.
- `test/presentation.unit.test.ts` prevents upstream report renderers from
  returning to detector modules.
- `test/internal-utils.browser.test.ts` covers cross-browser platform,
  user-agent, WebGL parameter, and compact-value classification helpers.
- `test/fingerprint.browser.test.ts` performs default and opt-in full browser
  collections, validates all core entries and focused hashes, tests the
  packaged worker and service-worker cleanup, verifies repeated state reset,
  and exercises active cancellation and timeout recovery.
- `test/speed.browser.bench.ts` runs repeated warm speed samples and detector
  timing profiles independently in each browser engine.
- `test/compatibility/typescript-consumer.ts` verifies public type narrowing
  and guards against accidental `any` or obsolete API fields.
- `scripts/check-node-compatibility.mjs` verifies built-package SSR/Node import
  safety without pretending collection can run server-side.

The upstream exploratory browser-test areas are mapped to automated assertions
inside `fingerprint.browser.test.ts`: workers, iframes, fonts, timezone,
window/HTML surfaces, screen/media queries, prototype/proxy checks,
DOMRect/emojis, math/engine errors, machine/WebGL, and extension/resistance
signals.

## Continuous integration

The GitHub Actions workflow uses Node 26. Static validation and package checks
run on Ubuntu, while the browser job is split across a Chromium, Firefox, and
WebKit matrix. Browser jobs install the selected Playwright browser with its
system dependencies and invoke the same `test:browser` script used locally.

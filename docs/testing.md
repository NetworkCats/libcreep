# Testing

## Commands

```sh
nvm use
npm install
npx playwright install chromium firefox webkit
npm run validate
npm run test:coverage
npm run test:speed
```

`npm run validate` performs formatting checks, linting, strict public-surface
type checking, unit tests, Chromium/Firefox/WebKit browser tests, production
builds, package linting, and type-resolution validation.

`npm run test:coverage` builds the production worker, runs both test projects,
and writes an Istanbul report to `coverage/`. The configured global thresholds
prevent statement, branch, function, and line coverage from falling below the
current tested baseline.

`npm run test:speed` performs one warm-up followed by five measured Creep.js
collections in Chromium, Firefox, and WebKit. Each browser reports per-run
wall/collection times plus median and p95 timings for every detector. The
default median and p95 budgets are 15 and 30 seconds; benchmark runs and budgets
can be overridden for slower or more rigorous environments:

```sh
LIBCREEP_SPEED_SAMPLES=10 \
LIBCREEP_SPEED_MAX_MEDIAN_MS=12000 \
LIBCREEP_SPEED_MAX_P95_MS=20000 \
npm run test:speed
```

Development and test transforms include detailed speed tables when
`load({ debug: true })` is used. The production build replaces the profiling
gate with `false`, tree-shakes the profiler, and runs an output scan that fails
the build if profiler markers survive in JavaScript or source maps.

## Test structure

- `test/api.unit.test.ts` covers SSR-safe imports, public errors, and detector
  manifests.
- `test/collector.unit.test.ts` covers collector queuing, option forwarding,
  debug output, failure recovery, one-shot collection, and document readiness.
- `test/hash.unit.test.ts` covers the canonical public hashing format, special
  JavaScript values, component statuses, error normalization, and missing Web
  Crypto support.
- `test/errors.unit.test.ts` covers detector error capture, guarded API access,
  and timing helpers.
- `test/internal-utils.browser.test.ts` covers cross-browser platform,
  user-agent, WebGL parameter, and compact-value classification helpers.
- `test/presentation.unit.test.ts` prevents upstream report renderers from
  returning to detector modules.
- `test/fingerprint.browser.test.ts` performs full default and opt-in browser
  collections, checks all core component results, and maps the upstream
  exploratory test areas to automated assertions.
  Browser tests use the production worker output. They verify default passive
  signals separately from opt-in WebRTC and ensure repeated collection through
  one collector is safe. They also cover abort signals, collection timeouts,
  canonical hashing, and all three major browser engines.
- `test/speed.browser.bench.ts` runs repeated warm speed samples and detector
  timing profiles independently in Chromium, Firefox, and WebKit.

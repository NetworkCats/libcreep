# Testing

## Commands

```sh
nvm use
npm install
npx playwright install chromium firefox webkit
npm run validate
npm run test:coverage
```

`npm run validate` performs formatting checks, linting, strict public-surface
type checking, unit tests, Chromium/Firefox/WebKit browser tests, production
builds, package linting, and type-resolution validation.

`npm run test:coverage` builds the production worker, runs both test projects,
and writes an Istanbul report to `coverage/`. The configured global thresholds
prevent statement, branch, function, and line coverage from falling below the
current tested baseline.

## Test structure

- `test/api.unit.test.ts` covers SSR-safe imports, public errors, and detector
  manifests.
- `test/agent.unit.test.ts` covers agent queuing, option forwarding, debug
  output, failure recovery, one-shot collection, and document readiness.
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
  signals separately from opt-in WebRTC and ensure repeated agent collection is
  safe. They also cover abort signals, collection timeouts, canonical hashing,
  and all three major browser engines.

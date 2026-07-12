# Testing

## Commands

```sh
nvm use
npm install
npx playwright install chromium firefox webkit
npm run validate
```

`npm run validate` performs formatting checks, linting, strict public-surface
type checking, unit tests, Chromium/Firefox/WebKit browser tests, production
builds, package linting, and type-resolution validation.

## Test structure

- `test/api.unit.test.ts` covers SSR-safe imports, public errors, and detector
  manifests.
- `test/presentation.unit.test.ts` prevents upstream report renderers from
  returning to detector modules.
- `test/fingerprint.browser.test.ts` performs full default and opt-in browser
  collections, checks all core component results, and maps the upstream
  exploratory test areas to automated assertions.
  Browser tests use the production worker output. They verify default passive
  signals separately from opt-in WebRTC and ensure repeated agent collection is
  safe. They also cover abort signals, collection timeouts, canonical hashing,
  and all three major browser engines.

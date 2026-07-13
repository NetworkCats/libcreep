# Examples

These examples use the named ESM exports from `libcreep`. Collection must run
in a browser window with a DOM, `TextEncoder`, and Web Crypto SHA-256 support.
Importing the package is safe during SSR, but `load()` and `collect()` are
client-only.

Fingerprint values and debug reports can contain sensitive environment data.
Collect only what your application needs, obtain any required consent, and do
not use a fingerprint as an authentication factor or proof of identity.

## Reuse a collector

Create a collector once and reuse it. Calls are serialized automatically, even
if different collectors start them at the same time.

```ts
import { load } from 'libcreep';

const collector = await load();

const first = await collector.collect({ timeoutMs: 10_000 });
console.log(first.visitorId);

const second = await collector.collect({ timeoutMs: 10_000 });
console.log(second.visitorId);
```

## One-shot collection

`collect()` accepts both load and collection options:

```ts
import { collect } from 'libcreep';

const result = await collect({
  debug: false,
  includeWebRtc: false,
  timeoutMs: 10_000,
  worker: { strategy: 'auto' },
});

console.log(result.visitorId);
```

For repeated work, prefer a reusable collector so configuration is declared in
one place.

## Check the environment before loading

The support helper checks only the minimum APIs. Individual detectors may
still be unsupported because of browser features, permissions, CSP, or privacy
settings.

```ts
import {
  getBrowserCapabilities,
  isFingerprintingSupported,
  load,
} from 'libcreep';

if (!isFingerprintingSupported()) {
  console.info('Fingerprint collection is unavailable');
} else {
  const capabilities = getBrowserCapabilities();
  console.log({
    secureContext: capabilities.isSecureContext,
    sharedWorker: capabilities.hasSharedWorker,
    serviceWorker: capabilities.hasServiceWorker,
  });

  const collector = await load();
  const result = await collector.collect({ timeoutMs: 10_000 });
  console.log(result.visitorId);
}
```

## Initialize from an SSR application

Keep collection behind a client-side function. Caching the promise prevents
multiple UI callers from loading separate collectors.

```ts
import { load, type FingerprintCollector } from 'libcreep';

let collectorPromise: Promise<FingerprintCollector> | undefined;

export function getBrowserCollector(): Promise<FingerprintCollector> {
  if (typeof window === 'undefined') {
    throw new TypeError('Fingerprint collection is client-only');
  }

  collectorPromise ??= load();
  return collectorPromise;
}

export async function identifyBrowser(): Promise<string> {
  const collector = await getBrowserCollector();
  const result = await collector.collect({ timeoutMs: 10_000 });
  return result.visitorId;
}
```

Call `identifyBrowser()` from the framework's client mount/effect or a browser
event handler, not during server rendering.

## Read a component safely

Each component is a discriminated result. Narrow `status` before reading
`value` or `error`.

```ts
const canvas = result.components.canvas2d;

switch (canvas.status) {
  case 'fulfilled':
    console.log('Canvas hash:', canvas.value.$hash);
    console.log('Canvas reported a lie:', Boolean(canvas.value.lied));
    break;
  case 'rejected':
    console.warn('Canvas failed:', canvas.error.name, canvas.error.message);
    break;
  case 'unsupported':
    console.info('Canvas is unavailable in this browser');
    break;
  case 'skipped':
    console.info('Canvas was skipped by policy');
    break;
}
```

Core components are attempted rather than deliberately skipped today, but
handling all four statuses keeps code compatible with the public result type.

## Summarize every core component

```ts
import { CORE_COMPONENT_NAMES } from 'libcreep';

for (const name of CORE_COMPONENT_NAMES) {
  const component = result.components[name];

  if (component.status === 'fulfilled') {
    console.log(name, component.status, component.value.$hash);
  } else if (component.status === 'rejected') {
    console.log(name, component.status, component.error.name);
  } else {
    console.log(name, component.status);
  }
}
```

`result.values` is a shortcut when only successful core values matter:

```ts
const platform = result.values.navigator?.platform;
const screenSize = result.values.screen
  ? `${result.values.screen.width}x${result.values.screen.height}`
  : undefined;

console.log({ platform, screenSize });
```

## Read auxiliary results

Auxiliary values are kept separate and are not inputs to `visitorId` or
`rawVisitorId`.

```ts
const devices = result.auxiliary.mediaDevices;
if (devices.status === 'fulfilled') {
  // The library returns sorted kinds only, not labels or device IDs.
  console.log(devices.value); // for example: ['audioinput', 'audiooutput']
}

const webRtc = result.auxiliary.webRtc;
console.log(webRtc.status); // 'skipped' unless includeWebRtc was true
```

## Enable WebRTC after consent

WebRTC collection contacts the configured Google STUN servers and can expose
local or public network information. Put the opt-in behind your application's
privacy or consent flow.

```ts
import { load } from 'libcreep';

const collector = await load();
const enableWebRtcButton = document.querySelector<HTMLButtonElement>(
  '#enable-webrtc-fingerprint',
);

enableWebRtcButton?.addEventListener('click', () => {
  void (async () => {
    const result = await collector.collect({
      includeWebRtc: true,
      timeoutMs: 10_000,
    });

    const webRtc = result.auxiliary.webRtc;
    if (webRtc.status === 'fulfilled') {
      console.log(webRtc.value);
    }
  })().catch(console.error);
});
```

Enabling this option does not itself display a browser permission prompt.

## Cancel or time out collection

An abort signal can cancel a queued or active call. `timeoutMs` starts when the
call begins active collection, after any queue wait.

```ts
import { load } from 'libcreep';

const collector = await load();
const controller = new AbortController();

document.querySelector('#cancel')?.addEventListener('click', () => {
  controller.abort();
});

try {
  const result = await collector.collect({
    signal: controller.signal,
    timeoutMs: 10_000,
  });
  console.log(result.visitorId);
} catch (error) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    console.info('Collection was cancelled');
  } else if (error instanceof DOMException && error.name === 'TimeoutError') {
    console.info('Collection timed out');
  } else {
    throw error;
  }
}
```

If `controller.abort(customReason)` is used, the promise rejects with that
reason rather than necessarily with a `DOMException`.

## Build a custom component hash

`hashComponents()` uses the canonical status/value format behind
`rawVisitorId`. Select only the components relevant to your comparison.

```ts
import { hashComponents } from 'libcreep';

const renderingId = await hashComponents({
  canvas2d: result.components.canvas2d,
  canvasWebgl: result.components.canvasWebgl,
  clientRects: result.components.clientRects,
});

console.log(renderingId);
```

Durations and rejected error details are not included in this hash. Fulfilled
values are, so a custom hash can still be high entropy and sensitive.

## Compare a focused signal group

The library calculates focused hashes only when their source data is
available:

```ts
const { canvas2dText, cssSystem, deviceAndTimezone } = result.focusedHashes;

if (canvas2dText !== undefined) {
  console.log('Canvas text group:', canvas2dText);
}

console.log({ cssSystem, deviceAndTimezone });
```

These groups are convenient comparison signals, not authentication factors.

## Create a diagnostic report

```ts
import { componentsToDebugString } from 'libcreep';

const diagnosticJson = componentsToDebugString(result.components);
console.debug(diagnosticJson);
```

The output preserves timing and captured error details and can contain
sensitive fingerprint data. Redact it before sharing and avoid enabling debug
logging by default in production.

## Use a relocated worker asset

The default worker URL is `worker.js` beside the loaded package entry. If your
deployment moves it, host the worker and all chunks it imports together and
pass a URL explicitly:

```ts
import { load } from 'libcreep';

const collector = await load({
  worker: {
    strategy: 'auto',
    url: new URL('/assets/libcreep/worker.js', window.location.origin),
  },
});

const result = await collector.collect({ timeoutMs: 10_000 });
console.log(result.components.workerScope.status);
```

A same-origin URL is the most portable configuration. Service workers require
same-origin hosting and a secure context (HTTPS or localhost). If every worker
attempt fails, only `workerScope` becomes `unsupported`; the rest of collection
continues.

## Store version context with an identifier

The stable identifier already hashes the algorithm version into its envelope.
Storing the explicit fields alongside it makes migrations and debugging easier:

```ts
const fingerprintReference = {
  algorithmVersion: result.algorithmVersion,
  libraryVersion: result.libraryVersion,
  visitorId: result.visitorId,
};

console.log(fingerprintReference);
```

Package releases can retain an algorithm version when identifier inputs and
canonical behavior do not change. A changed algorithm version denotes a new
identifier namespace.

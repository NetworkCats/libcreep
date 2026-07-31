# Browser runtime and workers

## Runtime requirements

The public module is safe to import during SSR, but collection runs only in a
browser window. `load()` requires:

- `window` and `document`;
- a `document.body` (the loader waits for one when necessary);
- `TextEncoder`;
- `crypto.subtle.digest` for SHA-256.

The production output targets ES2022 and is ESM-only. A secure context is not a
minimum check for `load()`, but service workers and several optional browser
APIs require HTTPS or localhost. Use `isFingerprintingSupported()` for the
minimum check and `getBrowserCapabilities()` for the full set of reported
runtime flags.

The capability helpers report API presence. They cannot predict CSP, origin
rules, browser permissions, extensions, privacy features, or whether a worker
asset is reachable. Individual probes therefore still need status handling.

## DOM measurements

The library contains no report UI. Some probes must create hidden, temporary
DOM because browser layout is the signal being measured:

- DOMRect and emoji geometry;
- font and emoji metrics;
- SVG text geometry;
- CSS and media-query evaluation;
- clean iframe realms used for prototype-tampering checks.

These fixtures do not intentionally render a user-facing interface. Temporary
phantom DOM is removed when collection succeeds, fails, times out, or is
aborted. Browser security rules or settings that block inline styles, frames,
workers, audio, Canvas, WebGL, network requests, or other measured APIs can
reduce the available fingerprint. Affected probes report `unsupported` or a
captured `rejected` error where possible; they do not normally fail the whole
collection.

## Worker asset deployment

The worker-scope component uses a separate module-worker entry. By default its
URL is resolved as `./worker.js` relative to the loaded `libcreep` package
entry. The published entry uses the static `new URL(..., import.meta.url)`
pattern, so Vite-style asset pipelines copy and rewrite the self-contained
worker during an application build.

Configure `worker.url` when deployment moves or renames that asset:

```ts
import { load } from 'libcreep';

const collector = await load({
  worker: {
    url: new URL('/assets/libcreep/worker.js', window.location.origin),
  },
});
```

The worker entry is self-contained. When hosting it manually, the server must
return JavaScript with an appropriate MIME type. Worker CSP and cross-origin
rules still apply; same-origin hosting is the most portable, and service
workers strictly require it.

If the worker asset is missing or every selected worker transport is blocked,
`components.workerScope` is `unsupported`. Navigator and the other components
continue to run.

## Worker selection

The worker strategy controls transport order, not which data fields are
requested from a successful worker:

| Strategy           | Attempt order                        | Origin mutation                       |
| ------------------ | ------------------------------------ | ------------------------------------- |
| `'auto'`           | shared, then dedicated               | none                                  |
| `'dedicated-only'` | dedicated only                       | none                                  |
| `'service-first'`  | service, then shared, then dedicated | temporary service-worker registration |

Shared and dedicated attempts each stop waiting after roughly three seconds.
The service-worker attempt stops after roughly four seconds. A failed attempt
falls through to the next transport; these limits are implementation-level
fallback guards, not a promise for total collection duration. Use
`timeoutMs` for an application deadline.

All three successful transports produce a usable worker scope. The bot rule
`workerScopeIsBlocked` is set only when no transport returns one. Consumers
should still interpret bot signals as heuristics, not verdicts.

## Temporary service worker

Service-worker-first detection is opt-in:

```ts
const collector = await load({
  worker: {
    strategy: 'service-first',
    url: '/assets/libcreep/worker.js',
  },
});
```

The probe creates a randomized scope beneath the worker asset URL, waits for
its worker to activate, requests the worker-scope data, and unregisters only
that registration. Cleanup also runs after failure or cancellation. Existing
application service-worker registrations are not enumerated or unregistered.

Registration requires a secure context, a same-origin script, a valid module
worker response, a scope allowed by the worker script location/headers, and a
CSP that permits it. If any requirement fails, `'service-first'` falls back to
shared and dedicated workers.

Although the registration is short-lived and isolated, it still mutates origin
state, which is why it is not part of the default strategy.

## Passive auxiliary signals

Three auxiliary probes run by default:

- `mediaCapabilities` checks decoding support for a fixed set of audio and
  video codecs.
- `mediaDevices` calls `enumerateDevices()` without requesting camera or
  microphone permission, then returns sorted device kinds only. It does not
  return labels or device IDs.
- `status` collects available battery, storage quota, network, timing, stack,
  passive script resource-size metadata, and client-global information.

Their results live under `result.auxiliary` and are not included in
`visitorId` or `rawVisitorId`. A browser can expose only part of the status
data; unavailable fields use `undefined` or `null` as described by the public
types.

## WebRTC and STUN

WebRTC collection is opt-in:

```ts
const result = await collector.collect({
  includeWebRtc: true,
  timeoutMs: 10_000,
});
```

The probe creates an `RTCPeerConnection`, generates an SDP offer, inspects ICE
candidates, and uses these STUN endpoints:

- `stun:stun4.l.google.com:19302`
- `stun:stun3.l.google.com:19302`

It waits up to roughly three seconds for address information. Depending on the
browser and network policy, the fulfilled value may contain SDP codec and
extension data without a usable address. mDNS masking, VPNs, firewalls,
enterprise policy, and anti-fingerprinting settings can all change the result.

Enabling WebRTC can disclose local or public network information and contacts
external infrastructure. It does not itself present a browser permission
prompt. Applications should enable it only after applying their privacy and
consent requirements.

## Cancellation and cleanup

`load({ signal, timeoutMs })` can cancel document readiness and dynamic runtime
loading. Those options expire when `load()` returns; pass separate controls to
each later `collector.collect()` call.

`signal` cancels both queued and active calls. A queued call rejects promptly
and is removed before its detector run starts. During an active call, the
signal is propagated to long-lived worker, WebRTC, audio, and status work, and
temporary DOM is removed in a final cleanup path.

The caller rejects promptly, while the internal serialization slot remains
occupied until already-started, stateful core detectors settle. This prevents
late detector mutations from overlapping the next collection. Passive
auxiliary operations are not part of that state barrier, so an unresponsive
browser promise cannot permanently block later collections.

`timeoutMs` creates a deadline when the public collection call begins. It
includes one-shot loading, document readiness, time spent waiting in the
module-wide collection queue, and active detector work. A timeout rejects the
call with `TimeoutError`; it is not represented as a component-level error.

## Browser support expectations

The automated browser suite exercises the Playwright versions of Chromium,
Firefox, and WebKit. That verifies the tested builds, not every historical or
embedded browser version. Results can differ by engine, operating system,
privacy mode, extensions, permissions, secure-context rules, CSP, and hardware.

Applications should feature-detect the minimum environment, set a realistic
timeout, and handle every component status. No individual optional detector or
worker transport should be treated as universally available.

See [Examples](./examples.md) for deployment, cancellation, SSR, and result
handling code.

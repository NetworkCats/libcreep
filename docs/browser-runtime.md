# Browser runtime and workers

## DOM measurements

The library contains no report UI. Some probes must create hidden, temporary
DOM because browser layout is the signal being measured:

- DOMRect and emoji geometry;
- font and emoji metrics;
- SVG text geometry;
- CSS and media-query evaluation;
- clean iframe realms used for prototype-tampering checks.

These fixtures don't render a user-facing interface. Strict Content Security
Policy rules that block inline styles, frames, workers, audio, Canvas, or WebGL
can reduce the available result; affected probes report unsupported or captured
errors where possible.

## Worker selection

By default the worker probe tries a shared module worker, then a dedicated
module worker. Shared workers provide better isolation than the dedicated
fallback and don't register persistent origin state.

Service-worker-first detection is opt-in:

```ts
const collector = await load({
  worker: {
    strategy: 'service-first',
    url: '/worker.js',
  },
});
```

Service workers require HTTPS or localhost and a valid JavaScript MIME type.
The probe creates a unique scope beneath the worker asset, waits for that worker
to activate, and unregisters only its temporary registration. It does not
replace or remove an existing application service worker. Host the complete
`dist` output because the worker entry imports an additional packaged chunk.

## Passive auxiliary signals

Media Capabilities, media-device kinds, and browser status run by default.
Media-device enumeration doesn't request camera or microphone permission, so
device labels may be unavailable. Status includes available battery, storage,
network, timing, stack, and client-script information.

## WebRTC

WebRTC collection is opt-in:

```ts
const result = await collector.collect({ includeWebRtc: true });
```

It creates a peer connection and uses the STUN servers configured by the
upstream detector. Collection can take up to roughly three seconds and may
expose local or public address information. Applications should enable it only
with an appropriate privacy and consent basis.

## Browser support

Unsupported APIs don't fail the whole collection. Results depend on browser
engine, privacy mode, extensions, permissions, secure-context rules, and
anti-fingerprinting settings. Automated coverage runs in Chromium, Firefox,
and WebKit.

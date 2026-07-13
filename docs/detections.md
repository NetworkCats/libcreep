# Detection coverage

This manifest is audited against Creep.js source revision
[`10aa6724cd33a1015db1574211890518cd04f0cc`](https://github.com/abrahamjuliot/creepjs/tree/10aa6724cd33a1015db1574211890518cd04f0cc).
See [Upstream adaptation](./upstream.md) for what was retained, changed, and
intentionally omitted.

## How detections are represented

Every name in `CORE_COMPONENT_NAMES` has an entry in `result.components`, even
when its browser API is unavailable. Entries are independent:

- `fulfilled` includes the value, duration, and a component `$hash`;
- `unsupported` means the probe produced no usable value;
- `rejected` captures the probe error while other probes continue;
- `skipped` represents an intentional policy skip. It is currently used for
  opt-in WebRTC, not for the always-attempted core manifest.

`result.values` contains fulfilled core values only. The stable identifier can
use a smaller subset after applying trust and stability rules, so a fulfilled
component is not necessarily retained as a usable `stableComponents` input.

## Core fingerprint

Every core component is attempted by `collector.collect()`.

| Component             | Main signals                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `workerScope`         | Worker navigator, locale, timezone, UA-CH, WebGL, prototype lies |
| `navigator`           | UA, platform, hardware, permissions, plugins, Bluetooth, WebGPU  |
| `windowFeatures`      | Window/global feature keys                                       |
| `headless`            | Headless, stealth, automation, and platform inconsistencies      |
| `htmlElementVersion`  | `HTMLElement` property surface                                   |
| `cssMedia`            | Media preferences, pointer/hover, gamut, screen queries          |
| `css`                 | Computed/system styles, system colors, and system fonts          |
| `screen`              | Screen/available geometry, color/pixel depth, touch, DPR checks  |
| `voices`              | Speech synthesis voices and languages                            |
| `media`               | MIME and playback/recording support                              |
| `canvas2d`            | Image, paint, text, emoji, pixels, and text metrics              |
| `canvasWebgl`         | WebGL images, pixels, extensions, parameters, and GPU            |
| `maths`               | JavaScript math-runtime signatures                               |
| `consoleErrors`       | JavaScript engine error signatures                               |
| `timezone`            | Offset, zone, measured location, and epoch signature             |
| `clientRects`         | Element/range DOMRect and emoji geometry                         |
| `offlineAudioContext` | Audio samples, compressor, analyser, and noise                   |
| `fonts`               | Font availability, metrics, emoji, apps, and platform version    |
| `lies`                | Prototype tampering and API lie records                          |
| `trash`               | Invalid/inconsistent values captured by other probes             |
| `capturedErrors`      | Trusted error names and messages from blocked APIs               |
| `svg`                 | SVG text and geometry measurements                               |
| `resistance`          | Tor, Firefox RFP, Brave, and extension privacy patterns          |
| `intl`                | Locale-sensitive `Intl` constructors and lie checks              |
| `features`            | JavaScript, DOM, CSS, and Window engine/version features         |

Many component interfaces expose common, useful fields explicitly and retain
additional upstream data where a detector is intentionally open-ended. Consult
the generated TypeScript declarations for the field-level value shapes. Always
narrow the component status before reading its value.

## Auxiliary detections

Auxiliary probes live in `result.auxiliary`. They do not contribute to
`visitorId`, `rawVisitorId`, `stableComponents`, or the focused hashes.

| Key                 | Default | Value and behavior                                                                                                                                                      |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mediaCapabilities` | Yes     | Supported fixed audio/video codec configurations, with available `smooth` and `efficient` flags. Returns `unsupported` when `MediaCapabilities.decodingInfo` is absent. |
| `mediaDevices`      | Yes     | Sorted media-device kinds from `enumerateDevices()`. It requests no camera/microphone permission and returns neither labels nor device IDs.                             |
| `status`            | Yes     | Available battery, storage quota, network, timing resolution, stack size, script-source, and client-global information. Individual fields can be `null` or `undefined`. |
| `webRtc`            | No      | SDP codecs/extensions, ICE candidate data, and a network address when available. Contacts external STUN servers and can take roughly three seconds.                     |

Enable WebRTC explicitly:

```ts
const result = await collector.collect({ includeWebRtc: true });

if (result.auxiliary.webRtc.status === 'fulfilled') {
  console.log(result.auxiliary.webRtc.value);
}
```

Without the option, the `webRtc` entry is present with `status: 'skipped'` and
`durationMs: 0`.

## Worker-scope transport policy

Service-worker scope is not a separate result or auxiliary component. It is an
opt-in transport for the core `workerScope` detector. The default `'auto'`
strategy tries shared and then dedicated module workers. The
`'service-first'` strategy temporarily registers a uniquely scoped service
worker before falling back to those default transports:

```ts
const collector = await load({
  worker: { strategy: 'service-first' },
});
```

If every transport fails, `components.workerScope` is `unsupported` while the
remaining core and auxiliary probes continue. See
[Browser runtime and workers](./browser-runtime.md) for deployment and cleanup
details.

## Data sensitivity and stability

The raw component set can expose detailed browser, device, rendering, locale,
font, script, and environment characteristics. Opt-in WebRTC can add network
information. Component hashes and whole-fingerprint identifiers are still
personal or sensitive data in many application contexts even when raw values
are not stored.

Detector availability and values can change with browser updates, operating
system updates, hardware, extensions, privacy settings, permissions, CSP, and
network policy. `visitorId` applies trust and stability filters, but no browser
fingerprint is guaranteed to be permanent or unique. Do not treat the bot mask
as a verdict or any fingerprint as authentication proof.

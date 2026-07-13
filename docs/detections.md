# Detection coverage

This manifest is audited against Creep.js source revision
`10aa6724cd33a1015db1574211890518cd04f0cc`.

## Core fingerprint

Every core component runs when `collector.collect()` is called. A failed or
unavailable browser API is isolated in `components` and doesn't stop other
probes.

| Component             | Main signals                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `workerScope`         | Worker navigator, locale, timezone, UA-CH, WebGL, prototype lies |
| `navigator`           | UA, platform, hardware, permissions, plugins, Bluetooth, WebGPU  |
| `windowFeatures`      | Window/global feature keys                                       |
| `headless`            | Headless, stealth, automation, and platform inconsistencies      |
| `htmlElementVersion`  | `HTMLElement` property surface                                   |
| `cssMedia`            | Media preferences, pointer/hover, gamut, screen queries          |
| `css`                 | Computed/system styles, system colors, and system fonts          |
| `screen`              | Screen geometry, depth, DPR, orientation, viewport, touch        |
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

## Auxiliary detections

| Detection                             | Default | Reason                                                                               |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| Media Capabilities                    | Yes     | Passive API support query; exported by upstream Creep.js                             |
| Media device kinds                    | Yes     | Passive `enumerateDevices()` query; doesn't request permission                       |
| Battery/storage/network/client status | Yes     | Passive local browser state used by the upstream status panel                        |
| WebRTC SDP/STUN/address               | No      | Contacts STUN servers, may reveal network data, and can take seconds                 |
| Service-worker scope                  | No      | Temporary registration mutates origin state; shared/dedicated workers remain default |

Enable WebRTC with `collector.collect({ includeWebRtc: true })`. Enable the
service-worker-first strategy with
`load({worker: {strategy: 'service-first'}})` and host the worker under a valid
scope.

Browser-side implementation details are documented in
[Browser runtime and workers](./browser-runtime.md).

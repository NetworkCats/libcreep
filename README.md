# libcreep

[![CI](https://github.com/NetworkCats/libcreep/actions/workflows/compatibility.yml/badge.svg)](https://github.com/NetworkCats/libcreep/actions/workflows/compatibility.yml)

`libcreep` is a TypeScript browser fingerprinting library based on the Creep.js
detection suite. 

## Why

CreepJS is a research project, and its developer chose not to turn it into a
fingerprinting library. `libcreep` was created to make its code easier for
everyone to use in real world projects.

## Install

```sh
npm install libcreep
```

## Usage

```ts
import { load } from 'libcreep';

const agent = await load();
const result = await agent.get();

console.log(result.visitorId);
console.log(result.values);
```

For one-shot collection:

```ts
import { collect } from 'libcreep';

const result = await collect();
```

Most detections run by default. WebRTC address detection is opt-in because it
contacts STUN servers and may reveal network information:

```ts
const result = await agent.get({ includeWebRTC: true });
```

## Documentation

- [API reference](./docs/api.md)
- [Detection coverage](./docs/detections.md)
- [Architecture](./docs/architecture.md)
- [Browser runtime and workers](./docs/browser-runtime.md)
- [Testing](./docs/testing.md)
- [Upstream adaptation](./docs/upstream.md)

## License

MIT. 

See [LICENSE](./LICENSE) and [NOTICE](./NOTICE). `libcreep` is an
independent adaptation and is not an official CreepJS release.

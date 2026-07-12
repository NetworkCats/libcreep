import assert from 'node:assert/strict';

const libcreep = await import('../dist/index.js');

assert.equal(libcreep.isBrowserEnvironment(), false);
assert.equal(libcreep.isSupported(), false);
assert.equal(typeof libcreep.load, 'function');
assert.equal(typeof libcreep.VERSION, 'string');

await assert.rejects(
  libcreep.load(),
  /libcreep can collect fingerprints only in a browser window/,
);

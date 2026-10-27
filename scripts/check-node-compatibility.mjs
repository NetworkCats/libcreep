import assert from 'node:assert/strict';

const libcreep = await import('../dist/index.js');

assert.equal(libcreep.getBrowserCapabilities().isBrowser, false);
assert.equal(libcreep.isFingerprintingSupported(), false);
assert.equal(libcreep.default, undefined);
assert.equal(typeof libcreep.load, 'function');
assert.equal(typeof libcreep.LIBRARY_VERSION, 'string');

await assert.rejects(libcreep.load(), (error) => {
  assert.ok(error instanceof libcreep.LibCreepError);
  assert.equal(error.code, 'NOT_BROWSER');
  assert.match(error.message, /only in a browser window/);
  return true;
});

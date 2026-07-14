"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(require("path").join(__dirname, "..", "location-spoofer-loon-settings.js"), "utf8");

function run(url, initialStore) {
  const store = Object.assign({}, initialStore || {});
  let result;
  const context = {
    $argument: "configHost=http%3A%2F%2F192.168.31.10%3A3007&configToken=test-token&debug=true",
    $request: { url },
    $persistentStore: {
      read(key) { return store[key] || null; },
      write(value, key) { store[key] = value; return true; }
    },
    $done(value) { result = value; },
    console,
    Date,
    JSON,
    Object,
    String,
    Number,
    Math,
    RegExp,
    encodeURIComponent,
    decodeURIComponent,
    isFinite
  };
  vm.runInNewContext(source, context);
  return { store, response: JSON.parse(result.response.body), status: result.response.status };
}

const saved = run("http://192.168.31.10:3007/loon-sync?lat=39.9042&lng=116.4074&altitude=50&horizontalAccuracy=20&verticalAccuracy=100");
assert.strictEqual(saved.status, 200);
assert.strictEqual(saved.response.success, true);
const savedEntry = JSON.parse(saved.store.location_spoofer_remote_cfg);
assert.strictEqual(savedEntry.url, "http://192.168.31.10:3007/loc.json?token=test-token");
assert.strictEqual(savedEntry.data.latitude, 39.9042);
assert.strictEqual(savedEntry.data.longitude, 116.4074);
assert.strictEqual(savedEntry.data.enabled, true);

const restored = run(
  "http://192.168.31.10:3007/loon-sync?enabled=false&lat=39.9042&lng=116.4074",
  saved.store
);
assert.strictEqual(restored.status, 200);
assert.strictEqual(restored.response.enabled, false);
assert.strictEqual(JSON.parse(restored.store.location_spoofer_remote_cfg).data.enabled, false);

const invalid = run("http://192.168.31.10:3007/loon-sync?lat=200&lng=116.4074");
assert.strictEqual(invalid.status, 400);
assert.strictEqual(invalid.response.success, false);

console.log("Loon instant-sync tests passed");

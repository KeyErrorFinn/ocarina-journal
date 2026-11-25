// Run with node --test scripts/browser-regressions.cjs. Uses synthetic data and the actual transpiled modules.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../app/node_modules/typescript");

function load(file, imports, globals) {
  const source = fs.readFileSync(path.join(__dirname, "../app/src", file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (id) => imports[id] ?? (id === "react/jsx-runtime" ? require("../app/node_modules/react/jsx-runtime") : undefined),
    ...globals,
  });
  return exports;
}
const flush = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve();
};

test("missing game data is not offline, and a late command cannot dismiss the disconnect screen", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const events = {};
  let finish;
  const ipc = load("ipc.ts", { "@tauri-apps/api/core": {}, "@tauri-apps/api/event": {} }, {
    window: { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener: (event, cb) => { events[event] = cb; } },
    document: { hidden: false, addEventListener: () => {} }, AbortController,
    location: { reload: () => {} },
    fetch: async (url) => {
      if (url.endsWith("/get_state")) return { ok: true, status: 200, json: async () => ({}) };
      if (url.endsWith("/late")) return new Promise((resolve) => { finish = resolve; });
      return { ok: false, status: 500, text: async () => "No game files found" };
    },
  });
  const links = [];
  ipc.onLink((link) => links.push(link));
  await assert.rejects(ipc.invoke("get_map_image"), /No game files/);
  await flush();
  assert.deepEqual(links, ["up"]);
  const late = ipc.invoke("late");
  events.offline();
  finish({ ok: true, status: 200, headers: new Map(), json: async () => ({}) });
  await late;
  assert.deepEqual(links, ["up", "down"]);
});

test("remote page detects a hung server without a WebSocket close, then reloads after recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let behaviour = "hang", requests = 0, reloads = 0;
  const events = {};
  const documentEvents = {};
  const fetch = (_url, options) => {
    requests++;
    if (behaviour === "hang") return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(Error("timeout"))));
    return Promise.resolve({ ok: behaviour === "up", status: behaviour === "up" ? 200 : 503, json: async () => ({}) });
  };
  const ipc = load("ipc.ts", { "@tauri-apps/api/core": {}, "@tauri-apps/api/event": {} }, {
    window: { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener: (event, cb) => { events[event] = cb; } },
    document: { hidden: false, addEventListener: (event, cb) => { documentEvents[event] = cb; } },
    fetch, AbortController, location: { reload: () => reloads++ },
  });
  const links = [];
  ipc.onLink((link) => links.push(link));
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(requests, 1);
  t.mock.timers.tick(4000);
  await flush();
  assert.deepEqual(links, ["up", "down"]);
  // A subscriber that mounts after the failure must still see the disconnected state.
  let current;
  ipc.onLink((link) => { current = link; });
  assert.equal(current, "down");
  behaviour = "error";
  t.mock.timers.tick(2500);
  await flush();
  assert.equal(reloads, 0, "HTTP 503 must not reload into the app");
  behaviour = "up";
  events.online();
  await flush();
  assert.equal(reloads, 1);
  assert.equal(links.at(-1), "down", "stale page stays covered until the reload");
});

test("map opening fetches eras and floors without decoding all of them, and retries failures", async () => {
  const calls = [];
  let active = 0, peak = 0, decoded = 0, fail = true;
  class Image {
    naturalWidth = 16;
    naturalHeight = 16;
    set src(_url) { queueMicrotask(() => this.onload()); }
    async decode() { decoded++; }
  }
  const maps = load("maps.ts", {
    "./ipc": { invoke: async (_cmd, { name }) => {
      calls.push(name);
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active--;
      if (name === "floor" && fail) { fail = false; throw Error("temporary failure"); }
      return new ArrayBuffer(1);
    } },
    react: {}, "./report": {},
  }, { Image, Blob, URL: { createObjectURL: () => "blob:synthetic" } });
  const index = { world: { image: "world" }, places: {
    Demo: { child: { image: "child" }, adult: { image: "adult" }, floors: [{ image: "floor" }, { image: null }] },
    Shared: { child: { image: "child" }, adult: null, floors: [] },
  } };
  await Promise.all([maps.preloadAllMapImages(index), maps.preloadAllMapImages(index)]);
  assert.deepEqual([...calls].sort(), ["adult", "child", "floor", "world"]);
  assert.equal(decoded, 0, "background downloads must not decode the catalogue");
  assert.equal(maps.isMapImageReady("child"), false);
  assert.ok(peak <= 2, "background reads must remain bounded");
  await maps.preloadAllMapImages(index);
  assert.equal(calls.filter((name) => name === "floor").length, 2);
  assert.equal(decoded, 0);
  await maps.prepareMapImage("child");
  assert.equal(decoded, 1);
  assert.equal(maps.isMapImageReady("child"), true);
  await maps.preloadAllMapImages(index);
  assert.equal(calls.length, 5, "cached transitions must not request images again");
  for (let n = 0; n < 9; n++) await maps.prepareMapImage(`synthetic-${n}`);
  assert.equal(maps.isMapImageReady("synthetic-0"), false, "decoded catalogue must not grow without a limit");
  const before = calls.length;
  await maps.prepareMapImage("synthetic-0");
  assert.equal(calls.length, before, "evicted decoded pictures reuse encoded bytes without another network request");
});

test("selected maps bypass queued preloads and pause new background work until decoding finishes", async () => {
  for (const selectedName of ["floor", "child"]) {
    const calls = [];
    const downloads = new Map();
    const decodes = [];
    class Image {
      naturalWidth = 16;
      naturalHeight = 16;
      set src(_url) { queueMicrotask(() => this.onload()); }
      decode() { return new Promise((resolve) => decodes.push(resolve)); }
    }
    const maps = load("maps.ts", {
      react: {}, "./report": {},
      "./ipc": { invoke: (_cmd, { name }) => {
        calls.push(name);
        return new Promise((resolve) => downloads.set(name, () => resolve(new ArrayBuffer(1))));
      } },
    }, { Image, Blob, URL: { createObjectURL: () => "blob:synthetic" } });
    const index = { world: { image: "world" }, places: {
      Demo: { child: { image: "child" }, adult: { image: "adult" }, floors: [{ image: "floor" }] },
    } };
    const warming = maps.preloadAllMapImages(index);
    assert.deepEqual(calls, ["world", "child"]);
    const selected = maps.prepareMapImage(selectedName);
    assert.equal(calls.filter((name) => name === selectedName).length, 1, "selection starts immediately or shares the active transfer");
    downloads.get("world")();
    downloads.get("child")();
    await flush();
    assert.equal(calls.includes("adult"), false, "completed background transfers must not start more work ahead of the selection");
    if (selectedName === "floor") downloads.get("floor")();
    await flush();
    assert.equal(calls.includes("adult"), false, "background stays paused during selected-map decoding");
    decodes.splice(0).forEach((resolve) => resolve());
    await selected;
    await flush();
    assert.equal(calls.includes("adult"), true, "background resumes automatically after the selected map is ready");
    for (const name of ["adult", "floor"]) downloads.get(name)?.();
    await warming;
    assert.equal(calls.filter((name) => name === selectedName).length, 1, "queued prefetch must not redownload the selected map");
  }
});

test("MapScreen opens before the catalogue is decoded, and a prepared destination has no reading message", async () => {
  const React = require("../app/node_modules/react");
  const { renderToStaticMarkup } = require("../app/node_modules/react-dom/server");
  const decodes = [];
  let reads = 0;
  class Image {
    naturalWidth = 16;
    naturalHeight = 16;
    set src(_url) { queueMicrotask(() => this.onload()); }
    decode() { return new Promise((resolve) => decodes.push(resolve)); }
  }
  const index = { world: { image: "world", width: 16, height: 16, labels: { Demo: [0, 0] } }, places: {
    Demo: { center: [0, 0], span: 100, dungeon: false, within: null, floors: [],
      child: { image: "child", exits: [], mask: null }, adult: { image: "adult", exits: [], mask: null } },
  } };
  const reportHelpers = load("report.ts", {}, {});
  const maps = load("maps.ts", {
    react: React, "./report": reportHelpers,
    "./ipc": { invoke: async (cmd) => {
      if (cmd === "get_map_index") return index;
      reads++;
      return new ArrayBuffer(1);
    } },
  }, { Image, Blob, URL: { createObjectURL: () => "blob:synthetic" } });
  await maps.loadIndex();
  const empty = () => null;
  let pickLocation;
  const stateChanges = [];
  const runtime = require("../app/node_modules/react/jsx-runtime");
  const recordElement = (method) => (type, props, ...rest) => {
    if (typeof type === "function" && type.name === "WorldMap") pickLocation = props.onPick;
    return runtime[method](type, props, ...rest);
  };
  const observedReact = { ...React, useState(initial) {
    const [value, set] = React.useState(initial);
    return [value, (next) => { stateChanges.push(next); set(next); }];
  } };
  const { MapScreen } = load("screens/MapScreen.tsx", {
    "react/jsx-runtime": { ...runtime, jsx: recordElement("jsx"), jsxs: recordElement("jsxs") },
    react: observedReact, "../maps": maps, "../report": reportHelpers,
    "../components/icons": new Proxy({}, { get: () => empty }),
    "../components/art": new Proxy({}, { get: () => empty }),
    "../components/Maze": { Maze: empty }, "../hints": { hintsFor: () => [] },
    "../components/chrome": new Proxy({}, { get: () => empty }),
    "../landmarks": { LAND_KINDS: [], LANDMARK: {}, useLandmarks: () => [] },
    "../data/content": { WORLD: {} }, "../store": { useLocal: (_key, initial) => React.useState(initial) },
  }, {});
  const report = { categories: [{ id: "chests", have: 0, of: 1, entries: [
    { id: "synthetic", area: "Demo", label: "Synthetic chest", have: 0, of: 1, note: null },
  ] }] };
  const render = (start) => renderToStaticMarkup(React.createElement(MapScreen, { report, start, game: null, connected: false, onHome: () => {} }));
  await maps.preloadAllMapImages(index);
  assert.equal(maps.isMapImageReady("child"), false);
  assert.equal(decodes.length, 0, "opening Map must not decode every picture");
  const worldLoading = maps.prepareMapImage("world");
  await flush();
  decodes.splice(0).forEach((resolve) => resolve());
  await worldLoading;
  const world = render();
  assert.doesNotMatch(world, /Preparing your maps/);
  assert.match(world, /class="plaque/, "locations are selectable while other images remain undecoded");
  // Prepare just the destination. A navigation must wait for its decode, with no new network read.
  assert.equal(typeof pickLocation, "function");
  const preparing = pickLocation("Demo");
  await flush();
  assert.equal(stateChanges.includes("Demo"), false, "current map must stay visible until the destination is decoded");
  assert.equal(decodes.length, 1);
  decodes.splice(0).forEach((resolve) => resolve());
  await preparing;
  assert.equal(maps.isMapImageReady("child"), true);
  assert.equal(stateChanges.includes("Demo"), true, "navigation commits after decoding");
  const area = render("Demo");
  assert.match(area, /pz-img/);
  assert.doesNotMatch(area, /Reading the map/);
  assert.equal(reads, 3, "rendering the destination must reuse the decoded pictures");
});

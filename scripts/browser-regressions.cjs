// Run with node --test scripts/browser-regressions.cjs. Uses synthetic data and the actual transpiled modules.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../app/node_modules/typescript");

function load(file, imports, globals) {
  const source = fs.readFileSync(
    path.join(__dirname, "../app/src", file),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (id) =>
      imports[id] ??
      (id === "react/jsx-runtime"
        ? require("../app/node_modules/react/jsx-runtime")
        : undefined),
    ...globals,
  });
  return exports;
}
const flush = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve();
};

test("era totals exclude the other age but retain shared and unspecified placements", () => {
  const { reportForEra, areaRows, entriesFor, otherEraNeeded } = load(
    "report.ts",
    {},
    {},
  );
  const entries = [
    { id: "child", area: "SyntheticField", have: 0, of: 1, eras: ["child"] },
    { id: "adult", area: "SyntheticField", have: 1, of: 1, eras: ["adult"] },
    {
      id: "shared",
      area: "SyntheticField",
      have: 0,
      of: 1,
      eras: ["child", "adult"],
    },
    { id: "unknown", area: "SyntheticField", have: 0, of: 1 },
  ];
  const report = { categories: [{ id: "chests", have: 1, of: 4, entries }] };
  const child = reportForEra(report, "child"),
    adult = reportForEra(report, "adult");
  assert.equal(
    entriesFor(child, "SyntheticField")
      .map((e) => e.id)
      .join(),
    "child,shared,unknown",
  );
  assert.equal(
    entriesFor(adult, "SyntheticField")
      .map((e) => e.id)
      .join(),
    "adult,shared,unknown",
  );
  assert.equal(areaRows(child)[0].have, 0);
  assert.equal(areaRows(child)[0].of, 3);
  assert.equal(areaRows(adult)[0].have, 1);
  assert.equal(
    report.categories[0].entries.length,
    4,
    "era view must not change the global report",
  );
  assert.equal(
    otherEraNeeded(entries, "child"),
    0,
    "completed, shared and unknown items must not suggest switching",
  );
  assert.equal(otherEraNeeded(entries, "adult"), 1);
  assert.equal(otherEraNeeded([{ ...entries[1], have: 0 }], "child"), 1);
});

test("desktop and browser share tile acknowledgements, merge progress and recover pending changes", async () => {
  const { createProgressStore } = load(
    "sharedProgress.ts",
    { "./ipc": {} },
    {},
  );
  let server = { revision: 0, values: {} },
    online = true;
  const stores = [],
    retries = [],
    writes = [];
  const send = async (change) => {
    if (!online) throw Error("offline");
    writes.push(change);
    const old = server.values[change.key] ?? {};
    const next = { ...old };
    for (const [key, value] of Object.entries(change.value)) {
      if (!change.initialize || !(key in next)) next[key] = value;
    }
    server = {
      revision: server.revision + 1,
      values: { ...server.values, [change.key]: next },
    };
    stores.forEach((store) => store.receive(server));
    return server;
  };
  const desktop = createProgressStore(
    send,
    () => {},
    (fn) => retries.push(fn),
  );
  const browser = createProgressStore(
    send,
    () => {},
    (fn) => retries.push(fn),
  );
  stores.push(desktop, browser);
  desktop.read("home.seen", { map: "old", foes: "old" });
  desktop.receive(server);
  await flush();
  browser.read("home.seen", { map: "stale" });
  browser.receive(server);
  await flush();
  assert.equal(
    browser.read("home.seen", {}).map,
    "old",
    "migration cannot replace the desktop's acknowledgement",
  );
  desktop.update("home.seen", { map: "new", foes: "old" });
  await flush();
  assert.equal(
    browser.read("home.seen", {}).map,
    "new",
    "opening a tile clears its dot on the other screen",
  );
  browser.update("home.seen", { map: "new", foes: "new" });
  await flush();
  assert.equal(
    desktop.read("home.seen", {}).foes,
    "new",
    "synchronisation also works from browser to desktop",
  );
  assert.equal(
    Object.keys(writes.at(-1).value).join(),
    "foes",
    "send only changed tile entries",
  );
  desktop.receive({ revision: 0, values: {} });
  assert.equal(
    desktop.read("home.seen", {}).map,
    "new",
    "late snapshots cannot undo acknowledgements",
  );
  online = false;
  browser.update("home.seen", { map: "offline", foes: "new" });
  await flush();
  online = true;
  retries.splice(0).forEach((fn) => fn());
  await flush();
  assert.equal(desktop.read("home.seen", {}).map, "offline");
});

test("QR pairing page checks an existing session before submitting the scanned code", async () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../crates/oj-remote/src/pair.js"),
    "utf8",
  );
  for (const status of [204, 401, "network error", "timeout"]) {
    const elements = {};
    for (const id of [
      "code",
      "pin",
      "next",
      "go",
      "again",
      "s1",
      "s2",
      "err",
    ]) {
      elements[id] = {
        value: "",
        hidden: id === "s2",
        addEventListener: () => {},
        focus: () => {},
      };
    }
    const requests = [];
    let reloads = 0,
      removed = 0;
    let expire;
    vm.runInNewContext(source, {
      document: { getElementById: (id) => elements[id] },
      location: {
        search: "?code=ABCD-EFGH",
        pathname: "/",
        hash: "",
        reload: () => reloads++,
      },
      history: { replaceState: () => removed++ },
      URLSearchParams,
      AbortController,
      setTimeout: (fn, ms) => {
        assert.equal(ms, 4000);
        expire = fn;
      },
      clearTimeout: () => {},
      fetch: async (url, options) => {
        requests.push({ url, options });
        if (url === "/api/session") {
          assert.equal(options.credentials, "same-origin");
          assert.equal(options.cache, "no-store");
          if (status === "network error") throw Error("offline");
          if (status === "timeout")
            return new Promise((_, reject) =>
              options.signal.addEventListener("abort", () =>
                reject(Error("timeout")),
              ),
            );
          return { status };
        }
        return { ok: true };
      },
    });
    if (status === "timeout") expire();
    await flush();
    assert.equal(requests[0].url, "/api/session");
    if (status === 204) {
      assert.equal(reloads, 1);
      assert.equal(
        requests.length,
        1,
        "paired arrival must not consume a pairing attempt",
      );
      assert.equal(
        removed,
        0,
        "the app removes the QR code after a successful reload",
      );
    } else {
      assert.equal(
        reloads,
        0,
        "unpaired arrivals must not enter a reload loop",
      );
      assert.equal(requests.length, 2);
      assert.equal(requests[1].url, "/pair");
      assert.equal(JSON.parse(requests[1].options.body).code, "ABCDEFGH");
      assert.equal(elements.s1.hidden, true);
      assert.equal(elements.s2.hidden, false);
      assert.equal(removed, 1);
    }
  }
});

test("missing game data is not offline, and a late command cannot dismiss the disconnect screen", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const events = {};
  let finish;
  const ipc = load(
    "ipc.ts",
    { "@tauri-apps/api/core": {}, "@tauri-apps/api/event": {} },
    {
      window: {
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        addEventListener: (event, cb) => {
          events[event] = cb;
        },
      },
      document: { hidden: false, addEventListener: () => {} },
      AbortController,
      location: { reload: () => {} },
      fetch: async (url) => {
        if (url.endsWith("/get_state"))
          return { ok: true, status: 200, json: async () => ({}) };
        if (url.endsWith("/late"))
          return new Promise((resolve) => {
            finish = resolve;
          });
        return {
          ok: false,
          status: 500,
          text: async () => "No game files found",
        };
      },
    },
  );
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
  let behaviour = "hang",
    requests = 0,
    reloads = 0;
  const events = {};
  const documentEvents = {};
  const fetch = (_url, options) => {
    requests++;
    if (behaviour === "hang")
      return new Promise((_, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(Error("timeout")),
        ),
      );
    return Promise.resolve({
      ok: behaviour === "up",
      status: behaviour === "up" ? 200 : 503,
      json: async () => ({}),
    });
  };
  const ipc = load(
    "ipc.ts",
    { "@tauri-apps/api/core": {}, "@tauri-apps/api/event": {} },
    {
      window: {
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        addEventListener: (event, cb) => {
          events[event] = cb;
        },
      },
      document: {
        hidden: false,
        addEventListener: (event, cb) => {
          documentEvents[event] = cb;
        },
      },
      fetch,
      AbortController,
      location: { reload: () => reloads++ },
    },
  );
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
  ipc.onLink((link) => {
    current = link;
  });
  assert.equal(current, "down");
  behaviour = "error";
  t.mock.timers.tick(2500);
  await flush();
  assert.equal(reloads, 0, "HTTP 503 must not reload into the app");
  behaviour = "up";
  events.online();
  await flush();
  assert.equal(reloads, 1);
  assert.equal(
    links.at(-1),
    "down",
    "stale page stays covered until the reload",
  );
});

test("map opening fetches eras and floors without decoding all of them, and retries failures", async () => {
  const calls = [];
  let active = 0,
    peak = 0,
    decoded = 0,
    fail = true;
  class Image {
    naturalWidth = 16;
    naturalHeight = 16;
    set src(_url) {
      queueMicrotask(() => this.onload());
    }
    async decode() {
      decoded++;
    }
  }
  const maps = load(
    "maps.ts",
    {
      "./ipc": {
        invoke: async (_cmd, { name }) => {
          calls.push(name);
          peak = Math.max(peak, ++active);
          await Promise.resolve();
          active--;
          if (name === "floor" && fail) {
            fail = false;
            throw Error("temporary failure");
          }
          return new ArrayBuffer(1);
        },
      },
      react: {},
      "./report": {},
    },
    { Image, Blob, URL: { createObjectURL: () => "blob:synthetic" } },
  );
  const index = {
    world: { image: "world" },
    places: {
      Demo: {
        child: { image: "child" },
        adult: { image: "adult" },
        floors: [{ image: "floor" }, { image: null }],
      },
      Shared: { child: { image: "child" }, adult: null, floors: [] },
    },
  };
  await Promise.all([
    maps.preloadAllMapImages(index),
    maps.preloadAllMapImages(index),
  ]);
  assert.deepEqual([...calls].sort(), ["adult", "child", "floor", "world"]);
  assert.equal(
    decoded,
    0,
    "background downloads must not decode the catalogue",
  );
  assert.equal(maps.isMapImageReady("child"), false);
  assert.ok(peak <= 2, "background reads must remain bounded");
  await maps.preloadAllMapImages(index);
  assert.equal(calls.filter((name) => name === "floor").length, 2);
  assert.equal(decoded, 0);
  await maps.prepareMapImage("child");
  assert.equal(decoded, 1);
  assert.equal(maps.isMapImageReady("child"), true);
  await maps.preloadAllMapImages(index);
  assert.equal(
    calls.length,
    5,
    "cached transitions must not request images again",
  );
  for (let n = 0; n < 9; n++) await maps.prepareMapImage(`synthetic-${n}`);
  assert.equal(
    maps.isMapImageReady("synthetic-0"),
    false,
    "decoded catalogue must not grow without a limit",
  );
  const before = calls.length;
  await maps.prepareMapImage("synthetic-0");
  assert.equal(
    calls.length,
    before,
    "evicted decoded pictures reuse encoded bytes without another network request",
  );
});

test("selected maps bypass queued preloads and pause new background work until decoding finishes", async () => {
  for (const selectedName of ["floor", "child"]) {
    const calls = [];
    const downloads = new Map();
    const decodes = [];
    class Image {
      naturalWidth = 16;
      naturalHeight = 16;
      set src(_url) {
        queueMicrotask(() => this.onload());
      }
      decode() {
        return new Promise((resolve) => decodes.push(resolve));
      }
    }
    const maps = load(
      "maps.ts",
      {
        react: {},
        "./report": {},
        "./ipc": {
          invoke: (_cmd, { name }) => {
            calls.push(name);
            return new Promise((resolve) =>
              downloads.set(name, () => resolve(new ArrayBuffer(1))),
            );
          },
        },
      },
      { Image, Blob, URL: { createObjectURL: () => "blob:synthetic" } },
    );
    const index = {
      world: { image: "world" },
      places: {
        Demo: {
          child: { image: "child" },
          adult: { image: "adult" },
          floors: [{ image: "floor" }],
        },
      },
    };
    const warming = maps.preloadAllMapImages(index);
    assert.deepEqual(calls, ["world", "child"]);
    const selected = maps.prepareMapImage(selectedName);
    assert.equal(
      calls.filter((name) => name === selectedName).length,
      1,
      "selection starts immediately or shares the active transfer",
    );
    downloads.get("world")();
    downloads.get("child")();
    await flush();
    assert.equal(
      calls.includes("adult"),
      false,
      "completed background transfers must not start more work ahead of the selection",
    );
    if (selectedName === "floor") downloads.get("floor")();
    await flush();
    assert.equal(
      calls.includes("adult"),
      false,
      "background stays paused during selected-map decoding",
    );
    decodes.splice(0).forEach((resolve) => resolve());
    await selected;
    await flush();
    assert.equal(
      calls.includes("adult"),
      true,
      "background resumes automatically after the selected map is ready",
    );
    for (const name of ["adult", "floor"]) downloads.get(name)?.();
    await warming;
    assert.equal(
      calls.filter((name) => name === selectedName).length,
      1,
      "queued prefetch must not redownload the selected map",
    );
  }
});

test("MapScreen opens before the catalogue is decoded, and a prepared destination has no reading message", async () => {
  const React = require("../app/node_modules/react");
  const {
    renderToStaticMarkup,
  } = require("../app/node_modules/react-dom/server");
  const decodes = [];
  let reads = 0;
  class Image {
    naturalWidth = 16;
    naturalHeight = 16;
    set src(_url) {
      queueMicrotask(() => this.onload());
    }
    decode() {
      return new Promise((resolve) => decodes.push(resolve));
    }
  }
  const index = {
    world: { image: "world", width: 16, height: 16, labels: { Demo: [0, 0] } },
    places: {
      Demo: {
        center: [0, 0],
        span: 100,
        dungeon: false,
        within: null,
        floors: [],
        child: { image: "child", exits: [], mask: null },
        adult: { image: "adult", exits: [], mask: null },
      },
    },
  };
  const reportHelpers = load("report.ts", {}, {});
  const maps = load(
    "maps.ts",
    {
      react: React,
      "./report": reportHelpers,
      "./ipc": {
        invoke: async (cmd) => {
          if (cmd === "get_map_index") return index;
          reads++;
          return new ArrayBuffer(1);
        },
      },
    },
    { Image, Blob, URL: { createObjectURL: () => "blob:synthetic" } },
  );
  await maps.loadIndex();
  const empty = () => null;
  let pickLocation;
  const stateChanges = [];
  const runtime = require("../app/node_modules/react/jsx-runtime");
  const recordElement =
    (method) =>
    (type, props, ...rest) => {
      if (typeof type === "function" && type.name === "WorldMap")
        pickLocation = props.onPick;
      return runtime[method](type, props, ...rest);
    };
  const observedReact = {
    ...React,
    useState(initial) {
      const [value, set] = React.useState(initial);
      return [
        value,
        (next) => {
          stateChanges.push(next);
          set(next);
        },
      ];
    },
  };
  let savedEra = "child";
  const { MapScreen } = load(
    "screens/MapScreen.tsx",
    {
      "react/jsx-runtime": {
        ...runtime,
        jsx: recordElement("jsx"),
        jsxs: recordElement("jsxs"),
      },
      react: observedReact,
      "../maps": maps,
      "../report": reportHelpers,
      "../components/icons": new Proxy({}, { get: () => empty }),
      "../components/art": new Proxy({}, { get: () => empty }),
      "../components/Maze": { Maze: empty },
      "../hints": { hintsFor: () => [] },
      "../components/chrome": new Proxy({}, { get: () => empty }),
      "../landmarks": { LAND_KINDS: [], LANDMARK: {}, useLandmarks: () => [] },
      "../beans": {
        useBeanSoil: () => [],
        beanName: () => "",
        rideArrows: () => [],
      },
      "../markerSpread": load("markerSpread.ts", {}, {}),
      "../data/content": { WORLD: {} },
      "../store": {
        useLocal: (key, initial) =>
          React.useState(
            key === "map.prefs" ? { ...initial, era: savedEra } : initial,
          ),
        useShared: (_key, initial) => React.useState(initial),
      },
    },
    {},
  );
  const report = {
    categories: [
      {
        id: "chests",
        have: 0,
        of: 1,
        entries: [
          {
            id: "synthetic",
            area: "Demo",
            label: "Synthetic chest",
            have: 0,
            of: 1,
            note: null,
          },
          {
            id: "young",
            area: "Demo",
            label: "Synthetic child chest",
            have: 0,
            of: 1,
            note: null,
            eras: ["child"],
          },
          {
            id: "grown",
            area: "Demo",
            label: "Synthetic adult chest",
            have: 0,
            of: 1,
            note: null,
            eras: ["adult"],
          },
        ],
      },
    ],
  };
  const render = (start) =>
    renderToStaticMarkup(
      React.createElement(MapScreen, {
        report,
        start,
        game: null,
        connected: false,
        onHome: () => {},
      }),
    );
  await maps.preloadAllMapImages(index);
  assert.equal(maps.isMapImageReady("child"), false);
  assert.equal(decodes.length, 0, "opening Map must not decode every picture");
  const worldLoading = maps.prepareMapImage("world");
  await flush();
  decodes.splice(0).forEach((resolve) => resolve());
  await worldLoading;
  const world = render();
  assert.match(world, /aria-label="World map era"/);
  assert.match(world, /aria-pressed="true">Child/);
  assert.match(world, /Child\/Adult progress<br\s*\/>are combined/);
  assert.doesNotMatch(world, /Preparing your maps/);
  assert.match(
    world,
    /class="plaque/,
    "locations are selectable while other images remain undecoded",
  );
  // Prepare just the destination. A navigation must wait for its decode, with no new network read.
  assert.equal(typeof pickLocation, "function");
  const preparing = pickLocation("Demo");
  await flush();
  assert.equal(
    stateChanges.includes("Demo"),
    false,
    "current map must stay visible until the destination is decoded",
  );
  assert.equal(decodes.length, 1);
  decodes.splice(0).forEach((resolve) => resolve());
  await preparing;
  assert.equal(maps.isMapImageReady("child"), true);
  assert.equal(
    stateChanges.includes("Demo"),
    true,
    "navigation commits after decoding",
  );
  const area = render("Demo");
  assert.match(area, /pz-img/);
  assert.doesNotMatch(area, /Reading the map/);
  assert.match(area, /1 collectible still<br\s*\/>needed as <b>Adult<\/b>/);
  savedEra = "adult";
  const adultPreparing = maps.prepareMapImage("adult");
  await flush();
  decodes.splice(0).forEach((resolve) => resolve());
  await adultPreparing;
  assert.match(
    render("Demo"),
    /1 collectible still<br\s*\/>needed as <b>Child<\/b>/,
  );
  assert.equal(
    reads,
    3,
    "rendering the destination must reuse the decoded pictures",
  );
});

test("bean soil names say which spot when an area holds two", () => {
  const React = require("../app/node_modules/react");
  const report = load("report.ts", {}, {});
  const beans = load(
    "beans.ts",
    { react: React, "./ipc": { invoke: async () => [] }, "./report": report },
    {},
  );
  const spot = (id) => ({
    id,
    area: "Area",
    pos: [0, 0, 0],
    path: [],
    stops: [],
    length: 0,
  });
  const all = [spot("LostWood01"), spot("LostWood02"), spot("Graveyard")];
  assert.equal(beans.beanName(all[0], all), "Lost Woods 1");
  assert.equal(beans.beanName(all[1], all), "Lost Woods 2");
  assert.equal(beans.beanName(all[2], all), "Graveyard");
});

test("long scrub names are shortened, and the Hyrule Field chest and scrub explain what they need", () => {
  const tips = load("data/tips.ts", {}, {});
  const hints = load("hints.ts", { "./data/tips": tips }, {});
  assert.equal(
    hints.shortLabel(
      "Heart piece 4 in Hyrule Field (Hyrule Field Enemy Scrub Business Heart Piece 01)",
    ),
    "Heart piece 4 in Hyrule Field (Business Scrub)",
  );
  for (const same of [
    "Heart piece 5 in Hyrule Field (Mini Game Fishing Get Heart Piece)",
    "Chest 2 in Hyrule Field (Piece of Heart)",
    "Gold Skulltula 1 in Hyrule Field (at 1, 2, 3)",
  ]) {
    assert.equal(hints.shortLabel(same), same);
  }
  const entry = (id) => ({
    id,
    label: "x",
    area: "HyruleField",
    have: 0,
    of: 1,
    note: null,
  });
  const say = (id, kind) =>
    hints
      .hintsFor(entry(id), kind, null, [])
      .map((h) => `${h.title}: ${h.text}`)
      .join(" ");
  const chest = say("chests/HyruleField/2", "chests");
  assert.match(chest, /no key/i);
  assert.match(chest, /note/i);
  assert.equal(
    say("heart-pieces/HyruleField/2", "heart-pieces"),
    chest,
    "the chest counted as a heart piece says the same",
  );
  assert.match(
    say("heart-pieces/HyruleField/4", "heart-pieces"),
    /Sell somethin/,
  );
});

test("a ride's arrows follow its route in order and point the way it goes", () => {
  const React = require("../app/node_modules/react");
  const report = load("report.ts", {}, {});
  const beans = load(
    "beans.ts",
    { react: React, "./ipc": { invoke: async () => [] }, "./report": report },
    {},
  );
  const proj = (x, z) => ({ left: x, top: z });
  // a route that runs east for 100 m, then south for 100 m
  const path = [
    [0, 0, 0],
    [100, 0, 0],
    [100, 0, 100],
  ];
  const arrows = beans.rideArrows(path, proj, 1);
  assert.ok(arrows.length >= 5);
  assert.ok(Math.abs(arrows[0].deg) < 1, "the first arrow points east");
  assert.ok(
    Math.abs(arrows[arrows.length - 1].deg - 90) < 1,
    "the last points south",
  );
  assert.ok(
    arrows[0].left < arrows[arrows.length - 1].left ||
      arrows[0].top < arrows[arrows.length - 1].top,
  );
  // a stretched picture (taller than wide) still gives the true on-screen angle for a diagonal
  const diagonal = beans.rideArrows(
    [
      [0, 0, 0],
      [50, 0, 50],
    ],
    proj,
    2,
  )[0];
  assert.ok(Math.abs(diagonal.deg - (Math.atan2(2, 1) * 180) / Math.PI) < 1);
});

test("markers that cover each other are grouped in a row, and zooming in pulls them apart", () => {
  const spread = load("markerSpread.ts", {}, {});
  const spots = [
    { key: "chest", left: 50, top: 50 },
    { key: "heart", left: 50, top: 50 },
    { key: "far", left: 90, top: 10 },
    { key: "near", left: 51, top: 50 },
  ];
  // 400 px picture, 15 px em: "near" is 4 px away, so three markers share a group
  const small = spread.spreadMarkers(spots, 400, 1, 15);
  assert.equal(small.groups.length, 1);
  assert.equal(small.groups[0].n, 3);
  assert.equal(small.shift.has("far"), false);
  const xs = ["chest", "heart", "near"].map(
    (k) =>
      small.shift.get(k).dx +
      { chest: 50, heart: 50, near: 51 }[k] * (400 / 15 / 100),
  );
  xs.sort((a, b) => a - b);
  assert.ok(
    xs[1] - xs[0] >= 2 - 1e-6 && xs[2] - xs[1] >= 2 - 1e-6,
    "markers in a group are at least two em apart",
  );
  // the same markers on a picture 20 times wider are no longer close
  assert.equal(
    spread.spreadMarkers(spots, 8000, 1, 15).groups.length,
    1,
    "only the two on the very same spot stay together",
  );
  assert.equal(spread.spreadMarkers(spots, 8000, 1, 15).groups[0].n, 2);
});

test("a hand-confirmed age fills in only where the game gives none, and drives the switch-age reminder", () => {
  const report = load("report.ts", {}, {});
  const { withEras } = load(
    "eraOverrides.ts",
    { "./data/eras": load("data/eras.ts", {}, {}) },
    {},
  );
  const entry = (id, have, eras) => ({
    id,
    label: id,
    area: "HyruleCastle",
    have,
    of: 1,
    note: null,
    ...(eras ? { eras } : {}),
  });
  const file = (entries) => ({
    modified_ms: 1,
    report: {
      categories: [
        { id: "skulltulas", title: "", counted: true, have: 0, of: 0, entries },
      ],
    },
  });
  const castle = "skulltulas/HyruleCastle/2";
  const filled = withEras(
    file([entry(castle, 0), entry("skulltulas/HyruleCastle/1", 1)]),
  ).report.categories[0].entries;
  assert.equal(JSON.stringify(filled[0].eras), JSON.stringify(["child"]));
  assert.equal(filled[1].eras, undefined, "other entries stay unspecified");
  assert.equal(
    JSON.stringify(
      withEras(file([entry(castle, 0, ["adult"])])).report.categories[0]
        .entries[0].eras,
    ),
    JSON.stringify(["adult"]),
    "the game's own age wins",
  );
  assert.equal(
    report.otherEraNeeded(filled, "adult"),
    1,
    "as Adult Link there is one left that needs Child Link",
  );
  assert.equal(report.otherEraNeeded(filled, "child"), 0);
  // the child-only one never shows on the Adult map, so "incomplete only" can't bring it back; the unspecified one stays
  const both = withEras(file([entry(castle, 0), entry("skulltulas/HyruleCastle/1", 0)])).report;
  const ids = (era) => report.reportForEra(both, era).categories[0].entries.map((e) => e.id).sort().join(",");
  assert.equal(ids("adult"), "skulltulas/HyruleCastle/1");
  assert.equal(ids("child"), ["skulltulas/HyruleCastle/1", castle].sort().join(","));
  const done = withEras(file([entry(castle, 1)])).report.categories[0].entries;
  assert.equal(
    report.otherEraNeeded(done, "adult"),
    0,
    "nothing to ask once it is collected",
  );
});

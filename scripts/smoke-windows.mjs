// Starts the release build on Windows with no game, saves or user data, and checks the page under the app's real
// Content Security Policy (which `tauri dev` does not enforce). Usage: node scripts/smoke-windows.mjs <app.exe>
// Reads the page over WebView2's local debugging port (127.0.0.1 only) and changes nothing.
// The app must have been built with app/src-tauri/tauri.smoke.conf.json (which opens the debugging port); the
// environment variable set below does the same on a runtime that honours it, and is how a plain build is tried locally.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exe = process.argv[2];
if (!exe) throw new Error("usage: node scripts/smoke-windows.mjs <app.exe>");
const root = mkdtempSync(join(tmpdir(), "oj-win-smoke-"));
const env = {
  ...process.env,
  LOCALAPPDATA: join(root, "local"),
  APPDATA: join(root, "roaming"),
  OJ_GAME: join(root, "missing-game"),
  OJ_SAVE_DIR: join(root, "missing-save"),
  WEBVIEW2_USER_DATA_FOLDER: join(root, "webview"),
  // Port 0: the browser picks a free one and writes it to DevToolsActivePort in its profile folder.
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=0",
};
delete env.OJ_REPORT;
delete env.OJ_TEST_REAL;

const app = spawn(exe, [], { env, stdio: ["ignore", "inherit", "inherit"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The profile folder holds DevToolsActivePort (port on the first line) once the browser's debugging port is open.
const profileFiles = () => {
  try {
    return readdirSync(env.WEBVIEW2_USER_DATA_FOLDER, { recursive: true })
      .filter((f) => /DevToolsActivePort|\.lock$/i.test(String(f)))
      .map(String);
  } catch {
    return [];
  }
};
const activePort = () => {
  for (const f of profileFiles().filter((f) => /DevToolsActivePort$/.test(f))) {
    const port = Number.parseInt(
      readFileSync(join(env.WEBVIEW2_USER_DATA_FOLDER, f), "utf8").split(
        /\r?\n/,
      )[0],
      10,
    );
    if (port > 0) return port;
  }
  return 0;
};
// Ports that WebView2's own processes are listening on (the browser's debugging port is one of them), in case the
// profile folder isn't where DevToolsActivePort ends up.
const listeningPorts = () => {
  // Another development copy may have its own debugging port. Inspect only this test app's descendants.
  const out =
    spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `$all = @(Get-CimInstance Win32_Process); $owned = @(${app.pid}); do { $next = @($all | Where-Object { $_.ParentProcessId -in $owned -and $_.ProcessId -notin $owned }); $owned += @($next.ProcessId) } while ($next.Count); $all | Where-Object { $_.ProcessId -in $owned -and $_.Name -eq 'msedgewebview2.exe' } | ForEach-Object ProcessId`,
      ],
      { encoding: "utf8" },
    ).stdout ?? "";
  const pids = new Set(out.trim().split(/\s+/).filter(Boolean));
  const net =
    spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" }).stdout ??
    "";
  const ports = [];
  for (const line of net.split(/\r?\n/)) {
    const m = line.match(
      /^\s*TCP\s+(?:127\.0\.0\.1|\[::1\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)/,
    );
    if (m && pids.has(m[2])) ports.push(Number(m[1]));
  }
  return ports;
};
const describeBrowser = () => {
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"name='msedgewebview2.exe'\" | ForEach-Object { $c = $_.CommandLine; if ($c -notmatch '--type=') { $c.Substring(0, [Math]::Min(500, $c.Length)) } }",
    ],
    { encoding: "utf8" },
  ).stdout;
  return (
    (ps ?? "").trim().replace(/\s+/g, " ") || "(no main browser process line)"
  );
};
const failures = [];
let ws;
try {
  let page;
  let last = "no answer yet";
  for (let i = 0; i < 90 && !page; i++) {
    if (app.exitCode !== null)
      throw new Error(`the app exited early (code ${app.exitCode})`);
    const candidates = [
      ...new Set([activePort(), ...listeningPorts()].filter(Boolean)),
    ];
    last = `candidate ports: ${candidates.join(" ") || "none"}`;
    for (const port of candidates) {
      try {
        const targets = await (
          await fetch(`http://127.0.0.1:${port}/json`, {
            signal: AbortSignal.timeout(3000),
          })
        ).json();
        const found = targets.find((p) => p.type === "page");
        last = `port ${port}, targets: ${JSON.stringify(targets.map((t) => [t.type, t.url]))}`;
        if (found) {
          page = found;
          break;
        }
      } catch {}
    }
    if (!page) await sleep(1000);
  }
  if (!page) {
    throw new Error(
      `the app's window never appeared (${last}; profile files: ${profileFiles().join(" ") || "none"}; browser: ${describeBrowser()})`,
    );
  }

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const waiting = new Map();
  const violations = [];
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) {
      waiting.get(d.id)(d);
      waiting.delete(d.id);
    } else if (
      d.method === "Log.entryAdded" &&
      /Content Security Policy|Refused to/i.test(d.params.entry.text)
    ) {
      violations.push(d.params.entry.text);
    } else if (d.method === "Runtime.exceptionThrown") {
      violations.push(
        `uncaught: ${JSON.stringify(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text)}`,
      );
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      waiting.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) =>
    (
      await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
    ).result?.result?.value;
  await send("Log.enable");
  await send("Runtime.enable");

  // The app's own page, served by the app (this is where the policy applies).
  let text = "";
  for (let i = 0; i < 30 && !text.trim(); i++) {
    text =
      (await evaluate("document.body ? document.body.innerText : ''")) ?? "";
    if (!text.trim()) await sleep(1000);
  }
  const origin = await evaluate("location.origin");
  if (!/tauri\.localhost|^tauri:/.test(origin ?? ""))
    failures.push(
      `the page is ${origin}, not the app's own origin, so the policy isn't being tested`,
    );
  if (!text.trim()) failures.push("the app's page stayed empty");
  const expectedVersion = JSON.parse(
    readFileSync(new URL("../app/package.json", import.meta.url), "utf8"),
  ).version;
  const actualVersion = await evaluate(
    "window.__TAURI_INTERNALS__.invoke('get_state').then(s => s.app_version)",
  );
  if (actualVersion !== expectedVersion)
    failures.push(
      `tested version ${actualVersion}, expected ${expectedVersion}`,
    );

  // Pictures the app makes from game files are shown from blob: URLs; they must load.
  const probe = (src) =>
    evaluate(
      `new Promise((ok) => { const i = new Image(); i.onload = () => ok("loaded"); i.onerror = () => ok("blocked"); i.src = ${src}; setTimeout(() => ok("timeout"), 8000); })`,
    );
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
  const blobResult = await probe(
    `URL.createObjectURL(new Blob([Uint8Array.from(atob("${png}"), (c) => c.charCodeAt(0))], { type: "image/png" }))`,
  );
  if (blobResult !== "loaded")
    failures.push(
      `a blob: picture is ${blobResult} (img-src must allow blob:)`,
    );
  const dataResult = await probe(`"data:image/png;base64,${png}"`);
  if (dataResult !== "loaded")
    failures.push(`a data: picture is ${dataResult}`);
  // Control: a picture from the internet must be refused, which shows the policy really is in force.
  const remoteResult = await probe(
    `"https://example.invalid/x.png?" + Date.now()`,
  );
  if (remoteResult === "loaded")
    failures.push("a remote picture loaded: the policy is not in force");

  await sleep(500);
  const real = violations.filter((v) => !/example\.invalid/.test(v));
  if (real.length)
    failures.push(
      `policy violations or errors on the page:\n   ${real.join("\n   ")}`,
    );
  console.log(
    `page text: ${JSON.stringify(text.trim().slice(0, 60))}; blob ${blobResult}, data ${dataResult}, remote ${remoteResult}`,
  );
} catch (e) {
  failures.push(String(e));
} finally {
  try {
    ws?.close();
  } catch {}
  spawnSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], {
    stdio: "ignore",
  });
  await sleep(1000);
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {}
}
if (failures.length) {
  console.error("Windows smoke test failed:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log(
  "Windows smoke test passed: the app opens and its policy allows blob: and data: pictures and refuses remote ones.",
);

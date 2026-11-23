// Starts the release build on Windows with no game, saves or user data, and checks the page under the app's real
// Content Security Policy (which `tauri dev` does not enforce). Usage: node scripts/smoke-windows.mjs <app.exe>
// Reads the page over WebView2's local debugging port (127.0.0.1 only) and changes nothing.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exe = process.argv[2];
if (!exe) throw new Error("usage: node scripts/smoke-windows.mjs <app.exe>");
const port = 9333;
const root = mkdtempSync(join(tmpdir(), "oj-win-smoke-"));
const env = {
  ...process.env,
  LOCALAPPDATA: join(root, "local"),
  APPDATA: join(root, "roaming"),
  OJ_GAME: join(root, "missing-game"),
  OJ_SAVE_DIR: join(root, "missing-save"),
  WEBVIEW2_USER_DATA_FOLDER: join(root, "webview"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
};
delete env.OJ_REPORT;
delete env.OJ_TEST_REAL;

const app = spawn(exe, [], { env, stdio: ["ignore", "inherit", "inherit"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
let ws;
try {
  let page;
  let last = "no answer yet";
  for (let i = 0; i < 90 && !page; i++) {
    if (app.exitCode !== null) throw new Error(`the app exited early (code ${app.exitCode})`);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      last = `targets: ${JSON.stringify(targets.map((t) => [t.type, t.url]))}`;
      page = targets.find((p) => p.type === "page");
    } catch (e) {
      last = `debugging port: ${e.cause?.code ?? e.message}`;
    }
    if (!page) await sleep(1000);
  }
  if (!page) {
    const running = spawnSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8" }).stdout ?? "";
    const names = running.split(/\r?\n/).filter((l) => /ocarina|webview2/i.test(l)).map((l) => l.split(",")[0]);
    throw new Error(`the app's window never appeared (${last}; related processes: ${names.join(" ") || "none"})`);
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
    } else if (d.method === "Log.entryAdded" && /Content Security Policy|Refused to/i.test(d.params.entry.text)) {
      violations.push(d.params.entry.text);
    } else if (d.method === "Runtime.exceptionThrown") {
      violations.push(`uncaught: ${JSON.stringify(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text)}`);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      waiting.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send("Log.enable");
  await send("Runtime.enable");

  // The app's own page, served by the app (this is where the policy applies).
  let text = "";
  for (let i = 0; i < 30 && !text.trim(); i++) {
    text = (await evaluate("document.body ? document.body.innerText : ''")) ?? "";
    if (!text.trim()) await sleep(1000);
  }
  const origin = await evaluate("location.origin");
  if (!/tauri\.localhost|^tauri:/.test(origin ?? "")) failures.push(`the page is ${origin}, not the app's own origin, so the policy isn't being tested`);
  if (!text.trim()) failures.push("the app's page stayed empty");

  // Pictures the app makes from game files are shown from blob: URLs; they must load.
  const probe = (src) =>
    evaluate(`new Promise((ok) => { const i = new Image(); i.onload = () => ok("loaded"); i.onerror = () => ok("blocked"); i.src = ${src}; setTimeout(() => ok("timeout"), 8000); })`);
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
  const blobResult = await probe(`URL.createObjectURL(new Blob([Uint8Array.from(atob("${png}"), (c) => c.charCodeAt(0))], { type: "image/png" }))`);
  if (blobResult !== "loaded") failures.push(`a blob: picture is ${blobResult} (img-src must allow blob:)`);
  const dataResult = await probe(`"data:image/png;base64,${png}"`);
  if (dataResult !== "loaded") failures.push(`a data: picture is ${dataResult}`);
  // Control: a picture from the internet must be refused, which shows the policy really is in force.
  const remoteResult = await probe(`"https://example.invalid/x.png?" + Date.now()`);
  if (remoteResult === "loaded") failures.push("a remote picture loaded: the policy is not in force");

  await sleep(500);
  const real = violations.filter((v) => !/example\.invalid/.test(v));
  if (real.length) failures.push(`policy violations or errors on the page:\n   ${real.join("\n   ")}`);
  console.log(`page text: ${JSON.stringify(text.trim().slice(0, 60))}; blob ${blobResult}, data ${dataResult}, remote ${remoteResult}`);
} catch (e) {
  failures.push(String(e));
} finally {
  try {
    ws?.close();
  } catch {}
  spawnSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  await sleep(1000);
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {}
}
if (failures.length) {
  console.error("Windows smoke test failed:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("Windows smoke test passed: the app opens and its policy allows blob: and data: pictures and refuses remote ones.");

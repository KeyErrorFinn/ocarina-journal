import { useEffect, useState, type ReactNode } from "react";
import { invoke, isRemote } from "../ipc";
import * as Ic from "../components/icons";
import { Header, SettingRow, Toggle } from "../components/chrome";
import { SaveFolder } from "../components/SaveFolder";
import { ThisScreen } from "../components/ThisScreen";
import { UpdateCheck } from "../components/UpdateCheck";
import { WindowPanel } from "../components/WindowControls";
import { qrPath } from "../data/scorecode";
import { EMPTY, type LiveState, type RemoteScreen } from "../model";
import type { WindowMode } from "../windowMode";

/** One card of the Settings page: an icon and a heading over its rows. */
function Section({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="set-card" aria-labelledby={`set-${id}`}>
      <header className="set-head">
        <span className="set-ic" aria-hidden>
          {icon}
        </span>
        <h2 id={`set-${id}`}>{title}</h2>
      </header>
      <div className="set-body">{children}</div>
    </section>
  );
}

/** A button that copies `text` and says so for a moment. */
function CopyBtn({ text, what }: { text: string; what: string }) {
  const [done, setDone] = useState<"ok" | "failed" | null>(null);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 1600);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      className={`set-copy ${done === "ok" ? "ok" : ""}`}
      aria-label={`Copy the ${what}`}
      title={`Copy the ${what}`}
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => setDone("ok"))
          .catch(() => setDone("failed"))
      }
    >
      {done === "ok" ? <Ic.Check /> : <Ic.Copy />}
      <span aria-live="polite">{done === "ok" ? "Copied" : done === "failed" ? "Couldn't copy" : "Copy"}</span>
    </button>
  );
}

/** A QR code of `text`, drawn as SVG like the Ocarina share card (no picture is fetched). */
function Qr({ text }: { text: string }) {
  const q = qrPath(text);
  const m = 3; // quiet zone, in modules
  return (
    <svg
      className="set-qr"
      viewBox={`${-m} ${-m} ${q.size + 2 * m} ${q.size + 2 * m}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code of ${text}`}
    >
      <rect x={-m} y={-m} width={q.size + 2 * m} height={q.size + 2 * m} fill="#fffaf0" />
      <path d={q.d} fill="#1c140c" />
    </svg>
  );
}

/** Showing the journal on another screen. The app serves it read-only; the commands are the backend's. */
function SecondScreen({ s }: { s: LiveState }) {
  // (an app from before this setting existed sends no `remote`)
  const r = s.remote ?? EMPTY.remote;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The 4-digit code stays hidden until the player asks to see it, and the app only hands it over while it is shown (it
  // is asked for again each time the code changes).
  const [reveal, setReveal] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  useEffect(() => {
    if (!reveal || !r.enabled) {
      setPin(null);
      return;
    }
    let live = true;
    invoke<string | null>("get_remote_pin")
      .then((p) => live && setPin(p))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [reveal, r.enabled, r.pin_ends_ms]);
  const call = (cmd: string, args?: Record<string, boolean | string>) => {
    setBusy(true);
    setError(null);
    invoke(cmd, args)
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  };
  const shown = error ?? r.error;
  return (
    <>
      <SettingRow label="Show on another screen" hint="Open your journal, maps and saves progress in a browser, read-only.">
        <Toggle on={r.enabled} label="Show on another screen" onChange={(v) => call("set_remote", { enabled: v, lan: r.lan })} />
      </SettingRow>
      {r.enabled && (
        <SettingRow
          label="Allow other devices on my network"
          hint={r.lan ? "Phones, tablets and other computers on your network can connect." : "Off: only this PC can connect."}
        >
          <Toggle on={r.lan} label="Allow other devices on my network" onChange={(v) => call("set_remote", { enabled: true, lan: v })} />
        </SettingRow>
      )}
      {r.enabled && r.url && r.code && (
        <div className="set-remote">
          <div className="set-remote-info">
            <div className="set-kv">
              <span className="set-k">Address</span>
              <div className="set-copyline">
                <code className="set-path selectable">{r.link ?? r.url}</code>
                <CopyBtn text={r.link ?? r.url} what="address" />
              </div>
            </div>
            <div className="set-kv">
              <span className="set-k">Pairing code</span>
              <div className="set-copyline">
                <code className="set-code selectable" aria-label={`Pairing code ${r.code.split("").join(" ")}`}>
                  {r.code}
                </code>
                <CopyBtn text={r.code} what="pairing code" />
              </div>
            </div>
            {r.pin_ends_ms && (
              <div className="set-kv">
                <span className="set-k">4-digit code</span>
                <div className="set-copyline">
                  {reveal && pin ? (
                    <code className="set-code selectable" aria-label={`4-digit code ${pin.split("").join(" ")}`}>
                      {pin}
                    </code>
                  ) : (
                    <code className="set-code" aria-label="4-digit code, hidden">
                      ••••
                    </code>
                  )}
                  <Countdown endsMs={r.pin_ends_ms} />
                  <button className="set-copy" aria-pressed={reveal} onClick={() => setReveal(!reveal)}>
                    {reveal ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}
            <Screens screens={r.screens} busy={busy} onDisconnect={(id) => call("disconnect_remote_screen", { id })} />
            <div className="set-btns">
              <button className="set-btn ghost" disabled={busy} onClick={() => call("rotate_remote_code")}>
                New code
              </button>
            </div>
          </div>
          {/* A phone can't reach an address that only this PC answers, so the QR code waits for the network switch. */}
          {r.lan && r.link && (
            <figure className="set-qr-wrap">
              <Qr text={r.link} />
              <figcaption>Scan, then type the 4-digit code</figcaption>
            </figure>
          )}
        </div>
      )}
      {shown && (
        <p className="set-error" role="alert">
          {shown}
        </p>
      )}
      <p className="set-warn">
        <b>Read-only.</b> Anyone on your network with the pairing code and the 4-digit code can see your journal, maps and saves progress. Don't forward this
        port to the internet. It stays on after you restart the app, until you turn it off.
      </p>
    </>
  );
}

/** "changes in 42 s", counting down to the moment the app picks the next 4-digit code. */
function Countdown({ endsMs }: { endsMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // (at most a minute: this PC's clock and the server's can differ by a hair)
  const left = Math.min(60, Math.max(0, Math.ceil((endsMs - now) / 1000)));
  return <span className="set-count">{left > 0 ? `changes in ${left} s` : "changing…"}</span>;
}

/** The screens that have paired: a count that opens into their names, each with a button to sign it out. */
function Screens({ screens, busy, onDisconnect }: { screens: RemoteScreen[]; busy: boolean; onDisconnect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const online = screens.filter((x) => x.online).length;
  const summary = screens.length === 0 ? "None yet" : `${screens.length} paired${online > 0 ? `, ${online} open now` : ""}`;
  return (
    <div className="set-kv">
      <span className="set-k">Connected screens</span>
      <button
        className="set-clients set-toggle"
        aria-expanded={open}
        aria-controls="set-screens"
        disabled={screens.length === 0}
        onClick={() => setOpen(!open)}
      >
        <i className={online > 0 ? "on" : ""} aria-hidden />
        {summary}
        {screens.length > 0 && <span className={`set-chev ${open ? "open" : ""}`} aria-hidden />}
      </button>
      {open && screens.length > 0 && (
        <ul className="set-screens" id="set-screens">
          {screens.map((x) => (
            <li key={x.id}>
              <i className={x.online ? "on" : ""} aria-hidden />
              <span className="set-screen-name">
                <b>{x.name}</b>
                <small>
                  {x.addr} · paired {new Date(x.since_ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {x.online ? " · open now" : ""}
                </small>
              </span>
              <button className="set-btn ghost" disabled={busy} aria-label={`Disconnect ${x.name} at ${x.addr}`} onClick={() => onDisconnect(x.id)}>
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MODES = {
  live: { text: "Live", cls: "live" },
  bridge_off: { text: "Game running, bridge off", cls: "warn" },
  offline: { text: "Game not running", cls: "" },
} as const;

/** The Settings page: what the app is connected to, where it reads from, and how it behaves. */
export function Settings({
  s,
  reportError,
  win,
  setWin,
  onHome,
}: {
  s: LiveState;
  reportError: string | null;
  win: WindowMode;
  setWin: (m: WindowMode) => void;
  onHome: () => void;
}) {
  const persistent = s.bridge_config_supported !== false;
  const mode = MODES[s.mode] ?? MODES.offline;
  return (
    <>
      <Header title="Settings" onLeft={onHome} />
      <div className="scroll grain">
        <div className="set-page">
          <Section id="status" title="Status" icon={<Ic.Pulse />}>
            <SettingRow label="Connection">
              <span className={`set-pill ${mode.cls}`}>
                <i aria-hidden />
                {mode.text}
              </span>
            </SettingRow>
            <SettingRow label="Game version">
              <span className="set-value">{s.version ?? "Not known yet"}</span>
            </SettingRow>
            <SettingRow label="App version">
              <span className="set-value">{s.app_version || "–"}</span>
            </SettingRow>
            {s.mode === "bridge_off" && !isRemote && (
              <p className="set-note">
                Longshot was started without its control bridge. Restart the game with <b>HOS_CONTROL={s.pipe || "longshot"}</b>
                {persistent ? (
                  <>
                    , or add that line to <b>longshot_env.txt</b> in the game folder. This app will not change your files without asking.
                  </>
                ) : (
                  <>, or close it and use Start game from this app. This app will not change your files without asking.</>
                )}
              </p>
            )}
            {!isRemote && (
              <details className="set-details">
                <summary>Folders and connection details</summary>
                <div className="set-kv">
                  <span className="set-k">Game folder</span>
                  <code className="set-path selectable">{s.game_dir ?? "Not detected (found when the game runs, or set OJ_GAME)"}</code>
                </div>
                <div className="set-kv">
                  <span className="set-k">Save folder</span>
                  <code className="set-path selectable">{s.save_dir ?? "Not found"}</code>
                </div>
                <div className="set-kv">
                  <span className="set-k">{persistent ? "Pipe" : "Socket"}</span>
                  <code className="set-path selectable">{s.pipe || "longshot"}</code>
                </div>
                <div className="set-kv">
                  <span className="set-k">Names and positions</span>
                  <span className={reportError ? "set-error" : "set-ok"}>{reportError ? `Unavailable (${reportError})` : "Read from your game folder"}</span>
                </div>
              </details>
            )}
          </Section>

          {isRemote && (
            <Section id="screen" title="This screen" icon={<Ic.Screens />}>
              <ThisScreen />
            </Section>
          )}

          {!isRemote && (
            <Section id="saves" title="Save folder" icon={<Ic.Folder />}>
              <SaveFolder s={s} />
            </Section>
          )}

          {!isRemote && (
            <Section id="remote" title="Second screen" icon={<Ic.Screens />}>
              <SecondScreen s={s} />
            </Section>
          )}

          {!isRemote && (
            <Section id="updates" title="Updates" icon={<Ic.Refresh />}>
              <UpdateCheck s={s} />
            </Section>
          )}

          {!isRemote && (
            <Section id="window" title="Window" icon={<Ic.WindowFrame />}>
              <WindowPanel mode={win} set={setWin} />
            </Section>
          )}

          <Section id="about" title="About" icon={<Ic.Info />}>
            <p className="set-about">
              Unofficial companion for Longshot. Not affiliated with or endorsed by Nintendo. Read-only: it never writes to the game or its saves.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}

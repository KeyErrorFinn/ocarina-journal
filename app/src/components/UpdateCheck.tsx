import { useState } from "react";
import { invoke } from "../ipc";
import type { LiveState } from "../model";
import { SettingRow, Toggle } from "./chrome";

/** Tells the player when a newer release exists. The only network call the app makes: it runs when the button is pressed,
 *  or at start-up unless the player switched that off. Nothing is downloaded or installed. */
export function UpdateCheck({ s }: { s: LiveState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = () => {
    setBusy(true);
    setError(null);
    invoke("check_for_update")
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <SettingRow
        label={s.app_version ? `You have version ${s.app_version}` : "Your version"}
        hint={
          s.update?.newer
            ? `Version ${s.update.latest} is available.`
            : s.update
              ? "You have the newest version."
              : "Asks GitHub for the newest release. Nothing is downloaded or installed for you."
        }
        stack
      >
        <div className="set-btns">
          <button className="set-btn" disabled={busy} onClick={check}>
            {busy ? "Checking…" : "Check for updates"}
          </button>
          {s.update?.newer && (
            <button className="set-btn ghost" onClick={() => invoke("open_release_page").catch((e) => setError(String(e)))}>
              Open release page
            </button>
          )}
        </div>
        {error && (
          <p className="set-error" role="alert">
            {error}
          </p>
        )}
      </SettingRow>
      <SettingRow label="Also check when the app starts">
        <Toggle
          on={s.update_check_auto}
          label="Also check for updates when the app starts"
          onChange={(on) => invoke("set_auto_update_check", { on }).catch((e) => setError(String(e)))}
        />
      </SettingRow>
    </>
  );
}

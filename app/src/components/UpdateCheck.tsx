import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LiveState } from "../model";

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
    <div className="winpanel savepanel updatepanel">
      <h3>Updates</h3>
      {s.app_version && <small>You have version {s.app_version}.</small>}
      {s.update?.newer ? (
        <small>Version {s.update.latest} is available.</small>
      ) : s.update ? (
        <small>You have the newest version.</small>
      ) : (
        <small>Asks GitHub for the newest release. Nothing is downloaded or installed for you.</small>
      )}
      <div className="save-row">
        <button disabled={busy} onClick={check}>
          {busy ? "Checking…" : "Check for updates"}
        </button>
        {s.update?.newer && <button onClick={() => invoke("open_release_page")}>Open release page</button>}
      </div>
      <label>
        <input type="checkbox" checked={s.update_check_auto} onChange={(e) => invoke("set_auto_update_check", { on: e.target.checked })} />
        Also check when the app starts
      </label>
      {error && <small className="save-error">{error}</small>}
    </div>
  );
}

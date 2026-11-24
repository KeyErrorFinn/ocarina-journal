import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LiveState } from "../model";

/** Lets the player point the app at their saves when the automatic search misses them. The app only reads the folder. */
export function SaveFolder({ s }: { s: LiveState }) {
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const apply = (value: string) => {
    setError(null);
    invoke("set_save_dir", { path: value })
      .then(() => setPath(""))
      .catch((e) => setError(String(e)));
  };
  const browse = () => invoke<string | null>("pick_folder").then((picked) => picked && apply(picked));
  return (
    <div className="winpanel savepanel">
      <h3>Save folder</h3>
      <small style={{ overflowWrap: "anywhere" }}>
        {s.save_dir ? `Reading: ${s.save_dir}${s.save_dir_chosen ? " (your choice)" : " (found automatically)"}` : "No saves found yet."}
      </small>
      <small>Paste the folder that holds your slot_00, slot_01, ... folders (or the folder above it). The app only reads it.</small>
      <div className="save-row">
        <input
          type="text"
          value={path}
          spellCheck={false}
          placeholder="Folder path"
          aria-label="Save folder path"
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && path.trim() && apply(path)}
        />
        <button onClick={browse}>Browse…</button>
        <button disabled={!path.trim()} onClick={() => apply(path)}>
          Use
        </button>
      </div>
      {s.save_dir_chosen && (
        <button className="save-reset" onClick={() => apply("")}>
          Go back to automatic
        </button>
      )}
      {error && <small className="save-error">{error}</small>}
    </div>
  );
}

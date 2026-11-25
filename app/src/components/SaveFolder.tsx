import { useState } from "react";
import { invoke } from "../ipc";
import type { LiveState } from "../model";
import { SettingRow } from "./chrome";

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
  const browse = () =>
    invoke<string | null>("pick_folder")
      .then((picked) => picked && apply(picked))
      .catch((e) => setError(String(e)));
  return (
    <>
      <SettingRow label="In use" stack>
        {s.save_dir ? (
          <div className="set-path-line">
            <span className={`set-tag ${s.save_dir_chosen ? "on" : ""}`}>{s.save_dir_chosen ? "Your choice" : "Found automatically"}</span>
            <code className="set-path selectable">{s.save_dir}</code>
          </div>
        ) : (
          <span className="set-muted">No saves found yet.</span>
        )}
      </SettingRow>
      <SettingRow
        label="Use another folder"
        hint="Pick or paste the folder that holds your slot_00, slot_01, ... folders (or the folder above it). The app only reads it."
        stack
      >
        <div className="set-field">
          <input
            type="text"
            className="set-input"
            value={path}
            spellCheck={false}
            placeholder="Folder path"
            aria-label="Save folder path"
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && path.trim() && apply(path)}
          />
          <div className="set-btns">
            <button className="set-btn ghost" onClick={browse}>
              Browse…
            </button>
            <button className="set-btn" disabled={!path.trim()} onClick={() => apply(path)}>
              Use
            </button>
          </div>
        </div>
        {s.save_dir_chosen && (
          <button className="set-btn ghost set-btn-start" onClick={() => apply("")}>
            Go back to automatic
          </button>
        )}
        {error && (
          <p className="set-error" role="alert">
            {error}
          </p>
        )}
      </SettingRow>
    </>
  );
}

import { invoke } from "@tauri-apps/api/core";
import type { LiveState } from "../model";

/** Asks whether to get a newer release. "Yes" opens the release page in the browser; nothing is downloaded or installed
 *  by the app. `onLater` hides the question until the next start. */
export function UpdatePrompt({ s, onLater }: { s: LiveState; onLater: () => void }) {
  if (!s.update?.newer) return null;
  const yes = () => {
    invoke("open_release_page").catch(() => {});
    onLater();
  };
  return (
    <>
      <div className="scrim" onClick={onLater} />
      <section className="sheet updateprompt" role="dialog" aria-label="Update available">
        <div className="grab" />
        <header>
          <span>Update available</span>
        </header>
        <div className="body">
          <p>
            Version {s.update.latest} is out{s.app_version ? ` (you have ${s.app_version})` : ""}. Do you want to get it? This opens its page on GitHub, where
            you download and run the installer.
          </p>
          <div className="save-row">
            <button onClick={yes}>Yes, open the page</button>
            <button onClick={onLater}>Not now</button>
          </div>
        </div>
      </section>
    </>
  );
}

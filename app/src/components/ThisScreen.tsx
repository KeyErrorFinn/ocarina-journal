import { useEffect, useState } from "react";
import { SettingRow } from "./chrome";
import { canInstall, install, isInstalled, onInstallable, signOut } from "../ipc";

/** Steps for putting this page on the home screen, for the browser that is open. Browsers only offer a real install
 *  on a secure (`https`) page, which a home network's address isn't, so most of the time this is by hand. */
function steps(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "In Safari, tap the Share button, then Add to Home Screen.";
  if (/Android/.test(ua)) return "In Chrome, open the menu (the three dots), then Add to Home screen (or Install app).";
  return "Open your browser's menu and choose Install or Add to Home screen (in Chrome and Edge it can be under Cast, save and share).";
}

/** What a second screen can do about itself: put the page on the home screen, and disconnect from the app. */
export function ThisScreen() {
  const [offer, setOffer] = useState(canInstall());
  useEffect(() => onInstallable(() => setOffer(canInstall())), []);
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leave = () =>
    signOut()
      .then(() => location.reload())
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
  return (
    <>
      <SettingRow
        label="Add to home screen"
        hint={isInstalled() ? "This page is already open as an app." : offer ? "Opens like an app, without the browser's bars." : steps()}
      >
        {!isInstalled() && offer && (
          <button className="set-btn ghost" onClick={() => install()}>
            Add
          </button>
        )}
      </SettingRow>
      <SettingRow label="Disconnect this device" hint="The app forgets this device. To see the journal here again, pair it with the codes from the app.">
        {sure ? (
          <span className="set-btns">
            <button className="set-btn" onClick={leave}>
              Yes, disconnect
            </button>
            <button className="set-btn ghost" onClick={() => setSure(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="set-btn ghost" onClick={() => setSure(true)}>
            Disconnect
          </button>
        )}
      </SettingRow>
      {error && (
        <p className="set-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

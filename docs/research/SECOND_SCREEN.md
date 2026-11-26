# Second screen (show the journal on a phone or tablet)

Marks: [V] verified by a test or by reading the code, [I] inferred, [U] unknown.

## What it is

An optional, read-only web page the app serves while it runs, so a phone, tablet or second monitor on the same
network can show the live journal, maps, ocarina and save progress. It is **off until the player turns it on** in
Settings, Second screen; after that the app remembers the choice (and the "other devices" choice) and starts it again
the next time. Paired screens stay paired, also across restarts, so a phone can just open the page. A screen is
signed out by Disconnect, by New code, or after 7 days away: any use of the page starts the 7 days over, and a screen with
its page open is never away (the oldest also goes if more than 16 are paired). The app keeps only a
SHA-256 of each screen's cookie token (`remote_sessions.json`), never the token, so that file can't be replayed. It also keeps when each screen was last seen (rounded to the hour). The idea came from a community write-up (GitHub Discussion #17); this
is a separate, narrower design, not that code.

## The rule it bends, and how

`docs/RULES.md` says nothing listens to other computers. This feature is the one exception, and only when the player
chooses "Allow other devices on my network". Without that choice it listens on this PC only.

| Risk | What the code does | Status |
|---|---|---|
| Anyone on the Wi-Fi gets in | Pairing needs two codes shown only in the app: an 8-character code and a 4-digit code that changes every minute (the one before still works for 10 seconds), both from the system's random source. The page asks for them in two steps (pairing code, then the 4-digit code). The pairing code may arrive in the address the QR code opens (`/?code=...`): the page uses it once and removes it from the address bar, but until then it can sit in the phone's history or a log, which is why the second code is typed and never in the address. The server itself reads codes only from a request body. In the app the 4-digit code stays hidden until the player presses Show, and the app's window only receives it from a command while it is shown; it is not part of the state sent to the window. (The pairing code is, and is in the QR link.) Every attempt, right or wrong, counts towards 6 a minute (then 429 with `Retry-After`), the page also pauses between tries, and 20 wrong in a row replace both codes. A new code signs every browser out. | [V] `crates/oj-remote/tests/server.rs` |
| A screen that hasn't paired sees the app | Until the cookie is a paired one, the server sends only a small pairing page (its own HTML and one script, no logo) and answers `401` to every other file. No page, script, style, picture or sound of the app is sent, and the app's files are not even looked up. Once paired, a reload gets the app, so there is no flash of the app before the pairing screen. | [V] test |
| A screen signs itself out | `POST /api/signout` ends only the caller's own pairing (not on the `READ_ONLY` list; origin and JSON checks apply; it clears the cookie). The page offers it as "Disconnect this device". | [V] test |
| A paired screen should no longer be trusted | Settings lists every paired screen by what its browser says it is (such as "iPhone · Safari") and its address, and a Disconnect button signs out that one screen only. | [V] test |
| The app froze when "New code" was pressed | The app asked the server for a change while holding the lock the server's change handler takes. The handler now never runs on the caller's thread, and the app no longer holds the lock while it calls the server. | [V] test + real build |
| A page reaches commands that change things | The server has nine read-only data commands (`READ_ONLY`) and one validated app-progress command (`sync_ui`, described below). Launching the game, turning the bridge on, choosing folders, the window and updates are refused even to a paired browser. | [V] test + unit test |
| Another website in the player's browser calls the server | No CORS headers; JSON-only requests; a browser's `Origin` must equal the host; the cookie is `HttpOnly; SameSite=Strict`. | [V] test |
| DNS rebinding | The `Host` must be an IP address or `localhost`; a name is refused. | [V] test |
| Listening on every interface | The server refuses `0.0.0.0`. The "other devices" choice binds only the PC's private address (10/8, 172.16/12, 192.168/16); with none, it fails with a message. | [V] test; address choice [V] on a real network |
| Private details leak | The state sent to a browser has no game folder, save folder, pipe name or error text. Failed data commands return a generic message rather than raw backend errors that might contain paths. | [V] `remote_view` and backend-error tests |
| The internet | The server only binds a private address, so it is not reachable from the internet unless the player forwards the port on their router. The Settings page says not to. | [I] |

## What a second screen can and cannot do

Read-only: the app's state, the report, maps, tapestry, lore, rumors and ocarina sounds. It cannot start the game,
change the save folder, turn the bridge on, or change the window. The Window, Save folder and Updates cards are not
shown on a second screen. Each device keeps its own view settings (they live in that browser).

App-owned progress is shared between the desktop and paired screens: tile notification acknowledgements, Rumor
Hunt discoveries and help, visited landmarks, explored Lost Woods rooms, quiz best scores and reward unlocks.
The PC keeps `shared_progress.json`; only the allowlisted `sync_ui` command can update these bounded, validated
values. It cannot choose a path or write settings, game files or saves. Changes broadcast through live state.
Existing browser-local records are imported: existing shared tile acknowledgements win over stale imports,
numeric progress keeps the larger value, and explored rooms are combined. Updates send changed entries rather
than replacing another screen's whole record. Pending changes stay in memory and retry while the page stays open;
each screen also keeps a local copy. Display filters, window settings, profile customisation and ocarina recordings
stay local. [V] Rust merge/validation tests, paired/origin socket tests and two-store browser regressions cover
acknowledgements in both directions, stale snapshots and connection failure/retry. Physical-phone behaviour has
not been rechecked for this patch.

## The page on the other device

- **Scanning again:** the pairing page checks `/api/session` before submitting the QR code. A valid existing
  session reloads straight into the app without a new pairing attempt. The endpoint returns only a status, with
  no app data and no caching; origin checks and the `SameSite=Strict` cookie remain in place. [V] socket and browser
  regressions simulate an initial navigation without a cookie, then a same-origin request with it. A scanner can
  omit a Strict cookie on its initial navigation [I]; this has not been verified on every phone/scanner. A separate
  browser, private tab or home-screen cookie store still needs its own pairing.
- **App closed:** a separate state request checks reachability every 5 seconds while the page is visible, even if
  the WebSocket never reports closure. It times out after 4 seconds, shows the disconnected overlay and retries
  every 2.5 seconds with the same timeout. Returning to the page or regaining a network connection also checks.
  A successful state response or a pairing response reloads the page after disconnection. Command errors such as
  a missing game image are checked against the state endpoint and do not by themselves mean the app is closed.
  Late requests cannot uncover the stale page. [V] synthetic regression checks in `scripts/browser-regressions.cjs`;
  the earlier real-build test covered ordinary socket closure, not all mobile network behaviours.
- **Preloading:** once paired, the page starts reading the map index, tapestry (with its three pictures), lore, rumors and
  the world map so those screens don't open blank. Opening Map fetches the encoded area pictures, both eras
  and dungeon floors, in two background workers, without waiting for the full catalogue. A chosen destination
  requests its source immediately and is decoded before navigation commits; the current map stays visible until
  then. New background transfers pause until selected pictures finish decoding, then resume automatically.
  Transfers already underway are allowed to finish; selecting one of those shares its existing request instead
  of downloading it again. Era and floor changes follow the same rule. Failed navigation leaves the current map visible with an error.
  Reopening Map retries failed background sources. The game-picture preference disables this extra warm-up.
  Encoded sources are kept for the page session, while the decoded cache retains eight pictures plus active hook
  references. It does not retain a decoded copy of every area. Browser-internal memory use is outside that limit.
  The previous all-images preparation gate was removed: one local test cache of 75 pictures was 91.4 MiB encoded
  and its PNGs alone represented 813 MiB of RGBA pixels. That is a local sample, not a measured phone transfer.
  [V] synthetic regressions verify background prefetch without decoding, destination navigation waiting for its
  chosen decode, cache reuse without another request, and a destination without the reading-message flash.
  Ocarina sounds load when used.
- **Add to home screen:** the page carries a manifest, an icon and the iOS web-app tags, but only for paired screens (the
  manifest is requested with the cookie), so an unpaired device is sent no app files. Browsers only offer a real
  install on secure pages; this one is plain `http://` on a home network, so Settings shows written steps and a button
  only if the browser fires `beforeinstallprompt`. A home-screen app may keep its own cookies and need to pair again,
  and iOS may not send the cookie when it fetches the icon.

## Game-derived content

Maps, area pictures and sounds are made from the player's own game files at runtime. On a second screen they travel
over the player's own network to the player's own device and are never stored by the app or committed. Whether that
counts as "distribution" is a legal question this project does not resolve; the design keeps it to paired devices on
the player's network. [U]

## Things to know

- Windows Firewall: the first time the app listens on the network, Windows asks whether to allow it; allow the Private
  profile only. Linux (ufw) and macOS prompts differ.
- The live connection is a `ws://` socket to the page's own address, which the page's `connect-src` allows.
- Phones on a different VLAN or with client isolation turned on cannot reach the PC; that is a network setting.

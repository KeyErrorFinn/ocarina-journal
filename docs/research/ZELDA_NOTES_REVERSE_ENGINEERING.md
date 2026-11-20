# Zelda Notes: official behaviour and the Nintendo Switch App

**Revision 2 (2026-11-19, later the same day).** Revision 1 had no APK. This revision adds static analysis of the Nintendo Switch App 3.6.0 package you supplied, and replaces the secondary-source feature list with Nintendo's own UK page. Several revision-1 conclusions changed; they are called out in section 9.

Tags: **[N]** Nintendo's own page, **[A]** observed directly in the APK, **[S]** secondary source, **[I]** inference, **[U]** unverified.

## 1. What was analysed, and how

| Item | Value |
|---|---|
| File | `com.nintendo.znca_3.6.0-14330_4arch_7dpi_24lang_...apkmirror.com.apkm` (APKMirror bundle, 51,921,692 bytes), SHA-256 `bb97fcb5123085bf3fe7793724bec516bb2b10a3e74358997d31c8ab6775cc95` |
| Contents | `base.apk` (24.5 MB, SHA-256 `4d9912d3...7407`) plus 38 config splits (ABIs x4, densities, 24 languages) |
| App | "Nintendo Switch App", package `com.nintendo.znca`, versionName 3.6.0, versionCode 14330, minSdk 28 (Android 9), targetSdk 36 **[A]** |
| Provenance | Third-party mirror, not Google Play. Not signature-verified against Nintendo's certificate (the bundle carries `stamp-cert-sha256`; verification not done). |
| Tools | JADX 1.5.7 (decompile), Python scripts for string extraction, ZIP inspection. Java 17. |
| Method | **Static only.** Nothing was installed, executed, instrumented or proxied. No network traffic was captured. No account was used. |
| Output | 12,300 decompiled sources, resources and manifest, in `<scratch>\apk\` (kept outside the repository; not redistributed). |

### What was deliberately not done

- **PairIP was not bypassed.** `libpairipcore.so` and `com.pairip.*` (`VMRunner`, `VmDecryptor`, `SignatureCheck`, `StartupLauncher`, `InitContextProvider`) are Google's Play app-protection layer. 16 methods are replaced by `VMRunner.invoke("<asset name>", ...)`, with their real bytecode in encrypted blobs under `assets/` (22 randomly named files). Unpacking those would defeat a protection mechanism, which is out of scope. The 16 methods are in startup/integrity paths, not feature code.
- **The app's string obfuscation was not systematically defeated.** Beyond PairIP, the DEX is heavily obfuscated (encrypted string literals, reflection-built class/method names, switch-based control flow). I read what is plain (manifest, resources, class names kept by serialization, URL path constants, the JS-bridge method names, which must be real because a web page calls them). I did not write a string decryptor to recover field names; for the public parts of Coral's API the field names are documented by the community project nxapi **[S]** (AGPL-3.0; documentation read, no code used).
- **No TLS interception, no Frida, no attestation work.** The token request requires a client-attestation value ("f") that the app computes; I did not investigate how.

## 2. The central finding: Zelda Notes is not in the app

**There is no Zelda Notes code or content in the APK.** Searching every split (resources, DEX, assets, manifests, JSON, properties) for "Zelda", "ZELDA", "Ocarina" and "Gossip" finds nothing. **[A]**

What the app does contain is a **generic "Game Web Service" host**. **[A]**

- Activities `com.nintendo.znca.ui.gameweb.GameWebServiceActivity` and `LegacyGameWebActivity`; view `GameWebServiceWebView extends android.webkit.WebView`; feature package `com.nintendo.znca.feature.gamewebservice` and home-screen launcher `home/gwslauncher`.
- Entities `GameWebService` (with `Attribute`, `GameWebServicePlatformVersion`), `GameWebServiceId`, `GameWebToken` (payload includes a `Membership`), `GameWebSendMessageModel`, `GameWebShareImageModel`, `GameWebShareURLModel`; announcements and notification flags per service (`GameWebServiceNotificationList`, `GameWebServiceNotificationUnreadFlagById`, `GameWebServiceOrder`, `GameWebServicePersistentDataCacheById`).
- Endpoints on `https://api-lp1.znc.srv.nintendo.net`: **`/v4/GameWebService/List`** (which services exist), **`/v4/Game/GetWebServiceToken`** (and `/v2/Extension/Game/GetWebServiceToken`), `/v4/Announcement/GameWebService/Delete`. Other web-service stacks in the same app use `https://api.lp1.av5ja.srv.nintendo.net` (Splatoon 3's service, via `/api/bullet_tokens`, `/api/graphql`, `/api/dummy_game_web_tokens`).
- Deep links (manifest): `https://s.nintendo.com/lp1/znca/game/...`, `https://s.nintendo.com/av5ja-lp1/znca/game/...`, `com.nintendo.znca://znca`, `https://dpl.sd.lp1.acbaa.srv.nintendo.net`, `https://lounge.nintendo.com/friendcode/`.

Community documentation of the same API **[S]** (nxapi, `src/api/coral-types.ts`, `coral.ts`): a list item has `id`, `uri`, `name`, `imageUri`, `whiteList`, `customAttributes[]`, and in v4 `startDate`, `isNotificationSupported`, `isNotificationAllowed`; the token request body has `id`, `registrationToken`, `timestamp`, `requestId`, `f`; the response has `accessToken`, `expiresIn`; headers include `Authorization: Bearer`, `X-Platform`, `X-ProductVersion`, a `com.nintendo.znca/<version>` user agent.

**Conclusion [I, strong]:** Zelda Notes is one entry in the list that the server returns from `/v4/GameWebService/List`. The phone app opens its `uri` in a WebView after obtaining a web-service token. The Zelda Notes user interface (maps, quiz, ocarina, Photo Studio, ...) is therefore **web content delivered by Nintendo's servers**, not shipped in the APK, and it cannot be seen from the APK. The only part of Zelda Notes that exists in the APK is the thin native shell around it. The alternative (Zelda Notes implemented in the 16 PairIP-virtualized methods) is implausible given what those methods are, but the protection prevents a proof. **[U]** formally.

## 3. The WebView-to-native bridge (what the web app can ask the phone to do) [A]

The object registered as `jsBridge` (`addJavascriptInterface(..., "jsBridge")` in `LegacyGameWebActivity`; same pattern in the newer activity) exposes these `@JavascriptInterface` methods, names read directly from the decompiled classes (`dn/C0855.java`, `dn/C2180.java`):

| Method | Purpose (inferred from name and parameter types) |
|---|---|
| `requestGameWebToken()` | page asks the app for the web-service token |
| `sendMessage(String)` | page-to-app message (`GameWebSendMessageModel`) |
| `storePersistentData(String)` / `restorePersistentData()` | small per-service local persistence (matches `GameWebServicePersistentDataCacheById`) |
| `openQRCodeReader(String)`, `openQRCodeReaderForCheckin(String)`, `openQRCodeReaderFromPhotoLibrary(String)`, `closeQRCodeReader()`, `closeQRCodeReaderFromPhotoLibrary()` | QR scan via camera or photo library; result types `QRCodeReadResult`, `QRPhotoLibraryResource`, `QRCheckinOption` |
| `downloadImages(String)` | save images (`DownloadImageParam`); fits Photo Studio exports |
| `invokeNativeShare(String)`, `invokeNativeShareUrl(String)` | OS share sheet (`GameWebShareImageModel`, `GameWebShareURLModel`) |
| `copyToClipboard(String)`, `openExternalBrowser(String)` | utilities |
| `closeWebView()`, `completeLoading()`, `reloadExtension()`, `clearUnreadFlag()` | lifecycle |
| `VibrationPattern` (a serializer class exists) | haptics |
| a few methods with obfuscated names `func_2644`, `func_272e`, `func_345c`, `func_7a5z`, `func_847a`, `func_987f` | unknown **[U]** |

**What this tells us.** The native side offers: authentication handoff, **QR scanning and sharing, image saving, clipboard, haptics, persistence**. It does **not** offer audio synthesis, Bluetooth, NFC, local networking, or any channel to a console. (The ocarina sound and quiz timing are therefore done in the web page itself.)

## 4. Does the app talk to the console directly? Evidence says no [A]

Manifest permissions: `INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH`, `BLUETOOTH_CONNECT`, `FOREGROUND_SERVICE` (+`_MICROPHONE`), `POST_NOTIFICATIONS`, `VIBRATE`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `SCHEDULE_EXACT_ALARM`, `READ/WRITE_EXTERNAL_STORAGE`, Firebase/Play Services (`c2dm RECEIVE`, ad-services). **There is no NFC, no local-network/Wi-Fi-state permission, no Nearby/Location permission.** Bluetooth is for the voice-chat headset (`VoiceChatService`, foreground service with microphone type). Native libraries (arm64): `libvoip.so` (15 MB, Opus decoder and echo-control symbols with `*_nintendo` parameters: the voice chat engine), `libpairipcore.so`, `libandroidx.graphics.path.so`, `libdatastore_shared_counter.so`. No other native code.

Push notifications use Firebase Cloud Messaging (`CloudMessagingService`, `/v1/Notification/RegisterDevice`, `/v5/PushNotification/Settings/*`).

**Answers to the brief's questions:**

| Question | Answer |
|---|---|
| Direct or server-mediated? | **Server-mediated.** The app speaks only HTTPS to Nintendo hosts and receives pushes through FCM. No console channel exists in the app. [A] |
| Is game state uploaded to Nintendo? | It must be, for the web app to display it; the upload is done by the **game** (console), not the app. How is **[U]**. |
| Polling, push, WebSocket? | App: REST calls plus FCM push. Within the web content: **[U]** (not visible in the APK). The app also shows per-service unread flags from announcements. |
| Local network or Bluetooth? | No (Bluetooth only for voice-chat audio). [A] |
| How is the game/player identified? | By the Nintendo Account session (`Authorization: Bearer`), user keys `CoralUserKeyV2` / `CoralNAUserKey`, Nintendo Service Account ID (`NintendoServiceAccountId` value object), plus the service id; the web-service token authenticates the page. [A] for the names; request semantics from **[S]**. |
| Offline | The app cannot show a Zelda Notes page without the server: the WebView content is remote, tokens are minted online. Only locally implemented bridge actions work offline, and they are useless without the page. [I] |
| Requires Nintendo authentication or backend services? | Yes, throughout. The token request needs a client-attestation value that the app generates **[S]**/**[U]**. |
| Observable Zelda-Notes-specific protocol | None in the APK. Whatever protocol exists is between the game and Nintendo's servers, and between the web page and its backend. **[U]** |

A further consequence: the **in-game** side (the console uploads data after the player signs in with the linked account and goes online) is the only place where an observable "Zelda Notes protocol" lives. That is the `nn.npln` gRPC client seen in Longshot (revision 1). **Retraction:** revision 1 suggested the APK string `nplnUserId` linked the two. It does not: that string is a field in a GraphQL-style response (`items`, `nplnUserId`) in an unrelated serializer. The npln-is-Zelda-Notes link remains an **[I]** based only on the game side (see `LONGSHOT_ARCHITECTURE.md` s.6).

## 5. Application architecture [A]

| Aspect | Finding |
|---|---|
| Language/framework | Kotlin, Jetpack Compose (strings such as `androidx.compose.runtime.collection.ScopeMap`), kotlinx.serialization (`$$serializer` classes everywhere), Dagger (`dagger` package), OkHttp (`okhttp3`), Firebase (Analytics, Crashlytics, Messaging strings), a scanner library from `com.journeyapps` (ZXing's Android wrapper **[I]**). A `/api/graphql` path exists (Splatoon 3 stack); the GraphQL client library and the `com.airbnb` library were **not identified**. |
| Modules | `com.nintendo.coral` (core entities, network, widgets, boot), `com.nintendo.znca` (UI features, services, platform), `com.nintendo.nx.nasdk` (Nintendo account SDK). Features: `album`, `announcement`, `chat`, `friend`, `home`, `gamewebservice`, `mypage` (play log, presence, setting, user icon, sharing), `voip`, `walkthrough`. |
| Widgets | Splatoon 3 widgets (`LatestVsResultWidget`, `StageScheduleWidget`, `LatestAlbumPhotoWidget`). Nothing for Zelda. |
| Local persistence | Jetpack DataStore (`libdatastore_shared_counter.so`), keys visible: `CoralAccessTokenKeyV2`, `CoralAccessTokenExpiredAtKeyV2`, `CoralUserKeyV2`, `GameWebServiceOrder`, `GameWebServicePersistentDataCacheById`. No SQLite schema for Zelda data. Cached game data: only the web-service persistent blobs the page chooses to store. |
| Resource files | Standard Android resources; 24 languages. No Zelda assets (no maps, icons, quiz content). |
| Serialization formats | JSON (kotlinx.serialization) over HTTPS; `application/octet-stream` for encrypted bodies on some requests **[S]**. |
| Internal navigation | `TopActivity`, `LoginActivity`, `BootActivity`, `WalkthroughActivity`, `ReportActivity`, `HandleUrlActivity` (deep links), `GameWebServiceActivity`. |
| Lifecycle | Standard; a `LocaleChangeReceiver`; boot receiver; exact alarms (likely for notifications). |

Coral REST surface seen as path constants **[A]** (host `api-lp1.znc.srv.nintendo.net`): `/v4/Account/Login`, `/v4/Account/GetToken`, `/v4/Extension/Account/GetToken`, `/v4/Game/GetWebServiceToken`, `/v2/Extension/Game/GetWebServiceToken`, `/v4/GameWebService/List`, `/v4/User/ShowSelf`, `/v3/User/Show`, `/v3/User/Permissions/ShowSelf`, `/v4/User/Permissions/UpdateSelf`, `/v4/User/PlayLog/Show`, friends (`/v4/Friend/List|Show|Note/Update|IsNew/Delete`, `/v3/Friend/*`, `/v4/FriendRequest/*`, `/v3/FriendRequest/*`), blocks, chat (`/v5/Chat/*`), hashtags, announcements (`/v4/Announcement/*`), events (`/v1/Event/*`), media/album (`/v4/Media/List|Delete`), voice (`/v1/Voip/*`, `/v3/Voip/Join`), support (`/v1/Support/*`), push (`/v1/Notification/RegisterDevice|UnregisterDevice`, `/v5/PushNotification/Settings/*`). **None of these is Zelda-specific.** (Nothing here is for us to call; it is recorded to document the architecture.)

## 6. Official feature list (Nintendo's own page) [N]

Source: `https://www.nintendo.com/en-gb/Games/Smart-device-games/ZELDA-NOTES-2790439.html`, Ocarina of Time section, read 2026-11-19. Wording is Nintendo's, shortened. This **replaces** the secondary-source list of revision 1, and it contains **eleven** features.

| # | Feature | What Nintendo says |
|---|---|---|
| 1 | **Map** | Find secrets you have missed, such as **Pieces of Heart and treasure chests, including in dungeons**. You can **hide places you haven't visited yet** to avoid spoilers. |
| 2 | **Gossip Quests** | Uses an **in-game snapshot** to track down a location. Completing quests earns **points exchangeable for sheet music in Play Ocarina**. You can **spend rupees to reveal a quest target's general location**, which is **transferred to the app at in-game shops**. |
| 3 | **Hall of Fallen Foes** | Once you reach it, shows **bosses you have defeated, your personal records, and medals earned**. You can **compare your stats with a leaderboard**. |
| 4 | **Today's Record** | A day's accomplishments **in chronological order, with automatic screenshots**; also daily stats such as enemies defeated and rupees collected. |
| 5 | **My Play Data** | **Medals** earned for milestones, such as how many treasures you have found. |
| 6 | **Global Play Data** | Compare your records with players worldwide. |
| 7 | **Photo Studio** | Decorate in-game screenshots with frames and stamps; attach Play Ocarina QR codes to them. |
| 8 | **Threads of Time+** | Displays a **tapestry of Link's journey**. Touching certain sections **replays cutscenes from that point in the story**. |
| 9 | **amiibo** | Use Zelda-series amiibo (sold separately) to get **in-game items once per day**. **Scanning an amiibo five times gives one extra scan that day.** |
| 10 | **Play Ocarina** | Digital ocarina with three modes: **Free Play, Guided Play, Demo Play**. View sheet music for songs found in-game or through Gossip Quests, create your own melodies, share by QR code. |
| 11 | **Ocarina of Time Quiz** | **Over 2,000** multiple-choice questions at **two difficulty levels**, each **attemptable once per day**. **Exchange 20 rupees for another attempt.** |

Requirements per the page: selected Zelda games on Switch 2 (OoT is listed), the free Nintendo Switch app on a smartphone or tablet, **no Nintendo Switch Online membership required**. The page's footnotes for OoT are empty; no explicit internet/account statement beyond the app's own sign-in.

### What this changes compared with revision 1

- **"Threads of Time+" is real** and is a Zelda Notes feature (a tapestry with cutscene replay), distinct from the in-game quest log "Threads of Time". Revision 1's statement that it appears in no source was wrong; it was a gap in the secondary sources.
- **Collectibles are in the Map**: Pieces of Heart and treasure chests (also in dungeons) are Zelda Notes content, contradicting the one guide that said otherwise. Gold Skulltulas are **not** named on Nintendo's page.
- **Hall of Fallen Foes** includes bosses, **personal records, medals and a leaderboard**: a server-side comparison component.
- **Today's Record includes automatic screenshots**: the game must capture and upload pictures at moments.
- **Gossip Quests include rupee-for-hint purchases, transferred "at in-game shops"**: a game-to-server-to-app write path. Rupees are spent in the game.
- **The Quiz has two difficulty levels and 20 rupees per extra attempt** (revision 1's "reported 20" is confirmed). **amiibo** has the five-scans-for-one-extra rule.
- **My Play Data** is described as **medals**, not raw statistics.
- Several details in secondary sources (points 30/40 per quest, 300 points per score, Egg/Cucco levels, day-by-day navigation) are **not on Nintendo's page** and remain **[S]**.

## 7. What the APK settles, and what it cannot

| Settled by the APK | Not settled (and why) |
|---|---|
| The phone app is a thin client; Zelda Notes is server-delivered web content in a WebView | The web app's pages, scripts, API calls and data formats (not in the APK; reachable only with an authenticated session) |
| No console-to-phone local channel | How the console uploads data (game binary, `nn.npln` gRPC; not examined) |
| The native capabilities offered to the web app (QR, images, share, clipboard, haptics, persistence, token) | The obfuscated bridge methods (6 unnamed) |
| Endpoint family, auth model (bearer + web-service token), push via FCM | The attestation ("f") computation and token minting details |
| No Zelda assets or strings are bundled | Whether Zelda Notes is gated by `whiteList`/`customAttributes` for the OoT title id; the service's id and `uri` (returned by the server) |

Closing the remaining gaps would require **authenticated traffic or the live web content**. That means a real account session against Nintendo's service, TLS inspection of a pinned or attested client, or code that mints tokens. Those are exactly the controls the brief says not to bypass, so **this investigation stops here.** An authorised option with no circumvention: use the app yourself on a real console save and **screen-record every Zelda Notes screen** (Phase 0 package A1), which yields the UI inventory without touching any protocol.

## 8. Boundaries we keep

- No mock of Nintendo's backend, no forged web-service tokens, no replication of the attestation, no pinning bypass, no use of nxapi's token flow.
- No copying of Nintendo's web content (text, art, quiz questions, Gossip photos). We recreate behaviour only.
- The decompiled sources and APK are kept outside the repository and are not redistributed.

## 9. Impact on the plan

1. **Server-mediated, confirmed from the app side.** The core design (no dependency on Nintendo; everything computed from local game state and our own history) stands and is now better justified.
2. **A phone/second-screen companion is not needed to be "linked" to the game over any protocol**: there is none to emulate. The "second screen" is purely our own app.
3. **The official app has no map art or ocarina audio to reuse** (it is all in the remote web app), which also removes any temptation to extract assets from the APK.
4. **Feature scope** now follows Nintendo's 11 features (section 6); `FEATURE_PARITY_MATRIX.md` was updated accordingly (Threads of Time+ tapestry with cutscene replay, rupee-for-hint, medals, leaderboards, automatic screenshots, 5-scan amiibo rule).
5. **Cutscene replay (Threads of Time+)** would need the ability to start cutscenes in the running game. The bridge has no such command (it has `teleport` and `age`); this feature is classified **R** (substantial reverse engineering) and write-capable.
6. **Medals** and **leaderboard** semantics are Nintendo-defined; ours would be locally defined.

## 10. Phase 0 package A, revised

| Step | Status |
|---|---|
| A1 Live walk-through by the user, screen-recorded | Still needed for the **web UI** (the APK cannot show it). |
| A2 Offline/online matrix | Partly answered (needs server); confirm behaviour in airplane mode. |
| A3 Static APK analysis | **Done** (this document). |
| A4 Network observation | **Not performed, and not planned** unless counsel confirms it can be done without bypassing pinning/attestation. |
| A5 Game-side service names from the user's dump | Open. The dump exists locally (`RESEARCH_SOURCES.md`), but static string search of the lifted image is not yet done. |

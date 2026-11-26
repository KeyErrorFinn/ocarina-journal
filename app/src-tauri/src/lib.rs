use std::sync::{atomic::Ordering, Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use oj_bridge::{spawn, BridgeEvent, Config, LocalConnector};
use oj_journal::{Journal, Snapshot, Totals};
use oj_protocol::Game;
use oj_savefile::SlotSummary;
use serde::{Deserialize, Serialize};
use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager, State};

mod platform;
mod ui_state;
mod update;

/// How the app is getting its data (see docs/research/COMPANION_APP_ARCHITECTURE.md).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum Mode {
    /// The bridge answers: live data.
    Live,
    /// Longshot is running but its control pipe is not available (the bridge was not enabled at launch).
    BridgeOff,
    /// The game is not running: only saved data.
    #[default]
    Offline,
}

/// Everything the UI shows; sent whole on each change (it is small).
#[derive(Debug, Clone, Default, Serialize)]
struct LiveState {
    ui_state: ui_state::UiState,
    /// Linux launches use HOS_CONTROL in the process environment, not the persistent Windows env-file switch.
    bridge_config_supported: bool,
    mode: Mode,
    connected: bool,
    game_running: bool,
    pipe: String,
    version: Option<String>,
    game: Option<Game>,
    samples_dropped: u64,
    last_error: Option<String>,
    journal: Snapshot,
    save_dir: Option<String>,
    /// True when `save_dir` is the folder the player chose, not the one found automatically.
    save_dir_chosen: bool,
    saves: Vec<SlotSummary>,
    /// Whether the player asked for a check at every start.
    /// This app's own version.
    app_version: String,
    /// The second screen (a paired browser on the same network).
    remote: RemoteInfo,
    update_check_auto: bool,
    /// What the last update check found (not kept between runs).
    update: Option<update::UpdateInfo>,
    /// The game folder, from the running process or the default install location.
    game_dir: Option<String>,
    /// Earlier days, newest first (kept on disk).
    history: Vec<DaySummary>,
    /// What each game save changed, newest first (kept on disk). Works without the bridge.
    save_log: Vec<SaveEvent>,
}

impl LiveState {
    fn update_mode(&mut self) {
        self.mode = if self.connected {
            Mode::Live
        } else if self.game_running {
            Mode::BridgeOff
        } else {
            Mode::Offline
        };
    }
}

// ------------------------------------------------------------------------------------------------ journal on disk
/// A finished journal day. The day runs from 05:00 to 04:59, like the original app's.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct DaySummary {
    date: String,
    start_ms: u64,
    totals: Totals,
}

#[derive(Serialize, Deserialize)]
struct JournalFile {
    day_start_ms: u64,
    snapshot: Snapshot,
}

const MAX_DAYS: usize = 120;

fn data_dir() -> Option<std::path::PathBuf> {
    platform::data_dir()
}

fn write_atomic(path: &std::path::Path, bytes: &[u8]) {
    let tmp = path.with_extension("tmp");
    if std::fs::write(&tmp, bytes).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

/// Start of the journal day containing `now_ms`, in local time.
fn day_start_ms(now_ms: u64) -> u64 {
    day_start_in(now_ms, jiff::tz::TimeZone::system())
}

fn day_start_in(now_ms: u64, zone: jiff::tz::TimeZone) -> u64 {
    let Some(now) = i64::try_from(now_ms).ok().and_then(|ms| jiff::Timestamp::from_millisecond(ms).ok()) else {
        return now_ms;
    };
    let now = now.to_zoned_datetime(zone.clone());
    let date = if now.hour() < 5 { now.date().yesterday().ok() } else { Some(now.date()) };
    date.and_then(|d| zone.to_ambiguous_zoned_datetime(d.at(5, 0, 0, 0)).compatible().ok())
        .and_then(|start| u64::try_from(start.timestamp().as_millisecond()).ok())
        .unwrap_or(now_ms)
}

fn date_of(ms: u64) -> String {
    i64::try_from(ms)
        .ok()
        .and_then(|ms| jiff::Timestamp::from_millisecond(ms).ok())
        .map(|t| t.to_zoned_datetime(jiff::tz::TimeZone::system()).strftime("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

fn load_history() -> Vec<DaySummary> {
    data_dir()
        .and_then(|d| std::fs::read(d.join("history.json")).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save_history(h: &[DaySummary]) {
    if let (Some(d), Ok(b)) = (data_dir(), serde_json::to_vec(h)) {
        write_atomic(&d.join("history.json"), &b);
    }
}

fn save_journal(day_start_ms: u64, snapshot: &Snapshot) {
    if let Some(d) = data_dir() {
        if let Ok(b) = serde_json::to_vec(&JournalFile { day_start_ms, snapshot: snapshot.clone() }) {
            write_atomic(&d.join("journal.json"), &b);
        }
    }
}

/// Resumes today's journal from disk, or archives an older one into the history.
fn load_journal(now_ms: u64, history: &mut Vec<DaySummary>) -> (Journal, u64) {
    let today = day_start_ms(now_ms);
    let saved: Option<JournalFile> = data_dir()
        .and_then(|d| std::fs::read(d.join("journal.json")).ok())
        .and_then(|b| serde_json::from_slice(&b).ok());
    match saved {
        Some(f) if f.day_start_ms == today => (Journal::from_snapshot(f.snapshot), today),
        Some(f) => {
            archive(history, f.day_start_ms, &f.snapshot.totals);
            (Journal::new(), today)
        }
        None => (Journal::new(), today),
    }
}

fn archive(history: &mut Vec<DaySummary>, start_ms: u64, totals: &Totals) {
    if totals.play_secs < 1.0 {
        return;
    }
    history.retain(|d| d.start_ms != start_ms);
    history.insert(0, DaySummary { date: date_of(start_ms), start_ms, totals: totals.clone() });
    history.truncate(MAX_DAYS);
    save_history(history);
}

// ------------------------------------------------------------------------------------------------- the save log
/// One save the game wrote, and what it changed since the slot's previous save: found chests, Gold Skulltulas and so
/// on, rupees, and where Link saved. Made by comparing the saves themselves, so it needs neither the bridge nor the app
/// to be open while playing (the app compares when it next reads the saves).
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SaveEvent {
    wall_ms: u64,
    slot: String,
    /// The game's map name where Link saved (`KokiriForest_Child`), and its place name.
    map: Option<String>,
    place: Option<String>,
    age: Option<String>,
    /// Category id -> how many more the slot has (only increases).
    gains: std::collections::BTreeMap<String, u32>,
    rupees: i64,
}

/// What the app last saw of each slot.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct SeenSlot {
    modified_ms: u64,
    have: std::collections::BTreeMap<String, u32>,
    rupees: i64,
    place: Option<String>,
}

const MAX_SAVE_EVENTS: usize = 2000;

fn load_json<T: serde::de::DeserializeOwned + Default>(name: &str) -> T {
    data_dir()
        .and_then(|d| std::fs::read(d.join(name)).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn store_json<T: Serialize>(name: &str, v: &T) {
    if let (Some(d), Ok(b)) = (data_dir(), serde_json::to_vec(v)) {
        write_atomic(&d.join(name), &b);
    }
}

/// Compares every slot in `report` with what was seen before and logs each slot that changed. Returns the whole log
/// when something was added. The first look at a slot only records it.
fn note_saves(save_dir: &std::path::Path, report: &serde_json::Value) -> Option<Vec<SaveEvent>> {
    let mut seen: std::collections::BTreeMap<String, SeenSlot> = load_json("saves_seen.json");
    let mut added = vec![];
    for s in report["slots"].as_array()? {
        let Some(slot) = s["slot"].as_str() else { continue };
        let modified_ms = std::fs::metadata(save_dir.join(slot).join("progress.sav"))
            .and_then(|m| m.modified())
            .ok()
            .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis() as u64);
        let have: std::collections::BTreeMap<String, u32> = s["totals"]
            .as_object()
            .map(|t| t.iter().filter_map(|(k, v)| Some((k.clone(), v.get(0)?.as_u64()? as u32))).collect())
            .unwrap_or_default();
        let now = SeenSlot {
            modified_ms,
            have,
            rupees: s["rupees"].as_i64().unwrap_or(0),
            place: s["place"]["name"].as_str().map(String::from),
        };
        match seen.get(slot) {
            Some(before) if before.modified_ms < now.modified_ms => {
                let gains: std::collections::BTreeMap<String, u32> = now
                    .have
                    .iter()
                    .filter_map(|(k, v)| {
                        v.checked_sub(*before.have.get(k).unwrap_or(&0)).filter(|d| *d > 0).map(|d| (k.clone(), d))
                    })
                    .collect();
                let rupees = now.rupees - before.rupees;
                // The game rewrites untouched slots now and then; only real changes go in the log.
                if !gains.is_empty() || rupees != 0 || now.place != before.place {
                    added.push(SaveEvent {
                        wall_ms: now.modified_ms,
                        slot: slot.into(),
                        map: s["place"]["area"].as_str().filter(|m| !m.is_empty()).map(String::from),
                        place: now.place.clone(),
                        age: s["age"].as_str().map(String::from),
                        gains,
                        rupees,
                    });
                }
                seen.insert(slot.into(), now);
            }
            Some(_) => {}
            None => {
                seen.insert(slot.into(), now);
            }
        }
    }
    store_json("saves_seen.json", &seen);
    if added.is_empty() {
        return None;
    }
    let mut log: Vec<SaveEvent> = load_json("save_log.json");
    log.extend(added);
    log.sort_by_key(|a| std::cmp::Reverse(a.wall_ms));
    log.truncate(MAX_SAVE_EVENTS);
    store_json("save_log.json", &log);
    Some(log)
}

struct Shared(Arc<Mutex<LiveState>>);

#[derive(Serialize, Clone)]
struct ReportFile {
    modified_ms: u64,
    report: serde_json::Value,
}

/// Built once per change of the saves; building the catalogue reads the game's files (about half a second).
#[derive(Default)]
struct ReportCache {
    game: Option<(std::path::PathBuf, Arc<oj_gamedata::Game>)>,
    built: Option<(std::path::PathBuf, u64, ReportFile)>,
}

struct Reports(Mutex<ReportCache>);

// ----------------------------------------------------------------------------------------------- the save folder
/// What the player chose in the menu, kept in the app's own folder (never in Longshot's).
#[derive(Debug, Serialize, Deserialize)]
#[serde(default)]
struct Settings {
    save_dir: Option<String>,
    /// Look for a newer release when the app starts. On unless the player switches it off.
    auto_update_check: bool,
    /// The second screen was on when the app last ran, so it starts again. Off until the player turns it on.
    remote: bool,
    /// ...and it was open to other devices on the network (not just this PC).
    remote_lan: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { save_dir: None, auto_update_check: true, remote: false, remote_lan: false }
    }
}

/// The player's last choice for the second screen: (on, open to the network).
fn remote_choice() -> &'static Mutex<(bool, bool)> {
    static CHOICE: std::sync::OnceLock<Mutex<(bool, bool)>> = std::sync::OnceLock::new();
    CHOICE.get_or_init(|| {
        let s: Settings = load_json("settings.json");
        Mutex::new((s.remote, s.remote && s.remote_lan))
    })
}

fn auto_update_check() -> &'static std::sync::atomic::AtomicBool {
    static AUTO: std::sync::OnceLock<std::sync::atomic::AtomicBool> = std::sync::OnceLock::new();
    AUTO.get_or_init(|| std::sync::atomic::AtomicBool::new(load_json::<Settings>("settings.json").auto_update_check))
}

/// Writes every setting back together, so changing one never drops another.
fn persist_settings() {
    let save_dir = chosen_save_dir().lock().unwrap().as_ref().map(|p| p.display().to_string());
    let (remote, remote_lan) = *remote_choice().lock().unwrap();
    store_json(
        "settings.json",
        &Settings { save_dir, auto_update_check: auto_update_check().load(Ordering::Relaxed), remote, remote_lan },
    );
}

fn chosen_save_dir() -> &'static Mutex<Option<std::path::PathBuf>> {
    static CHOSEN: std::sync::OnceLock<Mutex<Option<std::path::PathBuf>>> = std::sync::OnceLock::new();
    CHOSEN.get_or_init(|| {
        let s: Settings = load_json("settings.json");
        Mutex::new(s.save_dir.map(std::path::PathBuf::from))
    })
}

/// The user save folder to read: the one the player chose (if it still holds saves), else the newest found near the
/// game folder `game_dir` or in Longshot's data folder.
fn save_dir(game_dir: Option<&str>) -> Option<std::path::PathBuf> {
    let chosen = chosen_save_dir().lock().unwrap().clone();
    chosen.and_then(|c| oj_savefile::resolve_save_dir(&c)).or_else(|| {
        let game = find_game_dir(game_dir);
        oj_savefile::default_save_dir_near(game.as_deref())
    })
}

/// `save_dir` for the game folder the app currently knows of.
fn current_save_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    let game_dir = app.state::<Shared>().0.lock().unwrap().game_dir.clone();
    save_dir(game_dir.as_deref())
}

/// Whether the folder in use came from the player's choice rather than the automatic search.
fn save_dir_is_chosen() -> bool {
    let chosen = chosen_save_dir().lock().unwrap().clone();
    chosen.is_some_and(|c| oj_savefile::resolve_save_dir(&c).is_some())
}

/// Looks up the newest release (the app's only network call) and shares the answer. Used by the button and by the start-up
/// check.
async fn run_update_check(app: &AppHandle) -> Result<update::UpdateInfo, String> {
    let found = tauri::async_runtime::spawn_blocking(|| update::check(env!("CARGO_PKG_VERSION")))
        .await
        .map_err(|e| e.to_string())??;
    let snap = {
        let shared = app.state::<Shared>();
        let mut s = shared.0.lock().unwrap();
        s.update = Some(found.clone());
        s.clone()
    };
    emit(app, &snap);
    Ok(found)
}

/// Only when the player presses "Check for updates".
#[tauri::command]
async fn check_for_update(app: AppHandle) -> Result<update::UpdateInfo, String> {
    run_update_check(&app).await
}

/// The "check when the app starts" switch (on unless the player turned it off).
#[tauri::command]
fn set_auto_update_check(app: AppHandle, on: bool) {
    auto_update_check().store(on, Ordering::Relaxed);
    persist_settings();
    let snap = {
        let shared = app.state::<Shared>();
        let mut s = shared.0.lock().unwrap();
        s.update_check_auto = on;
        s.clone()
    };
    emit(&app, &snap);
}

/// Opens the release page found by the last check in the browser. The address comes from the check, not from the page.
#[tauri::command]
fn open_release_page(app: AppHandle) {
    use tauri_plugin_opener::OpenerExt;
    let url = app.state::<Shared>().0.lock().unwrap().update.as_ref().map(|u| u.url.clone());
    if let Some(url) = url {
        let _ = app.opener().open_url(url, None::<&str>);
    }
}

/// Opens the system's folder picker and returns the chosen folder, or `None` if it was cancelled. Nothing is read or changed here.
#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let start = chosen_save_dir().lock().unwrap().clone();
    let mut dialog = app.dialog().file().set_title("Choose the folder that holds your saves");
    if let Some(dir) = start.filter(|d| d.is_dir()) {
        dialog = dialog.set_directory(dir);
    }
    dialog.blocking_pick_folder().and_then(|p| p.into_path().ok()).map(|p| p.display().to_string())
}

/// Sets (or, with an empty path, clears) the folder to read saves from. Read-only: the folder is only listed and read.
#[tauri::command]
fn set_save_dir(app: AppHandle, path: String) -> Result<Option<String>, String> {
    let path = path.trim().trim_matches('"');
    let resolved = if path.is_empty() {
        None
    } else {
        let given = std::path::PathBuf::from(path);
        if !given.is_dir() {
            return Err("That folder doesn't exist.".into());
        }
        let found = oj_savefile::resolve_save_dir(&given).ok_or(
            "No saves found there. Pick the folder that holds your slot_00, slot_01, ... folders, or the one above it.",
        )?;
        Some(found)
    };
    *chosen_save_dir().lock().unwrap() = resolved.clone();
    persist_settings();
    let snap = {
        let shared = app.state::<Shared>();
        let mut s = shared.0.lock().unwrap();
        s.save_dir = save_dir(s.game_dir.as_deref()).map(|p| p.display().to_string());
        s.save_dir_chosen = save_dir_is_chosen();
        s.saves = s.save_dir.as_deref().map(|d| oj_savefile::list_slots(std::path::Path::new(d))).unwrap_or_default();
        s.clone()
    };
    app.state::<Reports>().0.lock().unwrap().built = None;
    emit(&app, &snap);
    Ok(snap.save_dir)
}

/// The game folder: `OJ_GAME`, the running game's folder, else the newest build under `~/Games/Longshot` (directly, or inside a channel folder such as `stable/`).
fn find_game_dir(running: Option<&str>) -> Option<std::path::PathBuf> {
    let ok = |p: &std::path::Path| p.join("romfs").join("GameData").is_dir() || p.join("GameData").is_dir();
    if let Some(p) = std::env::var_os("OJ_GAME").map(std::path::PathBuf::from).filter(|p| ok(p)) {
        return Some(p);
    }
    if let Some(p) = running.map(std::path::PathBuf::from).filter(|p| ok(p)) {
        return Some(p);
    }
    newest_build(&platform::home_dir()?.join("Games").join("Longshot"))
}

fn newest_build(root: &std::path::Path) -> Option<std::path::PathBuf> {
    let ok = |p: &std::path::Path| p.join("romfs").join("GameData").is_dir() || p.join("GameData").is_dir();
    if ok(root) {
        return Some(root.to_path_buf());
    }
    // Builds sit either directly under the root (`v3.0.0-rc.4`) or one level deeper, under a release channel
    // (`stable/v3.1.1`); look at both and take the most recently changed.
    let subdirs = |p: &std::path::Path| -> Vec<std::path::PathBuf> {
        std::fs::read_dir(p).into_iter().flatten().flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect()
    };
    let mut dirs = Vec::new();
    for first in subdirs(root) {
        if ok(&first) {
            dirs.push(first);
        } else {
            dirs.extend(subdirs(&first).into_iter().filter(|p| ok(p)));
        }
    }
    dirs.sort_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok());
    dirs.pop()
}

fn newest_save_ms(dir: &std::path::Path) -> u64 {
    std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| std::fs::metadata(e.path().join("progress.sav")).and_then(|m| m.modified()).ok())
        .filter_map(|m| m.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .max()
        .unwrap_or(0)
}

/// A hand-made report file, used when the game folder cannot be read (`OJ_REPORT`, or the app folder under LOCALAPPDATA).
fn report_file() -> Option<ReportFile> {
    let path = std::env::var_os("OJ_REPORT")
        .map(std::path::PathBuf::from)
        .or_else(|| Some(data_dir()?.join("report.json")))?;
    let modified_ms =
        std::fs::metadata(&path).and_then(|m| m.modified()).ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64;
    Some(ReportFile { modified_ms, report: serde_json::from_slice(&std::fs::read(&path).ok()?).ok()? })
}

fn build_report(cache: &mut ReportCache, game_dir: Option<&str>) -> Result<Option<ReportFile>, String> {
    let saves = save_dir(game_dir).ok_or("no Longshot save folder found")?;
    let stamp = newest_save_ms(&saves);
    let dir =
        find_game_dir(game_dir).ok_or("no Longshot game folder found (set OJ_GAME to the folder that holds romfs)")?;
    if let Some((d, s, r)) = &cache.built {
        if *d == dir && *s == stamp {
            return Ok(Some(r.clone()));
        }
    }
    let game = match &cache.game {
        Some((d, g)) if *d == dir => g.clone(),
        _ => {
            let g = Arc::new(oj_gamedata::Game::open(&dir).map_err(|e| e.to_string())?);
            cache.game = Some((dir.clone(), g.clone()));
            g
        }
    };
    let rep = game.report(&saves, None).map_err(|e| e.to_string())?;
    let file = ReportFile { modified_ms: stamp, report: serde_json::to_value(rep).map_err(|e| e.to_string())? };
    cache.built = Some((dir, stamp, file.clone()));
    Ok(Some(file))
}

/// The save report: every collectible with its name, area and position, made here from the player's own game files
/// (read-only). Falls back to a report file if the game folder cannot be read. `Err` says why nothing could be built.
#[tauri::command]
async fn get_report(app: AppHandle) -> Result<Option<ReportFile>, String> {
    report_of(&app).await
}

async fn report_of(app: &AppHandle) -> Result<Option<ReportFile>, String> {
    let game_dir = app.state::<Shared>().0.lock().unwrap().game_dir.clone();
    let handle = app.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        let reports = handle.state::<Reports>();
        let mut cache = reports.0.lock().unwrap();
        build_report(&mut cache, game_dir.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?;
    match res {
        Ok(r) => {
            if let (Some(file), Some(dir)) = (&r, current_save_dir(app)) {
                if let Some(log) = note_saves(&dir, &file.report) {
                    let snap = {
                        let shared = app.state::<Shared>();
                        let mut s = shared.0.lock().unwrap();
                        s.save_log = log;
                        s.clone()
                    };
                    emit(app, &snap);
                }
            }
            Ok(r)
        }
        Err(e) => report_file().map(Some).ok_or(e),
    }
}

// ------------------------------------------------------------------------------------------------- the game's maps
/// The game's own map pictures and where things fall on them, read from the player's game folder. Decoded pictures
/// are cached under the app's folder in LOCALAPPDATA (they never leave the PC and are not part of the app).
#[derive(Default)]
struct Maps(Mutex<Option<(std::path::PathBuf, Arc<oj_gamedata::files::GameFiles>, serde_json::Value)>>);

fn map_source(
    app: &AppHandle,
) -> Result<(std::path::PathBuf, Arc<oj_gamedata::files::GameFiles>, serde_json::Value), String> {
    let game_dir = app.state::<Shared>().0.lock().unwrap().game_dir.clone();
    let dir = find_game_dir(game_dir.as_deref())
        .ok_or("no Longshot game folder found (set OJ_GAME to the folder that holds romfs)")?;
    let maps = app.state::<Maps>();
    let mut slot = maps.0.lock().unwrap();
    if let Some((d, f, i)) = slot.as_ref().filter(|(d, _, _)| *d == dir) {
        return Ok((d.clone(), f.clone(), i.clone()));
    }
    let files = Arc::new(oj_gamedata::files::GameFiles::open(&dir).map_err(|e| e.to_string())?);
    let index = serde_json::to_value(oj_gamedata::maps::map_index(&files).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    *slot = Some((dir.clone(), files.clone(), index.clone()));
    Ok((dir, files, index))
}

#[tauri::command]
async fn get_map_index(app: AppHandle) -> Result<serde_json::Value, String> {
    map_index_of(app).await
}

async fn map_index_of(app: AppHandle) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || map_source(&app).map(|(_, _, i)| i))
        .await
        .map_err(|e| e.to_string())?
}

/// The Threads of Time tapestry's sections, from the same game folder as the maps.
#[tauri::command]
async fn get_tapestry(app: AppHandle) -> Result<oj_gamedata::tapestry::Tapestry, String> {
    tapestry_of(app).await
}

async fn tapestry_of(app: AppHandle) -> Result<oj_gamedata::tapestry::Tapestry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, files, _) = map_source(&app)?;
        oj_gamedata::tapestry::tapestry_index(&files).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_lore(app: AppHandle) -> Result<oj_gamedata::lore::Lore, String> {
    lore_of(app).await
}

async fn lore_of(app: AppHandle) -> Result<oj_gamedata::lore::Lore, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, files, _) = map_source(&app)?;
        oj_gamedata::lore::lore(&files).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// One of the game's ocarina sounds (a note, or the game's recording of a song) as WAV bytes, decoded from the player's
/// own game files. Only ocarina sounds can be asked for (see `oj_gamedata::sound::allowed`).
#[tauri::command]
async fn get_sound(app: AppHandle, name: String, whole: bool) -> Result<tauri::ipc::Response, String> {
    sound_of(app, name, whole).await.map(tauri::ipc::Response::new)
}

async fn sound_of(app: AppHandle, name: String, whole: bool) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, files, _) = map_source(&app)?;
        // Notes are long sustained recordings; four seconds is plenty for a held note. Songs (`whole`) play to the end.
        let secs = if whole { 60.0 } else { 4.0 };
        oj_gamedata::sound::wav(&files, &name, secs).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_rumors(app: AppHandle) -> Result<Vec<oj_gamedata::rumors::Rumor>, String> {
    rumors_of(app).await
}

async fn rumors_of(app: AppHandle) -> Result<Vec<oj_gamedata::rumors::Rumor>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, files, _) = map_source(&app)?;
        oj_gamedata::rumors::rumors(&files).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Magic bean soft soil, where each is and the route of the ride that grows from it.
#[tauri::command]
async fn get_bean_soil(app: AppHandle) -> Result<Vec<oj_gamedata::beans::BeanSpot>, String> {
    bean_soil_of(app).await
}

async fn bean_soil_of(app: AppHandle) -> Result<Vec<oj_gamedata::beans::BeanSpot>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, files, _) = map_source(&app)?;
        oj_gamedata::beans::bean_spots(&files).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// One picture (`world`, `field/<texture>`, `floor/<dungeon>/<floor>`, `tapestry/<layer>`) as JPEG or PNG bytes.
#[tauri::command]
async fn get_map_image(app: AppHandle, name: String) -> Result<tauri::ipc::Response, String> {
    map_image_of(app, name).await.map(tauri::ipc::Response::new)
}

async fn map_image_of(app: AppHandle, name: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let (dir, files, _) = map_source(&app)?;
        let build = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let file = data_dir()
            .map(|d| {
                d.join("maps").join(build.replace(|c: char| !c.is_ascii_alphanumeric() && c != '.' && c != '-', "_"))
            })
            .map(|d| {
                d.join(format!(
                    "{}.{}",
                    name.replace('/', "~"),
                    if oj_gamedata::maps::is_painting(&name) { "jpg" } else { "png" }
                ))
            });
        if let Some(bytes) = file.as_ref().and_then(|f| std::fs::read(f).ok()) {
            return Ok(bytes);
        }
        let (bytes, _) = oj_gamedata::maps::map_file(&files, &name).map_err(|e| e.to_string())?;
        if let Some(f) = file {
            if f.parent().is_some_and(|p| std::fs::create_dir_all(p).is_ok()) {
                write_atomic(&f, &bytes);
            }
        }
        Ok(bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}

// -------------------------------------------------------------------------------------------- consented actions
#[derive(Serialize)]
struct BridgePreview {
    path: String,
    exists: bool,
    already: Option<String>,
    before: String,
    after: String,
}

fn env_file(state: &Shared) -> Result<std::path::PathBuf, String> {
    let dir = state.0.lock().unwrap().game_dir.clone();
    let dir = find_game_dir(dir.as_deref()).ok_or("The game folder was not found.")?;
    Ok(dir.join("longshot_env.txt"))
}

/// What turning the bridge on would change in `longshot_env.txt`. Changes nothing.
#[tauri::command]
fn preview_enable_bridge(state: State<'_, Shared>) -> Result<BridgePreview, String> {
    if !cfg!(windows) {
        return Err("On Linux, use Start game once, or start Longshot with HOS_CONTROL matching OJ_PIPE.".into());
    }
    let path = env_file(&state)?;
    let before = std::fs::read_to_string(&path).unwrap_or_default();
    let already = before.lines().find_map(|l| l.trim().strip_prefix("HOS_CONTROL=").map(|v| v.trim().to_string()));
    let line = format!("HOS_CONTROL={}", pipe_name());
    let eol = if before.contains("\r\n") { "\r\n" } else { "\n" };
    let after = match &already {
        Some(_) => before.clone(),
        None if before.is_empty() || before.ends_with('\n') => format!("{before}{line}{eol}"),
        None => format!("{before}{eol}{line}{eol}"),
    };
    Ok(BridgePreview { path: path.display().to_string(), exists: path.is_file(), already, before, after })
}

/// Writes the previewed change after copying the old file to a timestamped backup. Needs `confirm: true`, which the
/// UI only sends after the player has seen the preview and pressed the button. The game must be restarted to use it.
#[tauri::command]
fn apply_enable_bridge(state: State<'_, Shared>, confirm: bool) -> Result<String, String> {
    if !confirm {
        return Err("not confirmed".into());
    }
    let preview = preview_enable_bridge(state)?;
    if let Some(v) = &preview.already {
        return Err(format!("HOS_CONTROL is already set ({v}). Nothing was changed."));
    }
    let path = std::path::PathBuf::from(&preview.path);
    if preview.exists {
        let stamp = jiff::ZonedDateTime::now().strftime("%Y%m%d-%H%M%S").to_string();
        let backup = path.with_file_name(format!("longshot_env.txt.oj-backup-{stamp}"));
        std::fs::copy(&path, &backup).map_err(|e| format!("could not back up the file: {e}"))?;
    }
    std::fs::write(&path, preview.after).map_err(|e| format!("could not write {}: {e}", path.display()))?;
    let note = if preview.exists { "The old file was backed up beside it." } else { "The file did not exist before." };
    Ok(format!("Done. Restart Longshot to use the bridge. {note}"))
}

/// Starts Longshot with the control bridge on, using the player's own saves. Needs `confirm: true` from the UI.
#[tauri::command]
fn launch_game(state: State<'_, Shared>, confirm: bool) -> Result<String, String> {
    if !confirm {
        return Err("not confirmed".into());
    }
    if state.0.lock().unwrap().game_running {
        return Err("Longshot is already running.".into());
    }
    let known = state.0.lock().unwrap().game_dir.clone();
    let dir = find_game_dir(known.as_deref()).ok_or("The game folder was not found.")?;
    let exe = platform::game_binary(&dir);
    if !exe.is_file() {
        return Err(format!("{} does not exist.", exe.display()));
    }
    let endpoint = pipe_name();
    #[cfg(unix)]
    {
        // A Unix socket path must be absolute and fit sockaddr_un (108 bytes, with the terminator).
        if !std::path::Path::new(&endpoint).is_absolute() || endpoint.len() >= 108 {
            return Err(
                "Set OJ_PIPE to a short absolute socket path in a private folder you own, then restart the app.".into(),
            );
        }
    }
    let mut cmd = std::process::Command::new(&exe);
    cmd.current_dir(&dir).env("HOS_CONTROL", endpoint);
    // Without --user a directly started game makes a new empty save folder inside the game folder.
    // A save folder the player chose outside the usual layout can't be passed on, and starting the game on other
    // saves than the ones shown would mislead; so say so and let them start Longshot themselves.
    let user = match save_dir(known.as_deref()) {
        Some(d) => Some(oj_savefile::data_dir_of(&d).ok_or(
            "Your chosen save folder isn't inside a Longshot data folder, so the app can't start the game on it. Start Longshot yourself.",
        )?),
        None => oj_savefile::default_data_dir(),
    };
    if let Some(user) = user {
        cmd.arg("--user").arg(user);
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok("Longshot is starting with the bridge on.".into())
}

// ------------------------------------------------------------------------------------------------- the window itself
/// Keeps the window above other windows (or stops doing so). The window is the app's own; nothing else is touched.
#[tauri::command]
fn set_pinned(window: tauri::WebviewWindow, on: bool) -> Result<(), String> {
    window.set_always_on_top(on).map_err(|e| e.to_string())
}

/// Shows or hides the window's title bar and border (hidden, the page draws its own strip to drag it by).
#[tauri::command]
fn set_frame(window: tauri::WebviewWindow, visible: bool) -> Result<(), String> {
    window.set_decorations(visible).map_err(|e| e.to_string())
}

/// Starts moving the window with the mouse, for the strip drawn when the frame is hidden.
#[tauri::command]
fn drag_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

/// Closes the app (the frame's close button is gone while the frame is hidden).
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn get_state(state: State<'_, Shared>) -> LiveState {
    state.0.lock().unwrap().clone()
}

/// The pipe name must match Longshot's `HOS_CONTROL` value. Override with `OJ_PIPE`.
fn pipe_name() -> String {
    platform::bridge_endpoint()
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn emit(handle: &AppHandle, s: &LiveState) {
    let _ = handle.emit("live-state", s);
    if let Some(server) = running_remote(handle) {
        server.push(&remote_view(s));
    }
}

// --------------------------------------------------------------------------------------------------- second screen
/// What the Settings page shows about the second screen.
#[derive(Debug, Clone, Default, Serialize)]
struct RemoteInfo {
    enabled: bool,
    /// Reachable from other devices on the network (otherwise only from this PC).
    lan: bool,
    /// The address to open.
    url: Option<String>,
    /// The same address with the pairing code in it: what the QR code holds. The page uses the code once and removes it
    /// from the address bar; the 4-digit code is never in it.
    link: Option<String>,
    /// The pairing code, `ABCD-EFGH`.
    code: Option<String>,
    /// When the 4-digit code stops being the current one (milliseconds since 1970). The code itself is not part of the
    /// state: the Settings page asks for it (`get_remote_pin`) only while the player has it shown.
    pin_ends_ms: Option<u64>,
    /// Screens that have paired.
    screens: Vec<RemoteScreen>,
    error: Option<String>,
}

/// A paired screen as it is kept between runs (the cookie's token is never kept, only its hash).
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedScreen {
    id: String,
    token_hash: String,
    name: String,
    addr: String,
    since_ms: u64,
    /// Last time it used the page, in milliseconds since 1970 (0 in a file from before this was kept).
    #[serde(default)]
    last_seen_ms: u64,
}

const SESSIONS_FILE: &str = "remote_sessions.json";

fn load_sessions() -> Vec<oj_remote::SavedSession> {
    load_json::<Vec<SavedScreen>>(SESSIONS_FILE)
        .into_iter()
        .map(|x| oj_remote::SavedSession {
            id: x.id,
            token_hash: x.token_hash,
            name: x.name,
            addr: x.addr,
            since_ms: x.since_ms,
            last_seen_ms: if x.last_seen_ms == 0 { now_ms() } else { x.last_seen_ms },
        })
        .collect()
}

/// Keeps the paired screens so they are still paired the next time the app runs. Written only when the list changed.
fn save_sessions(server: &oj_remote::Server) {
    static LAST: Mutex<String> = Mutex::new(String::new());
    let list: Vec<SavedScreen> = server
        .saved_sessions()
        .into_iter()
        .map(|x| SavedScreen {
            id: x.id,
            token_hash: x.token_hash,
            name: x.name,
            addr: x.addr,
            since_ms: x.since_ms,
            last_seen_ms: x.last_seen_ms,
        })
        .collect();
    let json = serde_json::to_string(&list).unwrap_or_default();
    let mut last = LAST.lock().unwrap();
    if *last != json {
        store_json(SESSIONS_FILE, &list);
        *last = json;
    }
}

#[derive(Debug, Clone, Serialize)]
struct RemoteScreen {
    id: String,
    name: String,
    addr: String,
    since_ms: u64,
    online: bool,
}

#[derive(Default)]
struct RemoteSlot(Mutex<Option<Arc<oj_remote::Server>>>);

/// The running second-screen server, if any. Callers use the copy and leave the slot unlocked, so nothing they ask of
/// the server can end up waiting for the slot.
fn running_remote(app: &AppHandle) -> Option<Arc<oj_remote::Server>> {
    app.state::<RemoteSlot>().0.lock().unwrap().clone()
}

/// The state a browser on another device gets: no folder paths, no pipe name, no error text that could hold one.
fn remote_view(s: &LiveState) -> serde_json::Value {
    let mut v = s.clone();
    v.save_dir = None;
    v.game_dir = None;
    v.pipe = String::new();
    v.last_error = None;
    v.remote = RemoteInfo::default();
    v.update = None;
    v.update_check_auto = false;
    serde_json::to_value(v).unwrap_or(serde_json::Value::Null)
}

struct RemoteBackend(AppHandle);

/// Updates only the app's shared progress file; game files, saves and desktop settings are unreachable here.
#[tauri::command]
fn sync_ui(
    app: AppHandle,
    key: String,
    value: serde_json::Value,
    initialize: bool,
) -> Result<ui_state::UiState, String> {
    let snap = {
        let shared = app.state::<Shared>();
        let mut s = shared.0.lock().unwrap();
        let mut next = s.ui_state.clone();
        next.apply(&key, value, initialize)?;
        if next.revision != s.ui_state.revision {
            let path = data_dir().ok_or("App data folder is unavailable.")?.join("shared_progress.json");
            let bytes = serde_json::to_vec(&next).map_err(|_| "Could not encode shared progress.")?;
            let temp = path.with_extension("tmp");
            std::fs::write(&temp, bytes).map_err(|_| "Could not save shared progress.")?;
            std::fs::rename(temp, path).map_err(|_| "Could not save shared progress.")?;
            s.ui_state = next;
        }
        s.clone()
    };
    emit(&app, &snap);
    Ok(snap.ui_state)
}

impl oj_remote::Backend for RemoteBackend {
    fn call(
        &self,
        cmd: String,
        args: serde_json::Value,
    ) -> futures::future::BoxFuture<'static, Result<oj_remote::Reply, String>> {
        use oj_remote::Reply;
        let app = self.0.clone();
        let name = args.get("name").and_then(|v| v.as_str()).map(str::to_string);
        let whole = args.get("whole").and_then(|v| v.as_bool()).unwrap_or(false);
        Box::pin(async move {
            let json = |v: Result<serde_json::Value, serde_json::Error>| v.map(Reply::Json).map_err(|e| e.to_string());
            match cmd.as_str() {
                "get_state" => Ok(Reply::Json(remote_view(&app.state::<Shared>().0.lock().unwrap()))),
                "sync_ui" => json(serde_json::to_value(sync_ui(
                    app,
                    args.get("key").and_then(|v| v.as_str()).ok_or("Missing progress key.")?.into(),
                    args.get("value").cloned().ok_or("Missing progress value.")?,
                    args.get("initialize").and_then(|v| v.as_bool()).unwrap_or(false),
                )?)),
                "get_report" => json(serde_json::to_value(report_of(&app).await?)),
                "get_map_index" => Ok(Reply::Json(map_index_of(app).await?)),
                "get_tapestry" => json(serde_json::to_value(tapestry_of(app).await?)),
                "get_lore" => json(serde_json::to_value(lore_of(app).await?)),
                "get_rumors" => json(serde_json::to_value(rumors_of(app).await?)),
                "get_bean_soil" => json(serde_json::to_value(bean_soil_of(app).await?)),
                "get_map_image" => map_image_of(app, name.ok_or("name is missing")?).await.map(Reply::Bytes),
                "get_sound" => sound_of(app, name.ok_or("name is missing")?, whole).await.map(Reply::Bytes),
                _ => Err("No such command.".into()),
            }
        })
    }
    fn state(&self) -> serde_json::Value {
        remote_view(&self.0.state::<Shared>().0.lock().unwrap())
    }
}

/// The app's own built page, served to the second screen.
struct AppPage(AppHandle);

impl oj_remote::Assets for AppPage {
    fn get(&self, path: &str) -> Option<(Vec<u8>, String)> {
        let asset = self.0.asset_resolver().get(path.to_string())?;
        Some((asset.bytes.to_vec(), asset.mime_type))
    }
}

/// Refreshes what the Settings page shows about the second screen from the running server.
fn refresh_remote(app: &AppHandle, error: Option<String>) {
    let info = match running_remote(app) {
        Some(server) => {
            save_sessions(&server);
            let addr = server.addr();
            let pin_ends_ms = server.pin().1;
            RemoteInfo {
                enabled: true,
                lan: !addr.ip().is_loopback(),
                url: Some(format!("http://{addr}/")),
                link: Some(format!("http://{addr}/?code={}", server.code().replace('-', ""))),
                code: Some(server.code()),
                pin_ends_ms: Some(pin_ends_ms),
                screens: server
                    .screens()
                    .into_iter()
                    .map(|x| RemoteScreen {
                        id: x.id,
                        name: x.name,
                        addr: x.addr,
                        since_ms: x.since_ms,
                        online: x.online,
                    })
                    .collect(),
                error,
            }
        }
        None => RemoteInfo { error, ..Default::default() },
    };
    let snap = {
        let shared = app.state::<Shared>();
        let mut s = shared.0.lock().unwrap();
        s.remote = info;
        s.clone()
    };
    emit(app, &snap);
    set_window_title(app, &snap.remote);
}

/// The window's name says how many screens have the page open, while the second screen is on.
fn set_window_title(app: &AppHandle, remote: &RemoteInfo) {
    let open = remote.screens.iter().filter(|x| x.online).count();
    let title = if remote.enabled {
        format!("Ocarina Journal · {open} {} connected", if open == 1 { "device" } else { "devices" })
    } else {
        "Ocarina Journal".to_string()
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&title);
    }
}

/// The player's choice for the second screen, from the Settings page: starts or stops it, and remembers the choice so it
/// comes back the next time the app starts.
#[tauri::command]
async fn set_remote(app: AppHandle, enabled: bool, lan: bool) -> Result<(), String> {
    let started = start_remote(&app, enabled, lan).await;
    if started.is_ok() {
        *remote_choice().lock().unwrap() = (enabled, enabled && lan);
        persist_settings();
    }
    started
}

/// Starts or stops the second screen. `lan` listens on this PC's private network address (never on every address);
/// without it only this PC can reach it.
async fn start_remote(app: &AppHandle, enabled: bool, lan: bool) -> Result<(), String> {
    let app = app.clone();
    // Stop first, so the port is free again for a restart with the other choice.
    let old = app.state::<RemoteSlot>().0.lock().unwrap().take();
    drop(old);
    if !enabled {
        refresh_remote(&app, None);
        return Ok(());
    }
    let bind = if lan {
        match oj_remote::private_lan_ip() {
            Some(ip) => ip,
            None => {
                let msg = "No private network address found (this PC isn't on a home or office network).".to_string();
                refresh_remote(&app, Some(msg.clone()));
                return Err(msg);
            }
        }
    } else {
        std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)
    };
    let changed = {
        let app = app.clone();
        Arc::new(move || refresh_remote(&app, None))
    };
    match oj_remote::start(oj_remote::Config {
        bind,
        port: 8765,
        backend: Arc::new(RemoteBackend(app.clone())),
        assets: Arc::new(AppPage(app.clone())),
        sessions: load_sessions(),
        idle_life: Duration::from_secs(7 * 24 * 60 * 60),
        on_change: changed,
    })
    .await
    {
        Ok(server) => {
            *app.state::<RemoteSlot>().0.lock().unwrap() = Some(Arc::new(server));
            refresh_remote(&app, None);
            Ok(())
        }
        Err(e) => {
            let msg = format!("Couldn't start the second screen: {e}");
            refresh_remote(&app, Some(msg.clone()));
            Err(msg)
        }
    }
}

/// A new pairing code; every paired screen has to pair again. (`async` so it never runs on the window's own thread.)
#[tauri::command]
async fn rotate_remote_code(app: AppHandle) {
    if let Some(server) = running_remote(&app) {
        server.rotate_code();
    }
    refresh_remote(&app, None);
}

/// The 4-digit code, for the Settings page while the player has it shown. Only the app's own window can ask.
#[tauri::command]
async fn get_remote_pin(app: AppHandle) -> Option<String> {
    running_remote(&app).map(|server| server.pin().0)
}

/// Signs one paired screen out; it has to pair again. `id` is the one the Settings page got from the list.
#[tauri::command]
async fn disconnect_remote_screen(app: AppHandle, id: String) {
    if let Some(server) = running_remote(&app) {
        server.disconnect(&id);
    }
    refresh_remote(&app, None);
}

/// Samples arrive about ten times a second; the UI does not need every one.
const EMIT_EVERY: Duration = Duration::from_millis(250);
/// How often to look for the game process and re-read the saves.
const POLL_EVERY: Duration = Duration::from_secs(3);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Shared(Arc::new(Mutex::new(LiveState {
            ui_state: load_json("shared_progress.json"),
            bridge_config_supported: cfg!(windows),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            pipe: pipe_name(),
            ..Default::default()
        }))))
        .manage(Reports(Mutex::new(ReportCache::default())))
        .manage(Maps::default())
        .manage(RemoteSlot::default())
        .invoke_handler(tauri::generate_handler![
            get_state,
            sync_ui,
            get_report,
            get_map_index,
            get_map_image,
            get_tapestry,
            get_lore,
            get_rumors,
            get_bean_soil,
            get_sound,
            preview_enable_bridge,
            apply_enable_bridge,
            launch_game,
            set_save_dir,
            pick_folder,
            check_for_update,
            set_auto_update_check,
            open_release_page,
            set_remote,
            rotate_remote_code,
            disconnect_remote_screen,
            get_remote_pin,
            set_pinned,
            set_frame,
            drag_window,
            quit_app
        ])
        .setup(|app| {
            let shared = app.state::<Shared>().0.clone();
            let auto = auto_update_check().load(Ordering::Relaxed);
            shared.lock().unwrap().update_check_auto = auto;
            if auto {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = run_update_check(&handle).await;
                });
            }

            // The second screen comes back the way the player left it.
            let (remote_on, remote_lan) = *remote_choice().lock().unwrap();
            if remote_on {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = start_remote(&handle, true, remote_lan).await;
                });
            }

            // Bridge client: live samples feed the journal.
            {
                let handle = app.handle().clone();
                let shared = shared.clone();
                tauri::async_runtime::spawn(async move {
                    let (bridge, mut rx) = spawn(LocalConnector { name: pipe_name() }, Config::default());
                    let mut history = load_history();
                    let (mut journal, mut day) = load_journal(now_ms(), &mut history);
                    {
                        let mut s = shared.lock().unwrap();
                        s.journal = journal.snapshot();
                        s.history = history.clone();
                        s.save_log = load_json("save_log.json");
                    }
                    let mut last_save = Instant::now();
                    let mut last_emit = Instant::now() - EMIT_EVERY;
                    while let Some(ev) = rx.recv().await {
                        let mut is_sample = false;
                        let snapshot = {
                            let mut s = shared.lock().unwrap();
                            match ev {
                                BridgeEvent::Connected(status) => {
                                    s.connected = true;
                                    s.last_error = None;
                                    s.version = status.and_then(|st| st.version);
                                }
                                BridgeEvent::Disconnected => {
                                    s.connected = false;
                                    s.game = None;
                                    save_journal(day, &journal.snapshot());
                                }
                                BridgeEvent::Sample { game, .. } => {
                                    is_sample = true;
                                    let now = now_ms();
                                    let today = day_start_ms(now);
                                    if today != day {
                                        archive(&mut history, day, &journal.snapshot().totals);
                                        journal = Journal::new();
                                        day = today;
                                        s.history = history.clone();
                                    }
                                    journal.push_sample(now, &game);
                                    if last_save.elapsed() >= Duration::from_secs(10) {
                                        save_journal(day, &journal.snapshot());
                                        last_save = Instant::now();
                                    }
                                    s.journal = journal.snapshot();
                                    s.game = Some(*game);
                                }
                                BridgeEvent::ServerError { error, message } => {
                                    s.last_error = Some(message.unwrap_or(error));
                                }
                                BridgeEvent::Map(_) | BridgeEvent::Other { .. } => {}
                            }
                            s.samples_dropped = bridge.stats.samples_dropped.load(Ordering::Relaxed);
                            s.update_mode();
                            (!is_sample || last_emit.elapsed() >= EMIT_EVERY).then(|| s.clone())
                        };
                        if let Some(snap) = snapshot {
                            last_emit = Instant::now();
                            emit(&handle, &snap);
                        }
                    }
                });
            }

            // Poller: is the game running, and what do its saves say?
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    loop {
                        // Looked up each round, so a folder chosen in the menu (or a new game build) takes effect.
                        let game_dir = handle.state::<Shared>().0.lock().unwrap().game_dir.clone();
                        let save_dir = save_dir(game_dir.as_deref());
                        let running = tauri::async_runtime::spawn_blocking({
                            let dir = save_dir.clone();
                            move || {
                                let saves = dir.as_deref().map(oj_savefile::list_slots).unwrap_or_default();
                                // If the process list can't be read (System::new fails), the game counts as not
                                // detected for this round; the saves are still reported.
                                let Ok(mut sys) = System::new() else { return (false, saves, None) };
                                sys.refresh_processes(ProcessesToUpdate::All, true);
                                let exe = sys
                                    .processes()
                                    .values()
                                    .find(|p| platform::is_game_process(&p.name().to_string_lossy()))
                                    .map(|p| p.exe().map(|e| e.to_path_buf()));
                                let running = exe.is_some();
                                // Packaged games live in <game folder>/bin on both supported platforms.
                                let game_dir =
                                    exe.flatten().and_then(|e| e.parent()?.parent().map(|p| p.display().to_string()));
                                (running, saves, game_dir)
                            }
                        })
                        .await;
                        if let Ok((running, saves, game_dir)) = running {
                            let snap = {
                                let shared = handle.state::<Shared>();
                                let mut s = shared.0.lock().unwrap();
                                s.game_running = running;
                                s.saves = saves;
                                if game_dir.is_some() {
                                    s.game_dir = game_dir;
                                }
                                s.save_dir = save_dir.as_ref().map(|p| p.display().to_string());
                                s.save_dir_chosen = save_dir_is_chosen();
                                s.update_mode();
                                s.clone()
                            };
                            emit(&handle, &snap);
                        }
                        tokio::time::sleep(POLL_EVERY).await;
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Ocarina Journal");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_update_check_starts_on_and_only_a_saved_choice_turns_it_off() {
        // Settings saved before the update check existed hold only the save folder.
        let old: Settings = serde_json::from_str(r#"{"save_dir":"x"}"#).unwrap();
        assert!(old.auto_update_check);
        assert!(serde_json::from_str::<Settings>("{}").unwrap().auto_update_check);
        let off: Settings = serde_json::from_str(r#"{"auto_update_check":false}"#).unwrap();
        assert!(!off.auto_update_check);
    }

    #[test]
    fn the_second_screen_stays_off_until_the_player_turns_it_on_and_then_stays_on() {
        let fresh: Settings = serde_json::from_str("{}").unwrap();
        assert!(!fresh.remote && !fresh.remote_lan);
        let saved = serde_json::to_string(&Settings { remote: true, remote_lan: true, ..Default::default() }).unwrap();
        let back: Settings = serde_json::from_str(&saved).unwrap();
        assert!(back.remote && back.remote_lan);
        // Switching one setting must not lose the others.
        assert!(back.auto_update_check);
    }

    #[test]
    fn a_browser_never_gets_folders_pipe_names_or_error_text() {
        let s = LiveState {
            save_dir: Some(r"C:\Users\me\saves".into()),
            game_dir: Some(r"D:\Games\Longshot".into()),
            pipe: "longshot-secret".into(),
            last_error: Some(r"could not open C:\Users\me\saves".into()),
            update_check_auto: true,
            ..Default::default()
        };
        let seen = remote_view(&s).to_string();
        for private in ["Users", "Games", "longshot-secret", "could not open"] {
            assert!(!seen.contains(private), "{private} reached a browser");
        }
    }

    #[test]
    fn finds_builds_directly_under_the_root_and_inside_a_channel_folder() {
        let root = std::env::temp_dir().join(format!("oj-builds-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        // The newest build is the one made last; wait so the folder times differ on coarse filesystems.
        let make = |rel: &str| {
            std::thread::sleep(std::time::Duration::from_millis(1_100));
            std::fs::create_dir_all(root.join(rel).join("romfs").join("GameData")).unwrap();
        };
        make("v3.0.0-rc.4");
        assert_eq!(newest_build(&root), Some(root.join("v3.0.0-rc.4")));
        make("stable/v3.1.1");
        assert_eq!(newest_build(&root), Some(root.join("stable").join("v3.1.1")));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn journal_days_follow_local_calendar_across_daylight_saving() {
        let zone = jiff::tz::TimeZone::get("Europe/London").unwrap();
        for (month, day, hours) in [(3, 29, 23), (10, 25, 25)] {
            let date = jiff::civil::date(2026, month, day);
            let before = zone.to_ambiguous_zoned_datetime(date.at(4, 59, 0, 0)).compatible().unwrap();
            let after = zone.to_ambiguous_zoned_datetime(date.at(5, 0, 0, 0)).compatible().unwrap();
            let previous = day_start_in(before.timestamp().as_millisecond() as u64, zone.clone());
            let current = day_start_in(after.timestamp().as_millisecond() as u64, zone.clone());
            assert_eq!(current, after.timestamp().as_millisecond() as u64);
            assert_eq!(current - previous, hours * 60 * 60 * 1_000);
        }
    }

    /// Builds the report from the real install on this PC. Opt in with `OJ_TEST_REAL=1` (it reads your game and saves,
    /// read-only, and needs them to exist).
    #[test]
    fn builds_and_caches_the_report_from_a_real_install() {
        if std::env::var_os("OJ_TEST_REAL").is_none() {
            return;
        }
        let mut cache = ReportCache::default();
        let first = build_report(&mut cache, None).expect("builds").expect("a report");
        assert_eq!(first.report["generator"], "oj-gamedata");
        assert!(first.report["slots"].as_array().is_some_and(|s| !s.is_empty()));
        let cats = first.report["categories"].as_array().unwrap();
        assert!(cats.iter().any(|c| c["id"] == "skulltulas" && c["of"] == 100));
        let started = std::time::Instant::now();
        let second = build_report(&mut cache, None).unwrap().unwrap();
        assert_eq!(second.modified_ms, first.modified_ms);
        assert!(started.elapsed() < Duration::from_millis(200), "second call should hit the cache");
    }
}

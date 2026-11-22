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
    saves: Vec<SlotSummary>,
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
    let now = now.to_zoned(zone.clone());
    let date = if now.hour() < 5 { now.date().yesterday().ok() } else { Some(now.date()) };
    date.and_then(|d| zone.to_ambiguous_zoned(d.at(5, 0, 0, 0)).compatible().ok())
        .and_then(|start| u64::try_from(start.timestamp().as_millisecond()).ok())
        .unwrap_or(now_ms)
}

fn date_of(ms: u64) -> String {
    i64::try_from(ms)
        .ok()
        .and_then(|ms| jiff::Timestamp::from_millisecond(ms).ok())
        .map(|t| t.to_zoned(jiff::tz::TimeZone::system()).strftime("%Y-%m-%d").to_string())
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

/// The game folder: `OJ_GAME`, the running game's folder, else the newest build under `~/Games/Longshot`.
fn find_game_dir(running: Option<&str>) -> Option<std::path::PathBuf> {
    let ok = |p: &std::path::Path| p.join("romfs").join("GameData").is_dir() || p.join("GameData").is_dir();
    if let Some(p) = std::env::var_os("OJ_GAME").map(std::path::PathBuf::from).filter(|p| ok(p)) {
        return Some(p);
    }
    if let Some(p) = running.map(std::path::PathBuf::from).filter(|p| ok(p)) {
        return Some(p);
    }
    let root = platform::home_dir()?.join("Games").join("Longshot");
    if ok(&root) {
        return Some(root);
    }
    let mut dirs: Vec<_> = std::fs::read_dir(root).ok()?.flatten().map(|e| e.path()).filter(|p| ok(p)).collect();
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
    let saves = oj_savefile::default_save_dir().ok_or("no Longshot save folder found")?;
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
            if let (Some(file), Some(dir)) = (&r, oj_savefile::default_save_dir()) {
                if let Some(log) = note_saves(&dir, &file.report) {
                    let snap = {
                        let shared = app.state::<Shared>();
                        let mut s = shared.0.lock().unwrap();
                        s.save_log = log;
                        s.clone()
                    };
                    emit(&app, &snap);
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
    tauri::async_runtime::spawn_blocking(move || map_source(&app).map(|(_, _, i)| i))
        .await
        .map_err(|e| e.to_string())?
}

/// The Threads of Time tapestry's sections, from the same game folder as the maps.
#[tauri::command]
async fn get_tapestry(app: AppHandle) -> Result<oj_gamedata::tapestry::Tapestry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, files, _) = map_source(&app)?;
        oj_gamedata::tapestry::tapestry_index(&files).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_lore(app: AppHandle) -> Result<oj_gamedata::lore::Lore, String> {
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
    tauri::async_runtime::spawn_blocking(move || {
        let (_, files, _) = map_source(&app)?;
        // Notes are long sustained recordings; four seconds is plenty for a held note. Songs (`whole`) play to the end.
        let secs = if whole { 60.0 } else { 4.0 };
        oj_gamedata::sound::wav(&files, &name, secs).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_rumors(app: AppHandle) -> Result<Vec<oj_gamedata::rumors::Rumor>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, files, _) = map_source(&app)?;
        oj_gamedata::rumors::rumors(&files).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// One picture (`world`, `field/<texture>`, `floor/<dungeon>/<floor>`, `tapestry/<layer>`) as JPEG or PNG bytes.
#[tauri::command]
async fn get_map_image(app: AppHandle, name: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
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
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
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
        let stamp = jiff::Zoned::now().strftime("%Y%m%d-%H%M%S").to_string();
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
    let user = oj_savefile::default_save_dir()
        .and_then(|d| d.parent()?.parent().map(|p| p.to_path_buf()))
        .or_else(oj_savefile::default_data_dir);
    if let Some(user) = user {
        cmd.arg("--user").arg(user);
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok("Longshot is starting with the bridge on.".into())
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
}

/// Samples arrive about ten times a second; the UI does not need every one.
const EMIT_EVERY: Duration = Duration::from_millis(250);
/// How often to look for the game process and re-read the saves.
const POLL_EVERY: Duration = Duration::from_secs(3);

pub fn run() {
    tauri::Builder::default()
        .manage(Shared(Arc::new(Mutex::new(LiveState {
            bridge_config_supported: cfg!(windows),
            pipe: pipe_name(),
            ..Default::default()
        }))))
        .manage(Reports(Mutex::new(ReportCache::default())))
        .manage(Maps::default())
        .invoke_handler(tauri::generate_handler![
            get_state,
            get_report,
            get_map_index,
            get_map_image,
            get_tapestry,
            get_lore,
            get_rumors,
            get_sound,
            preview_enable_bridge,
            apply_enable_bridge,
            launch_game
        ])
        .setup(|app| {
            let shared = app.state::<Shared>().0.clone();

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
                    let save_dir = oj_savefile::default_save_dir();
                    loop {
                        let running = tauri::async_runtime::spawn_blocking({
                            let dir = save_dir.clone();
                            move || {
                                let mut sys = System::new();
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
                                let saves = dir.as_deref().map(oj_savefile::list_slots).unwrap_or_default();
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
    fn journal_days_follow_local_calendar_across_daylight_saving() {
        let zone = jiff::tz::TimeZone::get("Europe/London").unwrap();
        for (month, day, hours) in [(3, 29, 23), (10, 25, 25)] {
            let date = jiff::civil::date(2026, month, day);
            let before = zone.to_ambiguous_zoned(date.at(4, 59, 0, 0)).compatible().unwrap();
            let after = zone.to_ambiguous_zoned(date.at(5, 0, 0, 0)).compatible().unwrap();
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

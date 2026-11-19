use std::sync::{atomic::Ordering, Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use oj_bridge::{spawn, BridgeEvent, Config, LocalConnector};
use oj_journal::{Journal, Snapshot};
use oj_protocol::Game;
use oj_savefile::SlotSummary;
use serde::Serialize;
use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager, State};

/// How the app is getting its data (see docs/research/COMPANION_APP_ARCHITECTURE.md).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum Mode {
    /// The bridge answers: live data.
    Live,
    /// `longshot.exe` is running but its control pipe is not available (the bridge was not enabled at launch).
    BridgeOff,
    /// The game is not running: only saved data.
    #[default]
    Offline,
}

/// Everything the UI shows; sent whole on each change (it is small).
#[derive(Debug, Clone, Default, Serialize)]
struct LiveState {
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
    let root = std::path::PathBuf::from(std::env::var_os("USERPROFILE")?).join("Games").join("Longshot");
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
    let path = std::env::var_os("OJ_REPORT").map(std::path::PathBuf::from).or_else(|| {
        std::env::var_os("LOCALAPPDATA").map(|p| std::path::PathBuf::from(p).join("OcarinaJournal").join("report.json"))
    })?;
    let modified_ms = std::fs::metadata(&path).and_then(|m| m.modified()).ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64;
    Some(ReportFile { modified_ms, report: serde_json::from_slice(&std::fs::read(&path).ok()?).ok()? })
}

fn build_report(cache: &mut ReportCache, game_dir: Option<&str>) -> Result<Option<ReportFile>, String> {
    let saves = oj_savefile::default_save_dir().ok_or("no Longshot save folder found")?;
    let stamp = newest_save_ms(&saves);
    let dir = find_game_dir(game_dir).ok_or("no Longshot game folder found (set OJ_GAME to the folder that holds romfs)")?;
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
        Ok(r) => Ok(r),
        Err(e) => report_file().map(Some).ok_or(e),
    }
}

#[tauri::command]
fn get_state(state: State<'_, Shared>) -> LiveState {
    state.0.lock().unwrap().clone()
}

/// The pipe name must match Longshot's `HOS_CONTROL` value. Override with `OJ_PIPE`.
fn pipe_name() -> String {
    std::env::var("OJ_PIPE").unwrap_or_else(|_| "longshot".into())
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
        .manage(Shared(Arc::new(Mutex::new(LiveState { pipe: pipe_name(), ..Default::default() }))))
        .manage(Reports(Mutex::new(ReportCache::default())))
        .invoke_handler(tauri::generate_handler![get_state, get_report])
        .setup(|app| {
            let shared = app.state::<Shared>().0.clone();

            // Bridge client: live samples feed the journal.
            {
                let handle = app.handle().clone();
                let shared = shared.clone();
                tauri::async_runtime::spawn(async move {
                    let (bridge, mut rx) = spawn(LocalConnector { name: pipe_name() }, Config::default());
                    let mut journal = Journal::new();
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
                                }
                                BridgeEvent::Sample { game, .. } => {
                                    is_sample = true;
                                    journal.push_sample(now_ms(), &game);
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
                                    .find(|p| p.name().to_string_lossy().eq_ignore_ascii_case("longshot.exe"))
                                    .map(|p| p.exe().map(|e| e.to_path_buf()));
                                let running = exe.is_some();
                                // bin\longshot.exe lives in <game folder>in
                                let game_dir = exe.flatten().and_then(|e| e.parent()?.parent().map(|p| p.display().to_string()));
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

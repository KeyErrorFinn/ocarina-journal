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

/// Where the save report lives: `OJ_REPORT`, else the app folder under LOCALAPPDATA (OcarinaJournal/report.json).
fn report_path() -> Option<std::path::PathBuf> {
    std::env::var_os("OJ_REPORT").map(Into::into).or_else(|| {
        std::env::var_os("LOCALAPPDATA").map(|p| std::path::PathBuf::from(p).join("OcarinaJournal").join("report.json"))
    })
}

#[derive(Serialize)]
struct ReportFile {
    modified_ms: u64,
    report: serde_json::Value,
}

/// The save report (every collectible with its name, area and position), made outside the app from the
/// player's own game files. Read-only; `None` when no report has been made yet.
#[tauri::command]
fn get_report() -> Option<ReportFile> {
    let path = report_path()?;
    let modified_ms = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    let report = serde_json::from_slice(&std::fs::read(&path).ok()?).ok()?;
    Some(ReportFile { modified_ms, report })
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
                                let running = sys
                                    .processes()
                                    .values()
                                    .any(|p| p.name().to_string_lossy().eq_ignore_ascii_case("longshot.exe"));
                                let saves = dir.as_deref().map(oj_savefile::list_slots).unwrap_or_default();
                                (running, saves)
                            }
                        })
                        .await;
                        if let Ok((running, saves)) = running {
                            let snap = {
                                let shared = handle.state::<Shared>();
                                let mut s = shared.0.lock().unwrap();
                                s.game_running = running;
                                s.saves = saves;
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

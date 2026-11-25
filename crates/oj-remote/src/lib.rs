//! The second screen: a small web server that shows the app's state to a browser on the same network.
//!
//! Safety comes from what the server is, not from what it is told:
//! - It only ever calls the commands in [`READ_ONLY`]. Launching the game, turning the bridge on, choosing folders and
//!   everything about the window are not on the list, so no request can reach them.
//!   One separate exception, `sync_ui`, merges validated app-owned progress through the backend, never game data.
//! - Nothing but the page itself is served before the browser has paired with two codes the player reads off their own
//!   screen: the pairing code, then a 4-digit code that changes every minute. The server only ever reads codes from a
//!   request body (the page may take the pairing code from the address it was opened with, and sends it on). Every
//!   attempt is rate-limited, a new code signs every browser out, and a single browser can be signed out too.
//! - Requests must name an IP address (or `localhost`) as host, which stops a web page from reaching the server by a
//!   name of its own (DNS rebinding), and a browser's `Origin` must match. No CORS headers are sent.
//! - The caller picks the address to listen on and passes it in; this crate never listens on `0.0.0.0`.
//!
//! The server does not know what the state or the data are: the app gives it a [`Backend`].

use std::collections::VecDeque;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, DefaultBodyLimit, Path, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get, post};
use axum::{Json, Router};
use futures::future::BoxFuture;
use serde_json::Value;
use tokio::sync::{broadcast, oneshot};

/// The only commands a browser can ask for. Every one only reads.
pub const READ_ONLY: [&str; 8] = [
    "get_state",
    "get_report",
    "get_map_index",
    "get_map_image",
    "get_tapestry",
    "get_lore",
    "get_rumors",
    "get_sound",
];

const COOKIE: &str = "oj_session";
const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_SESSIONS: usize = 16;
/// Pairing attempts (right or wrong) allowed per minute before the server refuses to look at any more.
const MAX_ATTEMPTS_PER_MINUTE: usize = 6;
/// After this many wrong codes in a row the codes are replaced.
const FAILS_BEFORE_NEW_CODE: u32 = 20;
/// How long the 4-digit code lasts, and how long the one before it still works (so typing across a change isn't punished).
const PIN_LIFE: Duration = Duration::from_secs(60);
const HOUR_MS: u64 = 60 * 60 * 1000;
const PIN_GRACE: Duration = Duration::from_secs(10);
/// How long the browser keeps its cookie (about as long as browsers allow). The server decides when a screen has been
/// away too long ([`Config::idle_life`]), not the cookie.
const COOKIE_LIFE_SECS: u64 = 400 * 24 * 60 * 60;

/// What a command answers with.
pub enum Reply {
    Json(Value),
    Bytes(Vec<u8>),
}

/// The app's side of the second screen.
pub trait Backend: Send + Sync + 'static {
    /// Runs one of the [`READ_ONLY`] commands. `args` is the JSON object the page sent.
    fn call(&self, cmd: String, args: Value) -> BoxFuture<'static, Result<Reply, String>>;
    /// The current state for a browser (the app removes anything private, such as folder paths, before this).
    fn state(&self) -> Value;
}

/// The page itself (the app's own built frontend).
pub trait Assets: Send + Sync + 'static {
    /// A file by path without the leading slash, with its content type.
    fn get(&self, path: &str) -> Option<(Vec<u8>, String)>;
}

pub struct Config {
    /// Where to listen: loopback, or this PC's private network address. Never `0.0.0.0`.
    pub bind: IpAddr,
    /// Preferred port; the next ones are tried if it is taken.
    pub port: u16,
    pub backend: Arc<dyn Backend>,
    pub assets: Arc<dyn Assets>,
    /// Screens that were paired when the app last ran (see [`Server::saved_sessions`]), so they stay paired.
    pub sessions: Vec<SavedSession>,
    /// How long a paired screen may stay away before it has to pair again. Any use of the page, and every moment its page
    /// is open, starts the time over.
    pub idle_life: Duration,
    /// Called when the codes or the paired screens change. It always runs on another thread, so the caller may hold its
    /// own locks while it asks for a change.
    pub on_change: Arc<dyn Fn() + Send + Sync>,
}

/// A browser that has paired.
struct Session {
    /// Public name for this session (what "disconnect" refers to). The cookie's token is never shown or sent anywhere.
    id: String,
    /// SHA-256 of the cookie's token. The token itself is kept nowhere on this side, so a saved list can't be replayed.
    token_hash: String,
    name: String,
    addr: IpAddr,
    since_ms: u64,
    /// The last time it used the page (or had it open), in milliseconds since 1970.
    last_seen_ms: u64,
    /// Open live connections.
    sockets: usize,
}

/// A paired screen as it is kept between runs: what's needed to recognise it again, never the cookie's token.
#[derive(Debug, Clone)]
pub struct SavedSession {
    pub id: String,
    pub token_hash: String,
    pub name: String,
    pub addr: String,
    pub since_ms: u64,
    /// Rounded down to the hour when saved, so it is written at most once an hour.
    pub last_seen_ms: u64,
}

/// A paired screen, as the app shows it.
#[derive(Debug, Clone)]
pub struct Screen {
    pub id: String,
    /// What the browser says it is, such as `iPhone · Safari`.
    pub name: String,
    pub addr: String,
    /// When it paired, in milliseconds since 1970.
    pub since_ms: u64,
    /// Has the page open right now.
    pub online: bool,
}

struct Pin {
    now: String,
    /// The one before, still accepted until the instant.
    before: Option<(String, Instant)>,
    /// When `now` stops being the current one, in milliseconds since 1970 (for showing) and as an instant (for acting).
    ends_ms: u64,
    ends_at: Instant,
}

struct Inner {
    backend: Arc<dyn Backend>,
    assets: Arc<dyn Assets>,
    on_change: Arc<dyn Fn() + Send + Sync>,
    handle: tokio::runtime::Handle,
    idle_ms: u64,
    code: Mutex<String>,
    pin: Mutex<Pin>,
    sessions: Mutex<Vec<Session>>,
    attempts: Mutex<VecDeque<Instant>>,
    fails_in_a_row: Mutex<u32>,
    closed: AtomicBool,
    states: broadcast::Sender<String>,
    /// Tells every open socket to look whether its screen is still signed in (a new code, a disconnect, or stopping).
    kick: broadcast::Sender<()>,
}

pub struct Server {
    inner: Arc<Inner>,
    addr: SocketAddr,
    stop: Option<oneshot::Sender<()>>,
}

impl Server {
    pub fn addr(&self) -> SocketAddr {
        self.addr
    }
    /// The pairing code, shown as `ABCD-EFGH`.
    pub fn code(&self) -> String {
        let c = self.inner.code.lock().unwrap().clone();
        format!("{}-{}", &c[..4], &c[4..])
    }
    /// The 4-digit code, and when it stops being the current one (milliseconds since 1970).
    pub fn pin(&self) -> (String, u64) {
        let p = self.inner.pin.lock().unwrap();
        (p.now.clone(), p.ends_ms)
    }
    /// Screens that have paired, oldest first.
    pub fn screens(&self) -> Vec<Screen> {
        self.inner.prune();
        let sessions = self.inner.sessions.lock().unwrap();
        sessions
            .iter()
            .map(|s| Screen {
                id: s.id.clone(),
                name: s.name.clone(),
                addr: s.addr.to_string(),
                since_ms: s.since_ms,
                online: s.sockets > 0,
            })
            .collect()
    }
    /// The paired screens, to be kept so they are still paired the next time (see [`Config::sessions`]).
    pub fn saved_sessions(&self) -> Vec<SavedSession> {
        self.inner.prune();
        let sessions = self.inner.sessions.lock().unwrap();
        sessions
            .iter()
            .map(|s| SavedSession {
                id: s.id.clone(),
                token_hash: s.token_hash.clone(),
                name: s.name.clone(),
                addr: s.addr.to_string(),
                since_ms: s.since_ms,
                last_seen_ms: s.last_seen_ms / HOUR_MS * HOUR_MS,
            })
            .collect()
    }
    /// Browsers with the page open right now.
    pub fn clients(&self) -> usize {
        self.inner.sessions.lock().unwrap().iter().filter(|s| s.sockets > 0).count()
    }
    /// Replaces the codes and signs every browser out.
    pub fn rotate_code(&self) {
        self.inner.rotate();
    }
    /// Signs one screen out. It has to pair again to see anything.
    pub fn disconnect(&self, id: &str) {
        self.inner.sessions.lock().unwrap().retain(|s| s.id != id);
        let _ = self.inner.kick.send(());
        self.inner.changed();
    }
    /// Sends a new state to every connected browser.
    pub fn push(&self, state: &Value) {
        let _ = self.inner.states.send(state.to_string());
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.inner.closed.store(true, Ordering::Relaxed);
        let _ = self.inner.kick.send(());
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

impl Inner {
    /// Tells the app something changed. Never on the caller's thread: a caller that holds a lock the app's handler also
    /// takes would otherwise wait on itself.
    fn changed(&self) {
        let f = self.on_change.clone();
        drop(self.handle.spawn_blocking(move || f()));
    }
    fn rotate(&self) {
        *self.code.lock().unwrap() = new_code();
        *self.pin.lock().unwrap() = fresh_pin(None);
        self.sessions.lock().unwrap().clear();
        self.attempts.lock().unwrap().clear();
        *self.fails_in_a_row.lock().unwrap() = 0;
        let _ = self.kick.send(());
        self.changed();
    }
    /// Screens with their page open are in use right now, however long they have been open.
    fn touch_open(&self) {
        let now = now_ms();
        for s in self.sessions.lock().unwrap().iter_mut().filter(|s| s.sockets > 0) {
            s.last_seen_ms = now;
        }
    }
    fn rotate_pin(&self) {
        let mut pin = self.pin.lock().unwrap();
        *pin = fresh_pin(Some((pin.now.clone(), Instant::now() + PIN_GRACE)));
    }
    fn pin_ok(&self, given: &str) -> bool {
        let pin = self.pin.lock().unwrap();
        let current = same(given.as_bytes(), pin.now.as_bytes());
        let before = pin
            .before
            .as_ref()
            .is_some_and(|(p, until)| same(given.as_bytes(), p.as_bytes()) && Instant::now() < *until);
        current | before
    }
    /// The session a request belongs to.
    fn session_id(&self, headers: &HeaderMap) -> Option<String> {
        let token = cookie(headers, COOKIE)?;
        let hash = hash_token(&token);
        self.prune();
        let mut sessions = self.sessions.lock().unwrap();
        let found = sessions.iter_mut().find(|s| same(s.token_hash.as_bytes(), hash.as_bytes()))?;
        // Using the page keeps the screen paired.
        found.last_seen_ms = now_ms();
        Some(found.id.clone())
    }
    /// Signs out the screens that have been away longer than [`Config::idle_life`]. A screen with its page open is never
    /// away. True if any were removed.
    fn prune(&self) -> bool {
        let now = now_ms();
        let mut sessions = self.sessions.lock().unwrap();
        let before = sessions.len();
        sessions.retain(|s| s.sockets > 0 || now.saturating_sub(s.last_seen_ms) <= self.idle_ms);
        sessions.len() != before
    }
    fn authed(&self, headers: &HeaderMap) -> bool {
        self.session_id(headers).is_some()
    }
    fn has_session(&self, id: &str) -> bool {
        self.sessions.lock().unwrap().iter().any(|s| s.id == id)
    }
    fn sockets(&self, id: &str, opened: bool) {
        if let Some(s) = self.sessions.lock().unwrap().iter_mut().find(|s| s.id == id) {
            s.sockets = if opened { s.sockets + 1 } else { s.sockets.saturating_sub(1) };
            s.last_seen_ms = now_ms();
        }
    }
}

fn fresh_pin(before: Option<(String, Instant)>) -> Pin {
    let mut b = [0u8; 4];
    random(&mut b);
    let mut now = format!("{:04}", u32::from_le_bytes(b) % 10_000);
    // Never the same twice in a row.
    if before.as_ref().is_some_and(|(p, _)| *p == now) {
        now = format!("{:04}", (now.parse::<u32>().unwrap_or(0) + 1) % 10_000);
    }
    Pin { now, before, ends_ms: now_ms() + PIN_LIFE.as_millis() as u64, ends_at: Instant::now() + PIN_LIFE }
}

/// A short, honest label from the browser's own description: `iPhone · Safari`, `Windows · Edge`. Only for telling
/// screens apart in the app; nothing depends on it.
fn device_name(user_agent: &str) -> String {
    let ua = user_agent;
    let os = if ua.contains("iPhone") {
        "iPhone"
    } else if ua.contains("iPad") {
        "iPad"
    } else if ua.contains("Android") {
        if ua.contains("Mobile") {
            "Android phone"
        } else {
            "Android tablet"
        }
    } else if ua.contains("Windows") {
        "Windows"
    } else if ua.contains("Macintosh") || ua.contains("Mac OS X") {
        "Mac"
    } else if ua.contains("CrOS") {
        "Chromebook"
    } else if ua.contains("Linux") {
        "Linux"
    } else {
        ""
    };
    let browser = if ua.contains("Edg") {
        "Edge"
    } else if ua.contains("OPR/") || ua.contains("Opera") {
        "Opera"
    } else if ua.contains("Firefox") || ua.contains("FxiOS") {
        "Firefox"
    } else if ua.contains("SamsungBrowser") {
        "Samsung Internet"
    } else if ua.contains("Chrome") || ua.contains("CriOS") {
        "Chrome"
    } else if ua.contains("Safari") {
        "Safari"
    } else {
        ""
    };
    match (os, browser) {
        ("", "") => "Unknown device".to_string(),
        (o, "") => o.to_string(),
        ("", b) => b.to_string(),
        (o, b) => format!("{o} · {b}"),
    }
}

fn random(bytes: &mut [u8]) {
    // The system's random source failing is not something to carry on from: a guessable code would defeat the point.
    getrandom::fill(bytes).expect("the system random source is unavailable");
}

fn new_code() -> String {
    let mut b = [0u8; 8];
    random(&mut b);
    b.iter().map(|x| CODE_ALPHABET[(*x as usize) % CODE_ALPHABET.len()] as char).collect()
}

/// What is kept of a cookie's token: its SHA-256, as hex.
fn hash_token(token: &str) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(token.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

fn new_token() -> String {
    let mut b = [0u8; 16];
    random(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Compares without stopping at the first difference.
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |d, (x, y)| d | (x ^ y)) == 0
}

fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let all = headers.get(header::COOKIE)?.to_str().ok()?;
    all.split(';').filter_map(|p| p.trim().split_once('=')).find(|(k, _)| *k == name).map(|(_, v)| v.to_string())
}

/// `ABCD-EFGH`, `abcd efgh` and `ABCDEFGH` are the same code.
fn normalise(code: &str) -> String {
    code.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_uppercase()
}

/// An IP address or `localhost`, with an optional port. A name of anyone's own is refused (DNS rebinding).
fn host_allowed(host: &str) -> bool {
    let name = match host.strip_prefix('[') {
        Some(v6) => v6.split(']').next().unwrap_or(""),
        None => host.rsplit_once(':').map_or(host, |(h, _)| h),
    };
    name.eq_ignore_ascii_case("localhost") || name.parse::<IpAddr>().is_ok()
}

fn host(headers: &HeaderMap) -> Option<&str> {
    headers.get(header::HOST)?.to_str().ok()
}

/// Rejects a request whose Host is a name, or whose Origin is a different site.
fn check_origin(headers: &HeaderMap) -> Result<(), StatusCode> {
    let host = host(headers).ok_or(StatusCode::BAD_REQUEST)?;
    if !host_allowed(host) {
        return Err(StatusCode::FORBIDDEN);
    }
    if let Some(origin) = headers.get(header::ORIGIN) {
        if origin.to_str().ok() != Some(&format!("http://{host}")) {
            return Err(StatusCode::FORBIDDEN);
        }
    }
    Ok(())
}

/// True for the addresses a home or office network hands out (10/8, 172.16/12, 192.168/16).
pub fn is_private_v4(ip: Ipv4Addr) -> bool {
    ip.is_private()
}

/// This PC's private network address, if it has one. Sends no data: connecting a UDP socket only picks a route.
pub fn private_lan_ip() -> Option<IpAddr> {
    let sock = std::net::UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    sock.connect((Ipv4Addr::new(192, 0, 2, 1), 9)).ok()?;
    match sock.local_addr().ok()?.ip() {
        IpAddr::V4(v4) if is_private_v4(v4) => Some(IpAddr::V4(v4)),
        _ => None,
    }
}

type Shared = Arc<Inner>;

pub async fn start(cfg: Config) -> std::io::Result<Server> {
    if cfg.bind.is_unspecified() {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "refusing to listen on every address"));
    }
    let (states, _) = broadcast::channel(16);
    let (kick, _) = broadcast::channel(4);
    let inner = Arc::new(Inner {
        backend: cfg.backend,
        assets: cfg.assets,
        on_change: cfg.on_change,
        handle: tokio::runtime::Handle::current(),
        idle_ms: cfg.idle_life.as_millis() as u64,
        code: Mutex::new(new_code()),
        pin: Mutex::new(fresh_pin(None)),
        sessions: Mutex::new(
            cfg.sessions
                .into_iter()
                .rev()
                .take(MAX_SESSIONS)
                .rev()
                .map(|x| Session {
                    id: x.id,
                    token_hash: x.token_hash,
                    name: x.name,
                    addr: x.addr.parse().unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED)),
                    since_ms: x.since_ms,
                    last_seen_ms: x.last_seen_ms,
                    sockets: 0,
                })
                .collect(),
        ),
        attempts: Mutex::new(VecDeque::new()),
        fails_in_a_row: Mutex::new(0),
        closed: AtomicBool::new(false),
        states,
        kick,
    });
    // Screens restored from last time may already have been away too long.
    inner.prune();
    let mut listener = None;
    for port in (cfg.port..cfg.port.saturating_add(20)).chain([0]) {
        if let Ok(l) = tokio::net::TcpListener::bind(SocketAddr::new(cfg.bind, port)).await {
            listener = Some(l);
            break;
        }
    }
    let listener = listener.ok_or_else(|| std::io::Error::new(std::io::ErrorKind::AddrInUse, "no free port"))?;
    let addr = listener.local_addr()?;
    let app = Router::new()
        .route("/pair", post(pair))
        .route("/api/session", get(session))
        .route("/api/invoke/{cmd}", post(invoke))
        .route("/api/signout", post(signout))
        .route("/ws", get(socket))
        .fallback(any(page))
        .layer(DefaultBodyLimit::max(1 << 20))
        .with_state(inner.clone());
    let (stop, stopped) = oneshot::channel::<()>();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
            .with_graceful_shutdown(async move {
                let _ = stopped.await;
            })
            .await;
    });
    // The 4-digit code changes a minute after it was made, for as long as the server runs. The wait is for the code that is
    // current, so a new code (made when the player asks for one) starts its own full minute.
    let weak = Arc::downgrade(&inner);
    tokio::spawn(async move {
        loop {
            let Some(s) = weak.upgrade() else { break };
            if s.closed.load(Ordering::Relaxed) {
                break;
            }
            let ends_at = s.pin.lock().unwrap().ends_at;
            drop(s);
            tokio::time::sleep_until(tokio::time::Instant::from_std(ends_at)).await;
            let Some(s) = weak.upgrade() else { break };
            if s.pin.lock().unwrap().ends_at == ends_at {
                s.rotate_pin();
                s.touch_open();
                s.prune();
                s.changed();
            }
        }
    });
    Ok(Server { inner, addr, stop: Some(stop) })
}

fn text(status: StatusCode, msg: &str) -> Response {
    (status, [(header::CACHE_CONTROL, "no-store")], msg.to_string()).into_response()
}

async fn pair(
    State(s): State<Shared>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    if let Err(code) = check_origin(&headers) {
        return text(code, "Not allowed.");
    }
    // Every attempt counts, right or wrong, so the box can't be hammered.
    let now = Instant::now();
    {
        let mut attempts = s.attempts.lock().unwrap();
        while attempts.front().is_some_and(|t| now.duration_since(*t) > Duration::from_secs(60)) {
            attempts.pop_front();
        }
        if attempts.len() >= MAX_ATTEMPTS_PER_MINUTE {
            let wait = attempts.front().map_or(60, |t| 60u64.saturating_sub(now.duration_since(*t).as_secs()).max(1));
            return (
                StatusCode::TOO_MANY_REQUESTS,
                [(header::CACHE_CONTROL, "no-store".to_string()), (header::RETRY_AFTER, wait.to_string())],
                "Too many tries.",
            )
                .into_response();
        }
        attempts.push_back(now);
    }
    let body = serde_json::from_slice::<Value>(&body).unwrap_or(Value::Null);
    let given = |key: &str| body.get(key).and_then(|c| c.as_str()).map(normalise).unwrap_or_default();
    // Both are checked every time, so the answer doesn't say which one was wrong.
    let code_ok = same(given("code").as_bytes(), s.code.lock().unwrap().as_bytes());
    // A request with only the pairing code is the page's first step: it learns whether to ask for the 4-digit code.
    // It signs nothing in.
    let first_step = body.get("pin").is_none();
    let pin_ok = s.pin_ok(&given("pin"));
    if first_step && code_ok {
        return ([(header::CACHE_CONTROL, "no-store")], "{\"ok\":true,\"next\":\"pin\"}").into_response();
    }
    if first_step || !(code_ok & pin_ok) {
        let replace = {
            let mut n = s.fails_in_a_row.lock().unwrap();
            *n += 1;
            *n >= FAILS_BEFORE_NEW_CODE
        };
        if replace {
            s.rotate();
        }
        return text(StatusCode::UNAUTHORIZED, "Those codes aren't right.");
    }
    *s.fails_in_a_row.lock().unwrap() = 0;
    let token = new_token();
    {
        let agent = headers.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("");
        let mut sessions = s.sessions.lock().unwrap();
        sessions.push(Session {
            id: new_token()[..8].to_string(),
            token_hash: hash_token(&token),
            name: device_name(agent),
            addr: peer.ip(),
            since_ms: now_ms(),
            last_seen_ms: now_ms(),
            sockets: 0,
        });
        if sessions.len() > MAX_SESSIONS {
            sessions.remove(0);
        }
    }
    s.changed();
    (
        StatusCode::OK,
        [
            (
                header::SET_COOKIE,
                format!("{COOKIE}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={COOKIE_LIFE_SECS}"),
            ),
            (header::CACHE_CONTROL, "no-store".to_string()),
        ],
        "{\"ok\":true}",
    )
        .into_response()
}

async fn invoke(
    State(s): State<Shared>,
    Path(cmd): Path<String>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    if let Err(code) = check_origin(&headers) {
        return text(code, "Not allowed.");
    }
    let json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("application/json"));
    if !json {
        return text(StatusCode::UNSUPPORTED_MEDIA_TYPE, "Send JSON.");
    }
    if !s.authed(&headers) {
        return text(StatusCode::UNAUTHORIZED, "Pair this screen first.");
    }
    // This single exception only updates validated app-owned progress, never game/save files or desktop settings.
    if !READ_ONLY.contains(&cmd.as_str()) && cmd != "sync_ui" {
        return text(StatusCode::NOT_FOUND, "No such command.");
    }
    let args = if body.is_empty() {
        Value::Object(Default::default())
    } else {
        serde_json::from_slice(&body).unwrap_or(Value::Null)
    };
    if !args.is_object() {
        return text(StatusCode::BAD_REQUEST, "Arguments must be an object.");
    }
    match s.backend.call(cmd, args).await {
        Ok(Reply::Json(v)) => ([(header::CACHE_CONTROL, "no-store")], Json(v)).into_response(),
        Ok(Reply::Bytes(b)) => {
            ([(header::CONTENT_TYPE, "application/octet-stream"), (header::CACHE_CONTROL, "no-store")], b)
                .into_response()
        }
        // Backend errors can contain absolute game/save paths. Keep those in the desktop app, not on the network.
        Err(_) => text(
            StatusCode::INTERNAL_SERVER_ERROR,
            "The app could not read this data. Check the game and save folders in the desktop app.",
        ),
    }
}

/// A screen signs itself out (the "Disconnect this device" button on the page). It only ever ends the caller's own
/// pairing, so it is not one of the [`READ_ONLY`] commands and can't touch anyone else's.
async fn signout(State(s): State<Shared>, headers: HeaderMap) -> Response {
    if let Err(code) = check_origin(&headers) {
        return text(code, "Not allowed.");
    }
    let json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("application/json"));
    if !json {
        return text(StatusCode::UNSUPPORTED_MEDIA_TYPE, "Send JSON.");
    }
    let Some(id) = s.session_id(&headers) else {
        return text(StatusCode::UNAUTHORIZED, "Pair this screen first.");
    };
    s.sessions.lock().unwrap().retain(|x| x.id != id);
    let _ = s.kick.send(());
    s.changed();
    (
        StatusCode::OK,
        [
            (header::SET_COOKIE, format!("{COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0")),
            (header::CACHE_CONTROL, "no-store".to_string()),
        ],
        "{\"ok\":true}",
    )
        .into_response()
}

async fn socket(State(s): State<Shared>, headers: HeaderMap, ws: WebSocketUpgrade) -> Response {
    if let Err(code) = check_origin(&headers) {
        return text(code, "Not allowed.");
    }
    let Some(id) = s.session_id(&headers) else {
        return text(StatusCode::UNAUTHORIZED, "Pair this screen first.");
    };
    ws.on_upgrade(move |sock| live(s, id, sock))
}

async fn live(s: Shared, id: String, mut sock: WebSocket) {
    s.sockets(&id, true);
    s.changed();
    let mut states = s.states.subscribe();
    let mut kick = s.kick.subscribe();
    if sock.send(Message::Text(s.backend.state().to_string().into())).await.is_ok() {
        loop {
            tokio::select! {
                got = states.recv() => match got {
                    Ok(state) => { if sock.send(Message::Text(state.into())).await.is_err() { break; } }
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                    Err(_) => break,
                },
                // Anything that signs a screen out, or stops the server, lands here; only this screen's own sign-out ends it.
                _ = kick.recv() => {
                    if s.closed.load(Ordering::Relaxed) || !s.has_session(&id) { break; }
                }
                msg = sock.recv() => match msg {
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    Some(Ok(_)) => {}
                },
            }
        }
    }
    s.sockets(&id, false);
    s.changed();
}

const PAIR_HTML: &str = include_str!("pair.html");
const PAIR_JS: &str = include_str!("pair.js");

/// A QR scanner may omit the Strict cookie on navigation. Once here, the page can check it with a same-origin request.
async fn session(State(s): State<Shared>, headers: HeaderMap) -> Response {
    if let Err(code) = check_origin(&headers) {
        return text(code, "Not allowed.");
    }
    let status = if s.authed(&headers) { StatusCode::NO_CONTENT } else { StatusCode::UNAUTHORIZED };
    (status, [(header::CACHE_CONTROL, "no-store")]).into_response()
}

/// What a screen that hasn't paired is sent: the pairing page and its script, and `401` for anything else.
fn unpaired(path: &str) -> Response {
    let last = path.rsplit('/').next().unwrap_or("");
    let (body, mime) = if path == "pair.js" {
        (PAIR_JS, "text/javascript; charset=utf-8")
    } else if path == "index.html" || !last.contains('.') {
        (PAIR_HTML, "text/html; charset=utf-8")
    } else {
        return text(StatusCode::UNAUTHORIZED, "Pair this screen first.");
    };
    let mut res = Response::new(Body::from(body));
    let h = res.headers_mut();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    h.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        ),
    );
    h.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    h.insert(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    res
}

/// The app's own page and files. Anything unknown without a file extension gets the front page (the app routes itself).
async fn page(State(s): State<Shared>, method: Method, uri: Uri, headers: HeaderMap) -> Response {
    if method != Method::GET && method != Method::HEAD {
        return text(StatusCode::METHOD_NOT_ALLOWED, "Not allowed.");
    }
    if let Err(code) = check_origin(&headers) {
        return text(code, "Not allowed.");
    }
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    // A screen that hasn't paired gets the pairing page and nothing of the app: no page, no scripts, no pictures. The app
    // is only sent once the cookie is a paired one, so there is no flash of the app before the pairing screen either.
    // The initial scanner navigation can omit a Strict cookie while the following script request includes it.
    // Keep this public script available in both cases so it can perform the same-origin session check.
    if path == "pair.js" || !s.authed(&headers) {
        return unpaired(path);
    }
    let found = s.assets.get(path).or_else(|| {
        let last = path.rsplit('/').next().unwrap_or("");
        (!last.contains('.')).then(|| s.assets.get("index.html")).flatten()
    });
    let Some((bytes, mut mime)) = found else { return text(StatusCode::NOT_FOUND, "Not found.") };
    if path.ends_with(".webmanifest") {
        mime = "application/manifest+json".to_string();
    }
    let host = host(&headers).unwrap_or("localhost");
    let csp = format!(
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://{host}; frame-ancestors 'none'"
    );
    let mut res = Response::new(Body::from(bytes));
    let h = res.headers_mut();
    if let Ok(v) = HeaderValue::from_str(&mime) {
        h.insert(header::CONTENT_TYPE, v);
    }
    if let Ok(v) = HeaderValue::from_str(&csp) {
        h.insert(header::CONTENT_SECURITY_POLICY, v);
    }
    h.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    h.insert(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosts_must_be_addresses() {
        assert!(host_allowed("192.168.1.50:8765"));
        assert!(host_allowed("127.0.0.1"));
        assert!(host_allowed("localhost:8765"));
        assert!(host_allowed("[::1]:8765"));
        assert!(!host_allowed("evil.example:8765"));
        assert!(!host_allowed("192.168.1.50.evil.example"));
        assert!(!host_allowed(""));
    }

    #[test]
    fn only_private_addresses_count_as_the_local_network() {
        assert!(is_private_v4(Ipv4Addr::new(192, 168, 0, 5)));
        assert!(is_private_v4(Ipv4Addr::new(10, 1, 2, 3)));
        assert!(is_private_v4(Ipv4Addr::new(172, 16, 0, 1)));
        assert!(!is_private_v4(Ipv4Addr::new(172, 32, 0, 1)));
        assert!(!is_private_v4(Ipv4Addr::new(8, 8, 8, 8)));
        assert!(!is_private_v4(Ipv4Addr::new(100, 64, 0, 1)));
        assert!(!is_private_v4(Ipv4Addr::new(169, 254, 1, 1)));
    }

    #[test]
    fn codes_are_eight_unambiguous_characters_and_forgive_typing() {
        let c = new_code();
        assert_eq!(c.len(), 8);
        assert!(c.bytes().all(|b| CODE_ALPHABET.contains(&b)));
        assert_eq!(normalise("abcd-efgh"), "ABCDEFGH");
        assert_eq!(normalise(" ab cd ef gh "), "ABCDEFGH");
        assert!(same(b"abc", b"abc") && !same(b"abc", b"abd") && !same(b"abc", b"ab"));
    }

    #[test]
    fn the_four_digit_code_is_four_digits_and_never_repeats_back_to_back() {
        for _ in 0..200 {
            let a = fresh_pin(None);
            let b = fresh_pin(Some((a.now.clone(), Instant::now())));
            assert!(a.now.len() == 4 && a.now.bytes().all(|c| c.is_ascii_digit()));
            assert_ne!(a.now, b.now);
        }
    }

    #[test]
    fn devices_get_a_readable_name() {
        let iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
        let pixel = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
        let edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0";
        let firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";
        assert_eq!(device_name(iphone), "iPhone · Safari");
        assert_eq!(device_name(pixel), "Android phone · Chrome");
        assert_eq!(device_name(edge), "Windows · Edge");
        assert_eq!(device_name(firefox), "Linux · Firefox");
        assert_eq!(device_name(""), "Unknown device");
    }

    #[test]
    fn the_command_list_has_no_way_to_change_anything() {
        for banned in [
            "launch_game",
            "apply_enable_bridge",
            "set_save_dir",
            "pick_folder",
            "set_pinned",
            "set_frame",
            "quit_app",
            "set_remote",
        ] {
            assert!(!READ_ONLY.contains(&banned), "{banned}");
        }
    }
}

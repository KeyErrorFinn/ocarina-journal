//! The server against a real socket, with a stand-in backend.

use std::net::{IpAddr, Ipv4Addr};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use futures::future::BoxFuture;
use futures::{FutureExt, StreamExt};
use oj_remote::{start, Assets, Backend, Config, Reply, Server};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

struct Fake {
    calls: AtomicUsize,
}
impl Backend for Fake {
    fn call(&self, cmd: String, _args: Value) -> BoxFuture<'static, Result<Reply, String>> {
        self.calls.fetch_add(1, Ordering::Relaxed);
        async move {
            if cmd == "get_sound" {
                Ok(Reply::Bytes(vec![1, 2, 3]))
            } else if cmd == "get_lore" {
                Err("synthetic-private-folder/game-file: failed to read".into())
            } else {
                Ok(Reply::Json(json!({ "cmd": cmd })))
            }
        }
        .boxed()
    }
    fn state(&self) -> Value {
        json!({ "mode": "offline" })
    }
}
/// The app's page. Counts how many times the server looked for one of its files (it must not, for a screen that hasn't
/// paired).
#[derive(Default)]
struct Page(Arc<AtomicUsize>);
impl Assets for Page {
    fn get(&self, path: &str) -> Option<(Vec<u8>, String)> {
        self.0.fetch_add(1, Ordering::Relaxed);
        (path == "index.html").then(|| (b"<html>app</html>".to_vec(), "text/html".to_string()))
    }
}

async fn up() -> (Server, Arc<Fake>) {
    let (server, fake, _) = up_counting().await;
    (server, fake)
}

async fn up_counting() -> (Server, Arc<Fake>, Arc<AtomicUsize>) {
    let fake = Arc::new(Fake { calls: AtomicUsize::new(0) });
    let reads = Arc::new(AtomicUsize::new(0));
    let server = start(Config {
        bind: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        backend: fake.clone(),
        assets: Arc::new(Page(reads.clone())),
        sessions: vec![],
        idle_life: WEEK,
        on_change: Arc::new(|| {}),
    })
    .await
    .unwrap();
    (server, fake, reads)
}

struct Resp {
    status: u16,
    head: String,
    body: Vec<u8>,
}

/// One HTTP/1.1 request on a fresh connection.
async fn http(s: &Server, method: &str, path: &str, extra: &[(&str, &str)], body: &str) -> Resp {
    let mut c = tokio::net::TcpStream::connect(s.addr()).await.unwrap();
    let mut req = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\nContent-Length: {}\r\n", body.len());
    if !extra.iter().any(|(k, _)| k.eq_ignore_ascii_case("host")) {
        req += &format!("Host: {}\r\n", s.addr());
    }
    for (k, v) in extra {
        req += &format!("{k}: {v}\r\n");
    }
    req += &format!("\r\n{body}");
    c.write_all(req.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    c.read_to_end(&mut raw).await.unwrap();
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
    let head = String::from_utf8_lossy(&raw[..split]).to_string();
    let status = head.split_whitespace().nth(1).unwrap().parse().unwrap();
    Resp { status, head, body: raw[split + 4..].to_vec() }
}

fn both(s: &Server) -> String {
    json!({ "code": s.code(), "pin": s.pin().0 }).to_string()
}

async fn pair(s: &Server) -> String {
    pair_as(s, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1").await
}

async fn pair_as(s: &Server, agent: &str) -> String {
    let r = http(s, "POST", "/pair", &[JSON, ("User-Agent", agent)], &both(s)).await;
    assert_eq!(r.status, 200, "{}", r.head);
    let line = r.head.lines().find(|l| l.to_ascii_lowercase().starts_with("set-cookie:")).unwrap();
    assert!(line.contains("HttpOnly") && line.contains("SameSite=Strict"));
    line.split_once(':').unwrap().1.trim().split(';').next().unwrap().to_string()
}

const WEEK: std::time::Duration = std::time::Duration::from_secs(7 * 24 * 60 * 60);
const JSON: (&str, &str) = ("Content-Type", "application/json");

#[tokio::test]
async fn a_screen_that_has_not_paired_gets_the_pairing_page_and_nothing_of_the_app() {
    let (s, fake, reads) = up_counting().await;
    for path in ["/", "/index.html", "/some/screen"] {
        let r = http(&s, "GET", path, &[], "").await;
        assert_eq!(r.status, 200, "{path}");
        let body = String::from_utf8_lossy(&r.body).to_string();
        assert!(body.contains("pair.js") && !body.contains("<html>app</html>"), "{path}");
        assert!(r.head.to_ascii_lowercase().contains("content-security-policy: default-src 'none'"));
    }
    let js = http(&s, "GET", "/pair.js", &[], "").await;
    assert_eq!(js.status, 200);
    assert!(String::from_utf8_lossy(&js.body).contains("/pair"));
    // Scripts, styles, pictures and sounds of the app are refused, and the app's files aren't even looked at.
    for path in ["/missing.js", "/assets/index-abc.js", "/assets/logo.webp", "/favicon.ico", "/x.css"] {
        assert_eq!(http(&s, "GET", path, &[], "").await.status, 401, "{path}");
    }
    assert_eq!(http(&s, "POST", "/api/invoke/get_state", &[JSON], "{}").await.status, 401);
    assert_eq!(fake.calls.load(Ordering::Relaxed), 0);
    assert_eq!(reads.load(Ordering::Relaxed), 0, "the app's files were read for an unpaired screen");
}

#[tokio::test]
async fn a_paired_screen_gets_the_app() {
    let (s, _) = up().await;
    let cookie = pair(&s).await;
    let home = http(&s, "GET", "/", &[("Cookie", &cookie)], "").await;
    assert_eq!(home.status, 200);
    assert!(String::from_utf8_lossy(&home.body).contains("<html>app</html>"));
    assert_eq!(http(&s, "GET", "/some/screen", &[("Cookie", &cookie)], "").await.status, 200);
    assert_eq!(http(&s, "GET", "/missing.js", &[("Cookie", &cookie)], "").await.status, 404);
}

#[tokio::test]
async fn qr_arrivals_can_check_an_existing_session_without_pairing_or_reading_app_data() {
    let (s, fake, reads) = up_counting().await;
    let cookie = pair(&s).await;
    // Simulate the scanner's initial navigation without its Strict cookie.
    let arrival = http(&s, "GET", "/?code=ABCDEFGH", &[], "").await;
    assert!(String::from_utf8_lossy(&arrival.body).contains("pair.js"));
    let script = http(&s, "GET", "/pair.js", &[("Cookie", &cookie)], "").await;
    assert_eq!(script.status, 200, "the script's request can already carry the Strict cookie");
    assert!(String::from_utf8_lossy(&script.body).contains("/api/session"));
    for (headers, status) in [
        (vec![], 401),
        (vec![("Cookie", "oj_session=invalid")], 401),
        (vec![("Cookie", cookie.as_str())], 204),
        (vec![("Cookie", cookie.as_str()), ("Origin", "http://untrusted.example")], 403),
    ] {
        let res = http(&s, "GET", "/api/session", &headers, "").await;
        assert_eq!(res.status, status);
        assert!(res.head.to_ascii_lowercase().contains("cache-control: no-store"));
    }
    assert_eq!(fake.calls.load(Ordering::Relaxed), 0);
    assert_eq!(reads.load(Ordering::Relaxed), 0);
    // Recognising a session must not create another one, and Disconnect must still invalidate it.
    assert_eq!(s.screens().len(), 1);
    s.rotate_code();
    assert_eq!(http(&s, "GET", "/api/session", &[("Cookie", &cookie)], "").await.status, 401);
}

#[tokio::test]
async fn paired_screens_stay_paired_when_the_app_restarts() {
    let (first, _) = up().await;
    let cookie = pair(&first).await;
    let saved = first.saved_sessions();
    assert_eq!(saved.len(), 1);
    // Only a hash of the cookie is kept, never the cookie.
    let token = cookie.split_once('=').unwrap().1;
    assert!(saved[0].token_hash != token && saved[0].token_hash.len() == 64 && !format!("{saved:?}").contains(token));
    drop(first);
    let second = start(Config {
        bind: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        backend: Arc::new(Fake { calls: AtomicUsize::new(0) }),
        assets: Arc::new(Page::default()),
        sessions: saved,
        idle_life: WEEK,
        on_change: Arc::new(|| {}),
    })
    .await
    .unwrap();
    assert_eq!(http(&second, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &cookie)], "{}").await.status, 200);
    assert_eq!(second.screens().len(), 1);
    assert_eq!(
        http(&second, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", "oj_session=nope")], "{}").await.status,
        401
    );
    // A new code still signs everyone out, restored or not.
    second.rotate_code();
    assert!(second.saved_sessions().is_empty());
    assert_eq!(http(&second, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &cookie)], "{}").await.status, 401);
}

#[tokio::test]
async fn a_paired_browser_can_read_but_only_the_listed_commands() {
    let (s, fake) = up().await;
    let cookie = pair(&s).await;
    let ok = http(&s, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &cookie)], "{}").await;
    assert_eq!(ok.status, 200);
    assert!(String::from_utf8_lossy(&ok.body).contains("get_state"));
    let wav = http(&s, "POST", "/api/invoke/get_sound", &[JSON, ("Cookie", &cookie)], "{\"name\":\"x\"}").await;
    assert_eq!(wav.body, vec![1, 2, 3]);
    let calls = fake.calls.load(Ordering::Relaxed);
    for banned in ["launch_game", "apply_enable_bridge", "set_save_dir", "set_remote", "quit_app", "pick_folder"] {
        let r = http(&s, "POST", &format!("/api/invoke/{banned}"), &[JSON, ("Cookie", &cookie)], "{}").await;
        assert_eq!(r.status, 404, "{banned}");
    }
    assert_eq!(fake.calls.load(Ordering::Relaxed), calls, "a command outside the list reached the app");
}

#[tokio::test]
async fn app_progress_sync_requires_pairing_and_same_origin() {
    let (s, fake) = up().await;
    let args = r#"{"key":"home.seen","value":{"map":"1"},"initialize":false}"#;
    assert_eq!(http(&s, "POST", "/api/invoke/sync_ui", &[JSON], args).await.status, 401);
    let cookie = pair(&s).await;
    assert_eq!(
        http(&s, "POST", "/api/invoke/sync_ui", &[JSON, ("Cookie", &cookie), ("Origin", "http://other.example")], args)
            .await
            .status,
        403
    );
    assert_eq!(fake.calls.load(Ordering::Relaxed), 0);
    assert_eq!(http(&s, "POST", "/api/invoke/sync_ui", &[JSON, ("Cookie", &cookie)], args).await.status, 200);
    assert_eq!(fake.calls.load(Ordering::Relaxed), 1);
}

#[tokio::test]
async fn backend_errors_do_not_disclose_private_file_paths() {
    let (server, _) = up().await;
    let cookie = pair(&server).await;
    let response = http(&server, "POST", "/api/invoke/get_lore", &[JSON, ("Cookie", &cookie)], "{}").await;
    assert_eq!(response.status, 500);
    let body = String::from_utf8(response.body).unwrap();
    assert!(!body.contains("synthetic-private-folder"));
    assert!(!body.contains("game-file"));
    assert!(body.contains("desktop app"));
}

#[tokio::test]
async fn wrong_codes_are_refused_and_then_rate_limited() {
    let (s, _) = up().await;
    for _ in 0..6 {
        let r = http(&s, "POST", "/pair", &[JSON], "{\"code\":\"AAAAAAAA\",\"pin\":\"0000\"}").await;
        assert_eq!(r.status, 401);
    }
    // Even the right codes are not looked at while the limit holds, and the answer says how long to wait.
    let r = http(&s, "POST", "/pair", &[JSON], &both(&s)).await;
    assert_eq!(r.status, 429);
    let wait: u64 = r
        .head
        .lines()
        .find_map(|l| l.to_ascii_lowercase().strip_prefix("retry-after:").map(|v| v.trim().parse().unwrap()))
        .unwrap();
    assert!((1..=60).contains(&wait));
}

#[tokio::test]
async fn right_attempts_count_towards_the_limit_too() {
    let (s, _) = up().await;
    for _ in 0..6 {
        assert_eq!(http(&s, "POST", "/pair", &[JSON], &both(&s)).await.status, 200);
    }
    assert_eq!(http(&s, "POST", "/pair", &[JSON], &both(&s)).await.status, 429);
}

#[tokio::test]
async fn both_codes_are_needed_and_only_the_request_body_counts() {
    let (s, _) = up().await;
    let code = s.code();
    let pin = s.pin().0;
    let wrong_pin = if pin == "0000" { "0001" } else { "0000" };
    // The first step: the right pairing code alone is welcome, but signs nothing in.
    let first = http(&s, "POST", "/pair", &[JSON], &json!({ "code": code }).to_string()).await;
    assert_eq!(first.status, 200);
    assert!(!first.head.to_ascii_lowercase().contains("set-cookie"));
    assert_eq!(http(&s, "POST", "/pair", &[JSON], &json!({ "code": "AAAA-AAAA" }).to_string()).await.status, 401);
    for body in
        [json!({ "pin": pin }), json!({ "code": code, "pin": wrong_pin }), json!({ "code": "AAAA-AAAA", "pin": pin })]
    {
        let r = http(&s, "POST", "/pair", &[JSON], &body.to_string()).await;
        assert_eq!(r.status, 401, "{body}");
        assert!(!r.head.to_ascii_lowercase().contains("set-cookie"));
    }
    // The server never reads a code from the address (the page does that, and sends it in a body).
    let q = format!("code={}&pin={}", code.replace('-', ""), pin);
    let page = http(&s, "GET", &format!("/?{q}"), &[], "").await;
    assert!(!page.head.to_ascii_lowercase().contains("set-cookie"));
    let post = http(&s, "POST", &format!("/pair?{q}"), &[JSON], "{}").await;
    assert_eq!(post.status, 401);
    assert!(!post.head.to_ascii_lowercase().contains("set-cookie"));
    assert_eq!(http(&s, "POST", "/api/invoke/get_state", &[JSON], "{}").await.status, 401);
}

#[tokio::test]
async fn paired_screens_are_listed_by_name_and_can_be_signed_out_one_by_one() {
    let (s, _) = up().await;
    let phone = pair(&s).await;
    let pc = pair_as(
        &s,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0",
    )
    .await;
    let screens = s.screens();
    assert_eq!(screens.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(), ["iPhone · Safari", "Windows · Edge"]);
    assert!(screens.iter().all(|x| x.addr == "127.0.0.1" && !x.online && x.since_ms > 0));
    s.disconnect(&screens[0].id);
    assert_eq!(http(&s, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &phone)], "{}").await.status, 401);
    assert_eq!(http(&s, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &pc)], "{}").await.status, 200);
    assert_eq!(s.screens().len(), 1);
}

/// The first release froze the whole app when the player pressed "New code": the app asked for a change while holding the
/// lock its own change handler takes. The handler now never runs on the caller's thread.
#[tokio::test]
async fn asking_for_a_change_while_holding_the_apps_lock_does_not_wait_on_itself() {
    use std::sync::Mutex;
    let apps_lock = Arc::new(Mutex::new(()));
    let handler_lock = apps_lock.clone();
    let ran = Arc::new(AtomicUsize::new(0));
    let ran_in_handler = ran.clone();
    let s = start(Config {
        bind: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        backend: Arc::new(Fake { calls: AtomicUsize::new(0) }),
        assets: Arc::new(Page::default()),
        sessions: vec![],
        idle_life: WEEK,
        on_change: Arc::new(move || {
            let _held = handler_lock.lock().unwrap();
            ran_in_handler.fetch_add(1, Ordering::Relaxed);
        }),
    })
    .await
    .unwrap();
    let guard = apps_lock.lock().unwrap();
    s.rotate_code();
    let id = "none";
    s.disconnect(id);
    drop(guard);
    for _ in 0..100 {
        if ran.load(Ordering::Relaxed) >= 2 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    assert!(ran.load(Ordering::Relaxed) >= 2, "the change handler never ran");
}

#[tokio::test]
async fn names_and_other_sites_are_refused() {
    let (s, _) = up().await;
    let cookie = pair(&s).await;
    let rebind =
        http(&s, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &cookie), ("Host", "evil.example:80")], "{}")
            .await;
    assert_eq!(rebind.status, 403);
    let cross = http(
        &s,
        "POST",
        "/api/invoke/get_state",
        &[JSON, ("Cookie", &cookie), ("Origin", "http://evil.example")],
        "{}",
    )
    .await;
    assert_eq!(cross.status, 403);
    let plain =
        http(&s, "POST", "/api/invoke/get_state", &[("Content-Type", "text/plain"), ("Cookie", &cookie)], "{}").await;
    assert_eq!(plain.status, 415);
    let page = http(&s, "GET", "/", &[("Host", "evil.example")], "").await;
    assert_eq!(page.status, 403);
    assert!(!plain.head.to_ascii_lowercase().contains("access-control-allow"));
}

#[tokio::test]
async fn a_new_code_signs_everyone_out() {
    let (s, _) = up().await;
    let cookie = pair(&s).await;
    let old = s.code();
    s.rotate_code();
    assert_ne!(old, s.code());
    assert!(s.screens().is_empty());
    assert_eq!(http(&s, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &cookie)], "{}").await.status, 401);
}

#[tokio::test]
async fn it_will_not_listen_on_every_address() {
    let r = start(Config {
        bind: IpAddr::V4(Ipv4Addr::UNSPECIFIED),
        port: 0,
        backend: Arc::new(Fake { calls: AtomicUsize::new(0) }),
        assets: Arc::new(Page::default()),
        sessions: vec![],
        idle_life: WEEK,
        on_change: Arc::new(|| {}),
    })
    .await;
    assert!(r.is_err());
}

#[tokio::test]
async fn live_state_reaches_a_paired_socket_and_not_an_unpaired_one() {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    let (s, _) = up().await;
    let url = format!("ws://{}/ws", s.addr());
    let mut req = url.as_str().into_client_request().unwrap();
    assert!(tokio_tungstenite::connect_async(req.clone()).await.is_err(), "an unpaired socket was accepted");
    req.headers_mut().insert("Cookie", pair(&s).await.parse().unwrap());
    let (mut ws, _) = tokio_tungstenite::connect_async(req).await.unwrap();
    let first = ws.next().await.unwrap().unwrap().into_text().unwrap();
    assert!(first.contains("offline"));
    for _ in 0..50 {
        if s.clients() == 1 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    assert_eq!(s.clients(), 1);
    s.push(&json!({ "mode": "live" }));
    let next = ws.next().await.unwrap().unwrap().into_text().unwrap();
    assert!(next.contains("live"));
}

async fn up_with(idle_life: std::time::Duration, sessions: Vec<oj_remote::SavedSession>) -> Server {
    start(Config {
        bind: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        backend: Arc::new(Fake { calls: AtomicUsize::new(0) }),
        assets: Arc::new(Page::default()),
        sessions,
        idle_life,
        on_change: Arc::new(|| {}),
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn a_screen_that_stays_away_too_long_has_to_pair_again_but_using_the_page_keeps_it() {
    use std::time::Duration;
    let s = up_with(Duration::from_millis(600), vec![]).await;
    let idle = pair(&s).await;
    let used = pair(&s).await;
    // One is used every so often (each use starts the time over); the other is left alone.
    for _ in 0..6 {
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert_eq!(http(&s, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &used)], "{}").await.status, 200);
    }
    assert_eq!(http(&s, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &idle)], "{}").await.status, 401);
    assert_eq!(s.screens().len(), 1);
    // Away for a while, and it's gone too.
    tokio::time::sleep(Duration::from_millis(800)).await;
    assert_eq!(http(&s, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &used)], "{}").await.status, 401);
    assert!(s.screens().is_empty());
}

#[tokio::test]
async fn a_screen_with_its_page_open_never_counts_as_away() {
    use std::time::Duration;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    let s = up_with(Duration::from_millis(400), vec![]).await;
    let cookie = pair(&s).await;
    let mut req = format!("ws://{}/ws", s.addr()).as_str().into_client_request().unwrap();
    req.headers_mut().insert("Cookie", cookie.parse().unwrap());
    let (mut ws, _) = tokio_tungstenite::connect_async(req).await.unwrap();
    let _ = ws.next().await;
    tokio::time::sleep(Duration::from_millis(1000)).await;
    assert_eq!(s.screens().len(), 1, "an open page was signed out");
    // Once the page is closed the time starts from then.
    ws.close(None).await.unwrap();
    drop(ws);
    tokio::time::sleep(Duration::from_millis(1000)).await;
    assert_eq!(http(&s, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &cookie)], "{}").await.status, 401);
}

#[tokio::test]
async fn screens_restored_after_a_long_absence_are_dropped() {
    let first = up().await.0;
    let _ = pair(&first).await;
    let mut saved = first.saved_sessions();
    assert!(saved[0].last_seen_ms > 0);
    // As if it was last seen two weeks ago.
    saved[0].last_seen_ms -= 14 * 24 * 60 * 60 * 1000;
    let second = up_with(WEEK, saved).await;
    assert!(second.screens().is_empty());
}

#[tokio::test]
async fn a_screen_can_sign_itself_out_and_only_itself() {
    let (s, _) = up().await;
    let me = pair(&s).await;
    let other = pair(&s).await;
    // Not without being paired, and not from another site.
    assert_eq!(http(&s, "POST", "/api/signout", &[JSON], "{}").await.status, 401);
    assert_eq!(
        http(&s, "POST", "/api/signout", &[JSON, ("Cookie", &me), ("Origin", "http://evil.example")], "{}")
            .await
            .status,
        403
    );
    assert_eq!(
        http(&s, "POST", "/api/signout", &[("Content-Type", "text/plain"), ("Cookie", &me)], "{}").await.status,
        415
    );
    assert_eq!(s.screens().len(), 2);
    let r = http(&s, "POST", "/api/signout", &[JSON, ("Cookie", &me)], "{}").await;
    assert_eq!(r.status, 200);
    assert!(r.head.to_ascii_lowercase().contains("max-age=0"));
    assert_eq!(http(&s, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &me)], "{}").await.status, 401);
    assert_eq!(http(&s, "POST", "/api/invoke/get_state", &[JSON, ("Cookie", &other)], "{}").await.status, 200);
    assert_eq!(s.screens().len(), 1);
}

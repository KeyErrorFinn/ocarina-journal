use std::{
    future::Future,
    io,
    pin::Pin,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};

use oj_bridge::{spawn, BridgeEvent, Config, Connector, Stream};
use oj_testkit::{serve, Fixture};
use tokio::time::timeout;

/// Hands out in-memory streams served by the fake bridge; the first `fail` attempts error out.
struct FakeConnector {
    fail: usize,
    attempts: Arc<AtomicUsize>,
    pace: Duration,
}

impl Connector for FakeConnector {
    fn connect(&self) -> Pin<Box<dyn Future<Output = io::Result<Box<dyn Stream>>> + Send + '_>> {
        Box::pin(async move {
            let n = self.attempts.fetch_add(1, Ordering::SeqCst);
            if n < self.fail {
                return Err(io::Error::new(io::ErrorKind::NotFound, "no pipe yet"));
            }
            let (client, server) = tokio::io::duplex(64 * 1024);
            let pace = self.pace;
            tokio::spawn(async move { serve(server, Fixture::session(), pace, false).await });
            Ok(Box::new(client) as Box<dyn Stream>)
        })
    }
}

fn fast_config(channel: usize) -> Config {
    Config {
        backoff_initial: Duration::from_millis(10),
        backoff_max: Duration::from_millis(40),
        channel,
        ..Config::default()
    }
}

#[tokio::test]
async fn connects_subscribes_and_streams_synthetic_session() {
    let attempts = Arc::new(AtomicUsize::new(0));
    let conn = FakeConnector { fail: 0, attempts: attempts.clone(), pace: Duration::from_millis(1) };
    let (_h, mut rx) = spawn(conn, fast_config(64));

    let first = timeout(Duration::from_secs(5), rx.recv()).await.unwrap().unwrap();
    assert!(matches!(first, BridgeEvent::Connected(Some(_))), "got {first:?}");

    let (mut samples, mut maps) = (0, 0);
    while samples < 20 {
        match timeout(Duration::from_secs(5), rx.recv()).await.unwrap().unwrap() {
            BridgeEvent::Sample { game, .. } => {
                assert!(game.life.is_some());
                samples += 1;
            }
            BridgeEvent::Map(_) => maps += 1,
            _ => {}
        }
    }
    assert!(samples >= 20);
    let _ = maps;
}

#[tokio::test]
async fn retries_with_backoff_until_the_bridge_appears() {
    let attempts = Arc::new(AtomicUsize::new(0));
    let conn = FakeConnector { fail: 3, attempts: attempts.clone(), pace: Duration::from_millis(1) };
    let (_h, mut rx) = spawn(conn, fast_config(64));
    let first = timeout(Duration::from_secs(5), rx.recv()).await.unwrap().unwrap();
    assert!(matches!(first, BridgeEvent::Connected(_)));
    assert_eq!(attempts.load(Ordering::SeqCst), 4);
}

#[tokio::test]
async fn reconnects_after_the_server_hangs_up() {
    let attempts = Arc::new(AtomicUsize::new(0));
    let conn = FakeConnector { fail: 0, attempts: attempts.clone(), pace: Duration::from_millis(0) };
    let (_h, mut rx) = spawn(conn, fast_config(4096));
    // The non-repeating fixture ends, the server closes, and we must see Disconnected then a new Connected.
    let (mut disconnected, mut connected) = (false, 0);
    timeout(Duration::from_secs(10), async {
        while let Some(ev) = rx.recv().await {
            match ev {
                BridgeEvent::Disconnected => disconnected = true,
                BridgeEvent::Connected(_) => {
                    connected += 1;
                    if connected == 2 {
                        break;
                    }
                }
                _ => {}
            }
        }
    })
    .await
    .unwrap();
    assert!(disconnected && connected == 2);
}

#[tokio::test]
async fn slow_consumer_drops_samples_instead_of_stalling() {
    let attempts = Arc::new(AtomicUsize::new(0));
    let conn = FakeConnector { fail: 0, attempts, pace: Duration::from_millis(0) };
    let (h, mut rx) = spawn(conn, fast_config(2));
    // Do not read for a while; the fixture has hundreds of samples.
    tokio::time::sleep(Duration::from_millis(500)).await;
    assert!(h.stats.samples_dropped.load(Ordering::Relaxed) > 0, "expected dropped samples");
    // The consumer can still drain and the stream is alive.
    assert!(timeout(Duration::from_secs(5), rx.recv()).await.unwrap().is_some());
}

#[cfg(windows)]
#[tokio::test]
async fn talks_to_a_real_named_pipe() {
    let name = format!("oj-test-{}", std::process::id());
    let n2 = name.clone();
    tokio::spawn(async move {
        let _ = oj_testkit::serve_pipe(&n2, Fixture::session(), Duration::from_millis(2)).await;
    });
    tokio::time::sleep(Duration::from_millis(100)).await;
    let (_h, mut rx) = spawn(oj_bridge::LocalConnector { name }, fast_config(64));
    let first = timeout(Duration::from_secs(5), rx.recv()).await.unwrap().unwrap();
    assert!(matches!(first, BridgeEvent::Connected(Some(_))), "got {first:?}");
    let next = timeout(Duration::from_secs(5), async {
        loop {
            if let Some(BridgeEvent::Sample { .. }) = rx.recv().await {
                return true;
            }
        }
    })
    .await
    .unwrap();
    assert!(next);
}

#[cfg(unix)]
#[tokio::test]
async fn talks_to_a_real_unix_socket() {
    use std::os::unix::fs::PermissionsExt;
    let dir = std::env::temp_dir().join(format!("oj-socket-test-{}", std::process::id()));
    std::fs::create_dir(&dir).unwrap();
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
    let path = dir.join("control.sock");
    let listener = tokio::net::UnixListener::bind(&path).unwrap();
    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        serve(stream, Fixture::session(), Duration::from_millis(2), true).await;
    });
    let (handle, mut rx) =
        spawn(oj_bridge::LocalConnector { name: path.to_string_lossy().into_owned() }, fast_config(64));
    let first = timeout(Duration::from_secs(5), rx.recv()).await.unwrap().unwrap();
    assert!(matches!(first, BridgeEvent::Connected(Some(_))), "got {first:?}");
    timeout(Duration::from_secs(5), async {
        loop {
            if matches!(rx.recv().await, Some(BridgeEvent::Sample { .. })) {
                break;
            }
        }
    })
    .await
    .unwrap();
    handle.abort();
    server.abort();
    std::fs::remove_file(path).unwrap();
    std::fs::remove_dir(dir).unwrap();
}

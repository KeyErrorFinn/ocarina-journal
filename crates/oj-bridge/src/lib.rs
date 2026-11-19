//! Read-only client for Longshot's control bridge.
//!
//! [`spawn`] starts a supervisor task that connects (with exponential backoff), subscribes to the
//! live `oot`/`map` events, and forwards them as [`BridgeEvent`]s over a bounded channel. It sends
//! only the read-only commands defined in `oj-protocol`.
//!
//! Slow consumers: high-rate `Oot` samples are dropped (and counted) when the channel is full so
//! the bridge's own writer is never blocked by us; lifecycle events always wait for room.

use std::{
    future::Future,
    io,
    pin::Pin,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};

use futures::{SinkExt, StreamExt};
use oj_protocol::{
    decode_line, Command, Event, Game, Incoming, MapChange, Request, Status, Subscribe,
    MAX_LINE,
};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    sync::mpsc,
    task::JoinHandle,
};
use tokio_util::codec::{Framed, LinesCodec};

/// Anything we can speak the protocol over.
pub trait Stream: AsyncRead + AsyncWrite + Unpin + Send + 'static {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send + 'static> Stream for T {}

/// Opens one connection to the bridge. Implemented for the real pipe and for test fakes.
pub trait Connector: Send + Sync + 'static {
    fn connect(&self) -> Pin<Box<dyn Future<Output = io::Result<Box<dyn Stream>>> + Send + '_>>;
}

/// Connects to `\\.\pipe\<name>` on Windows, or the Unix socket path on other platforms.
/// Never TCP.
pub struct LocalConnector {
    pub name: String,
}

impl Connector for LocalConnector {
    fn connect(&self) -> Pin<Box<dyn Future<Output = io::Result<Box<dyn Stream>>> + Send + '_>> {
        Box::pin(async move {
            #[cfg(windows)]
            {
                let path = format!(r"\\.\pipe\{}", self.name);
                let c = tokio::net::windows::named_pipe::ClientOptions::new().open(path)?;
                Ok(Box::new(c) as Box<dyn Stream>)
            }
            #[cfg(unix)]
            {
                let c = tokio::net::UnixStream::connect(&self.name).await?;
                Ok(Box::new(c) as Box<dyn Stream>)
            }
        })
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub subscribe: Subscribe,
    pub backoff_initial: Duration,
    pub backoff_max: Duration,
    /// Capacity of the event channel handed to the consumer.
    pub channel: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            subscribe: Subscribe::live_default(),
            backoff_initial: Duration::from_millis(500),
            backoff_max: Duration::from_secs(5),
            channel: 256,
        }
    }
}

/// What the consumer sees.
#[derive(Debug, Clone, PartialEq)]
pub enum BridgeEvent {
    /// Connected and subscribed; `Status` is the reply to the initial `status` request.
    Connected(Option<Status>),
    Disconnected,
    Sample { frame: u64, game: Box<Game> },
    Map(MapChange),
    /// A server error reply (for example `unavailable` before the game opens its saves).
    ServerError { error: String, message: Option<String> },
    /// An event kind this client does not model.
    Other { kind: String },
}

/// Counters shared with the consumer.
#[derive(Debug, Default)]
pub struct Stats {
    pub samples_dropped: AtomicU64,
    pub bad_lines: AtomicU64,
    pub connects: AtomicU64,
}

pub struct Handle {
    pub stats: Arc<Stats>,
    task: JoinHandle<()>,
}

impl Handle {
    /// Stop the supervisor.
    pub fn abort(&self) {
        self.task.abort();
    }
}

impl Drop for Handle {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Start the supervisor. Returns a handle and the event receiver.
pub fn spawn<C: Connector>(connector: C, config: Config) -> (Handle, mpsc::Receiver<BridgeEvent>) {
    let (tx, rx) = mpsc::channel(config.channel.max(1));
    let stats = Arc::new(Stats::default());
    let task = tokio::spawn(supervise(connector, config, tx, stats.clone()));
    (Handle { stats, task }, rx)
}

async fn supervise<C: Connector>(
    connector: C,
    config: Config,
    tx: mpsc::Sender<BridgeEvent>,
    stats: Arc<Stats>,
) {
    let mut delay = config.backoff_initial;
    loop {
        match connector.connect().await {
            Ok(stream) => {
                delay = config.backoff_initial;
                stats.connects.fetch_add(1, Ordering::Relaxed);
                if session(stream, &config, &tx, &stats).await.is_err() {
                    return; // consumer went away
                }
                if tx.send(BridgeEvent::Disconnected).await.is_err() {
                    return;
                }
            }
            Err(e) => tracing::debug!("bridge not reachable: {e}"),
        }
        tokio::time::sleep(delay).await;
        delay = (delay * 2).min(config.backoff_max);
    }
}

/// Run one connection. `Err(())` means the consumer dropped the receiver.
async fn session(
    stream: Box<dyn Stream>,
    config: &Config,
    tx: &mpsc::Sender<BridgeEvent>,
    stats: &Stats,
) -> Result<(), ()> {
    let mut framed = Framed::new(stream, LinesCodec::new_with_max_length(MAX_LINE));
    const STATUS_ID: u64 = 1;
    const SUBSCRIBE_ID: u64 = 2;
    let hello = [
        Request { id: STATUS_ID, cmd: Command::Status },
        Request { id: SUBSCRIBE_ID, cmd: Command::Subscribe(config.subscribe.clone()) },
    ];
    for r in hello {
        if framed.send(r.to_line()).await.is_err() {
            return Ok(());
        }
    }
    while let Some(next) = framed.next().await {
        let line = match next {
            Ok(l) => l,
            Err(e) => {
                // Over-long line or I/O error: resynchronising is not safe, reconnect.
                tracing::warn!("bridge read error: {e}");
                stats.bad_lines.fetch_add(1, Ordering::Relaxed);
                return Ok(());
            }
        };
        let incoming = match decode_line(&line) {
            Ok(i) => i,
            Err(e) => {
                tracing::debug!("undecodable line: {e}");
                stats.bad_lines.fetch_add(1, Ordering::Relaxed);
                continue;
            }
        };
        match incoming {
            Incoming::Response(r) if r.id == STATUS_ID && r.ok => {
                tx.send(BridgeEvent::Connected(r.as_status())).await.map_err(|_| ())?;
            }
            Incoming::Response(r) if !r.ok => {
                let ev = BridgeEvent::ServerError {
                    error: r.error.unwrap_or_else(|| "unknown".into()),
                    message: r.message,
                };
                tx.send(ev).await.map_err(|_| ())?;
            }
            Incoming::Response(_) => {}
            Incoming::Event(Event::Oot { frame, game }) => {
                let ev = BridgeEvent::Sample { frame, game: Box::new(game) };
                if let Err(mpsc::error::TrySendError::Full(_)) = tx.try_send(ev) {
                    stats.samples_dropped.fetch_add(1, Ordering::Relaxed);
                } else if tx.is_closed() {
                    return Err(());
                }
            }
            Incoming::Event(Event::Map(m)) => {
                tx.send(BridgeEvent::Map(m)).await.map_err(|_| ())?;
            }
            Incoming::Event(Event::Other { kind, .. }) => {
                tx.send(BridgeEvent::Other { kind }).await.map_err(|_| ())?;
            }
        }
    }
    Ok(())
}

//! A fake Longshot control bridge that replays a recorded session.
//!
//! `serve` speaks the server side of protocol 1 over any async stream: it answers `status`,
//! acknowledges `subscribe`, then streams the fixture's `oot`/`map` events at a fixed pace.
//! Anything else is refused with `unknown_command`, mirroring a read-only client's needs.
//! It deliberately does not depend on `oj-bridge`, so the client's tests can use it without a
//! dependency cycle.

use std::time::Duration;

use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio_util::codec::{Framed, LinesCodec};

/// Recorded session shipped with the crate (derived from spike S1 run 1/2; no game assets).
pub const SESSION_FIXTURE: &str = include_str!("../fixtures/session.jsonl");

#[derive(Debug, Clone)]
pub struct Fixture {
    pub status: Value,
    pub events: Vec<Value>,
}

impl Fixture {
    /// Parse a fixture: first line `{"fixture":"status","body":{...}}`, then one event per line.
    pub fn parse(text: &str) -> Self {
        let mut lines = text.lines().filter(|l| !l.trim().is_empty());
        let head: Value = serde_json::from_str(lines.next().expect("fixture has a status line"))
            .expect("status line is JSON");
        let status = head["body"].clone();
        let events = lines.map(|l| serde_json::from_str(l).expect("event line is JSON")).collect();
        Self { status, events }
    }

    pub fn session() -> Self {
        Self::parse(SESSION_FIXTURE)
    }
}

/// Serve one client connection until it closes or the fixture is exhausted.
/// `pace` is the delay between streamed events; `repeat` loops the fixture forever.
pub async fn serve<S>(stream: S, fixture: Fixture, pace: Duration, repeat: bool)
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let mut framed = Framed::new(stream, LinesCodec::new_with_max_length(1 << 20));
    let mut subscribed = false;
    let mut next_event = 0usize;
    let mut tick = tokio::time::interval(pace.max(Duration::from_millis(1)));
    loop {
        tokio::select! {
            line = framed.next() => {
                let Some(Ok(line)) = line else { return };
                let Ok(req) = serde_json::from_str::<Value>(&line) else { continue };
                let id = req["id"].clone();
                let reply = match req["cmd"].as_str() {
                    Some("status") => {
                        let mut s = fixture.status.clone();
                        s["id"] = id;
                        s
                    }
                    Some("subscribe") => {
                        subscribed = true;
                        json!({"id": id, "ok": true, "frame": 0, "events": req["events"], "every": req["every"]})
                    }
                    Some("saves") => json!({"id": id, "ok": false, "error": "unavailable",
                        "message": "the game has not opened its saves yet"}),
                    _ => json!({"id": id, "ok": false, "error": "unknown_command"}),
                };
                if framed.send(reply.to_string()).await.is_err() { return }
            }
            _ = tick.tick(), if subscribed => {
                if next_event >= fixture.events.len() {
                    if repeat { next_event = 0 } else { return }
                }
                let ev = fixture.events[next_event].to_string();
                next_event += 1;
                if framed.send(ev).await.is_err() { return }
            }
        }
    }
}

/// Serve the fixture on a Windows named pipe `\\.\pipe\<name>`, one client at a time, forever.
/// The default pipe DACL gives the creating user access, matching the real bridge's intent.
#[cfg(windows)]
pub async fn serve_pipe(name: &str, fixture: Fixture, pace: Duration) -> std::io::Result<()> {
    use tokio::net::windows::named_pipe::ServerOptions;
    let path = format!(r"\\.\pipe\{name}");
    let mut server = ServerOptions::new().first_pipe_instance(true).reject_remote_clients(true).create(&path)?;
    loop {
        server.connect().await?;
        let connected = server;
        server = ServerOptions::new().reject_remote_clients(true).create(&path)?;
        let fx = fixture.clone();
        tokio::spawn(async move { serve(connected, fx, pace, true).await });
    }
}

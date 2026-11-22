//! Wire types for Longshot's control bridge, protocol 1 (newline-delimited JSON).
//!
//! Only **read-only** requests are representable: there is deliberately no way to build `press`,
//! `teleport`, `mem_*` or any other write command with this crate. The protocol is additive, so
//! every inbound type tolerates unknown fields and missing optional ones.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Maximum accepted length of one protocol line (bytes).
pub const MAX_LINE: usize = 1024 * 1024;

/// Read-only commands this client may send.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum Command {
    Status,
    Saves,
    Subscribe(Subscribe),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Subscribe {
    pub events: Vec<String>,
    /// Sample every N presented frames.
    pub every: u32,
    /// Include a `changed` map of flag hash -> value (only when something changed).
    pub changes: bool,
    /// Flag names to report by name (the bridge allows at most 64).
    pub flags: Vec<String>,
}

impl Subscribe {
    /// The subscription measured in spike S1: ~10 Hz at 60 fps, hearts/rupees by name.
    pub fn live_default() -> Self {
        Self {
            events: vec!["oot".into(), "map".into()],
            every: 6,
            changes: true,
            flags: vec!["PlayerStatus.Life".into(), "PlayerStatus.CurrentRupee".into(), "PlayerStatus.MaxLife".into()],
        }
    }
}

/// A request line: `{"id": N, "cmd": ...}`.
#[derive(Debug, Clone, Serialize)]
pub struct Request {
    pub id: u64,
    #[serde(flatten)]
    pub cmd: Command,
}

impl Request {
    /// Serialise to one line (without the trailing newline).
    pub fn to_line(&self) -> String {
        serde_json::to_string(self).expect("Request always serialises")
    }
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Response {
    pub id: u64,
    pub ok: bool,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    /// Everything else in the response (status fields, `events`, `every`, ...).
    #[serde(flatten)]
    pub body: serde_json::Map<String, Value>,
}

impl Response {
    /// Interpret the body as a `status` response.
    pub fn as_status(&self) -> Option<Status> {
        serde_json::from_value(Value::Object(self.body.clone())).ok()
    }
}

/// `status` response body.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Status {
    #[serde(default)]
    pub protocol: Option<u32>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub fps: Option<f64>,
    #[serde(default)]
    pub frame: Option<u64>,
    #[serde(default)]
    pub renderer: Option<String>,
    #[serde(default)]
    pub map: Option<String>,
    #[serde(default)]
    pub game: Option<Game>,
}

/// The `game` object of an `oot` event or `status` response.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Game {
    #[serde(default)]
    pub t: f64,
    #[serde(default)]
    pub frame: u64,
    #[serde(default)]
    pub map: Option<String>,
    #[serde(default)]
    pub pos: Option<[f64; 3]>,
    #[serde(default)]
    pub facing: Option<f64>,
    #[serde(default)]
    pub camera: Option<f64>,
    #[serde(default)]
    pub event: bool,
    #[serde(default)]
    pub loading: bool,
    #[serde(default)]
    pub age: Option<String>,
    /// Life in quarter hearts (4 per heart).
    #[serde(default)]
    pub life: Option<i64>,
    #[serde(default)]
    pub max_life: Option<i64>,
    #[serde(default)]
    pub rupees: Option<i64>,
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub music: Option<String>,
    /// Flags subscribed by name.
    #[serde(default)]
    pub flags: BTreeMap<String, Value>,
    /// Hash (`"0x..."`) -> new value, present only when something changed.
    #[serde(default)]
    pub changed: BTreeMap<String, Value>,
}

/// `map` event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MapChange {
    #[serde(default)]
    pub frame: u64,
    #[serde(default)]
    pub map: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
}

/// An unsolicited event line (`{"event": ...}`).
#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    Oot {
        frame: u64,
        game: Game,
    },
    Map(MapChange),
    /// Any event kind this client does not model; kept raw for logging.
    Other {
        kind: String,
        raw: Value,
    },
}

/// One decoded inbound line.
#[derive(Debug, Clone, PartialEq)]
pub enum Incoming {
    Response(Response),
    Event(Event),
}

#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("line is neither a response (id) nor an event")]
    Unrecognised,
}

/// Decode one inbound line.
pub fn decode_line(line: &str) -> Result<Incoming, DecodeError> {
    let v: Value = serde_json::from_str(line)?;
    if let Some(kind) = v.get("event").and_then(Value::as_str).map(str::to_owned) {
        let ev = match kind.as_str() {
            "oot" => match v.get("game").cloned().map(serde_json::from_value::<Game>) {
                Some(Ok(game)) => {
                    Event::Oot { frame: v.get("frame").and_then(Value::as_u64).unwrap_or(game.frame), game }
                }
                _ => Event::Other { kind, raw: v },
            },
            "map" => match serde_json::from_value::<MapChange>(v.clone()) {
                Ok(m) => Event::Map(m),
                Err(_) => Event::Other { kind, raw: v },
            },
            _ => Event::Other { kind, raw: v },
        };
        return Ok(Incoming::Event(ev));
    }
    if v.get("id").is_some() {
        return Ok(Incoming::Response(serde_json::from_value(v)?));
    }
    Err(DecodeError::Unrecognised)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requests_serialise_flat() {
        let r = Request { id: 7, cmd: Command::Status };
        assert_eq!(r.to_line(), r#"{"id":7,"cmd":"status"}"#);
        let s = Request { id: 2, cmd: Command::Subscribe(Subscribe::live_default()) }.to_line();
        assert!(s.contains(r#""cmd":"subscribe""#) && s.contains(r#""every":6"#));
    }

    #[test]
    fn decodes_synthetic_oot_event() {
        let line = r#"{"event":"oot","sub":2,"frame":60,"game":{"t":1.0,"frame":60,"map":"TestMeadow","pos":[1.0,0.0,2.0],"facing":90.0,"camera":90.0,"event":false,"loading":false,"age":"child","life":20,"max_life":20,"rupees":100,"prompt":null,"music":null,"flags":{},"changed":{"0x00000001":1}},"_t":1.0}"#;
        match decode_line(line).unwrap() {
            Incoming::Event(Event::Oot { frame, game }) => {
                assert_eq!(frame, 60);
                assert_eq!(game.life, Some(20));
                assert_eq!(game.rupees, Some(100));
                assert_eq!(game.changed.len(), 1);
            }
            other => panic!("unexpected {other:?}"),
        }
    }



    #[test]
    fn decodes_status_and_error_responses() {
        let ok = r#"{"id": 1, "ok": true, "frame": 0, "protocol": 1, "state": "boot", "version": "v3.0.0-rc.5 (source 013b1d3a)", "game": null}"#;
        let Incoming::Response(r) = decode_line(ok).unwrap() else { panic!() };
        assert!(r.ok);
        assert_eq!(r.as_status().unwrap().protocol, Some(1));
        let err =
            r#"{"id": 3, "ok": false, "error": "unavailable", "message": "the game has not opened its saves yet"}"#;
        let Incoming::Response(r) = decode_line(err).unwrap() else { panic!() };
        assert_eq!(r.error.as_deref(), Some("unavailable"));
    }

    #[test]
    fn unknown_events_and_fields_are_tolerated() {
        let Incoming::Event(Event::Other { kind, .. }) = decode_line(r#"{"event":"future","x":1}"#).unwrap() else {
            panic!()
        };
        assert_eq!(kind, "future");
        assert!(decode_line(r#"{"nothing":1}"#).is_err());
        assert!(decode_line("not json").is_err());
    }

    #[test]
    fn map_event_with_null_from() {
        let Incoming::Event(Event::Map(m)) =
            decode_line(r#"{"event":"map","sub":2,"frame":8667,"map":"X","from":null}"#).unwrap()
        else {
            panic!()
        };
        assert_eq!(m.map.as_deref(), Some("X"));
        assert_eq!(m.from, None);
    }
}

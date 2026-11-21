//! Journal logic: game samples in, timeline entries and totals out. Pure; the caller supplies wall time.
//!
//! What it can and cannot see is set by the bridge's `oot` sample (position, map, life, rupees, music,
//! `event`, `loading`). Kills, chests and items are not in that sample, so nothing here claims them.
//! The one combat signal is the battle music, which is **verified only for `BGM_EnemyBattle`**.

use std::collections::{BTreeMap, BTreeSet, VecDeque};

use oj_protocol::Game;
use serde::{Deserialize, Serialize};

/// Music cue seen during a fight (recorded session, 2026-11-19). Other battle/boss cues are unverified.
pub const BATTLE_MUSIC: &[&str] = &["BGM_EnemyBattle"];
/// Rupee and life counters tick over several samples; a change is reported once it has been still this long.
const SETTLE_SECS: f64 = 1.0;
/// Battle music must be gone this long before the fight counts as over (music can flicker).
const BATTLE_END_SECS: f64 = 3.0;
/// Gaps in game time larger than this (a pause, a load) are not counted as play time.
const MAX_DT: f64 = 5.0;
/// A step longer than this between samples is a teleport or load, not walking (game units).
const MAX_STEP: f64 = 60.0;
const MAX_ENTRIES: usize = 300;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Kind {
    AreaEntered { entered: String },
    BattleStarted,
    BattleEnded { secs: f64 },
    RupeesGained { amount: i64 },
    RupeesSpent { amount: i64 },
    DamageTaken { quarters: i64 },
    Healed { quarters: i64 },
    MaxLifeUp { quarters: i64 },
    Died,
    AgeChanged { age: String },
    /// An `event` window: a cutscene, text box or item pickup. The bridge cannot say which.
    Scene { secs: f64 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Entry {
    pub wall_ms: u64,
    pub game_t: f64,
    pub area: Option<String>,
    #[serde(flatten)]
    pub kind: Kind,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Totals {
    pub play_secs: f64,
    pub by_area: BTreeMap<String, f64>,
    /// The same time split by Link's age (`child`, `adult`), then area. Older saved days lack it.
    #[serde(default)]
    pub by_age_area: BTreeMap<String, BTreeMap<String, f64>>,
    /// Horizontal distance walked, in game units (the real-world scale is unknown).
    pub distance_units: f64,
    pub rupees_gained: i64,
    pub rupees_spent: i64,
    pub damage_quarters: i64,
    pub deaths: u32,
    pub battles: u32,
    pub battle_secs: f64,
    pub scenes: u32,
    pub areas_visited: BTreeSet<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Snapshot {
    pub started_wall_ms: u64,
    pub totals: Totals,
    /// Newest first.
    pub entries: Vec<Entry>,
}

#[derive(Debug, Default)]
pub struct Journal {
    started_wall_ms: u64,
    totals: Totals,
    entries: VecDeque<Entry>,
    last: Option<Game>,
    area: Option<String>,
    // pending counters
    rupee_base: Option<i64>,
    rupee_changed_t: f64,
    life_base: Option<i64>,
    life_changed_t: f64,
    // fights and scenes
    battle_since: Option<f64>,
    battle_quiet_since: Option<f64>,
    battle_last: f64,
    scene_since: Option<f64>,
    dead: bool,
}

impl Journal {
    pub fn new() -> Self {
        Self::default()
    }

    /// Forget everything (a new play session, or the game restarted).
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// Forget what belongs to one run of the game, keep what was recorded.
    pub fn new_run(&mut self) {
        let (started, totals, entries) = (self.started_wall_ms, std::mem::take(&mut self.totals), std::mem::take(&mut self.entries));
        *self = Self::default();
        (self.started_wall_ms, self.totals, self.entries) = (started, totals, entries);
    }

    /// Continue from a saved day (the first sample after this is a baseline).
    pub fn from_snapshot(s: Snapshot) -> Self {
        let mut j = Self::default();
        j.started_wall_ms = s.started_wall_ms;
        j.totals = s.totals;
        j.entries = s.entries.into_iter().rev().collect();
        j
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            started_wall_ms: self.started_wall_ms,
            totals: self.totals.clone(),
            entries: self.entries.iter().rev().cloned().collect(),
        }
    }

    fn push(&mut self, wall_ms: u64, t: f64, kind: Kind) {
        if self.entries.len() == MAX_ENTRIES {
            self.entries.pop_front();
        }
        self.entries.push_back(Entry { wall_ms, game_t: t, area: self.area.clone(), kind });
    }

    pub fn push_sample(&mut self, wall_ms: u64, g: &Game) {
        if self.started_wall_ms == 0 {
            self.started_wall_ms = wall_ms;
        }
        // A game clock that goes backwards means a new run of the game: the day's totals and entries stay, the
        // per-run state (what the counters were, the fight in progress) starts again.
        if matches!(&self.last, Some(l) if g.t + 1.0 < l.t) {
            self.new_run();
        }
        let t = g.t;

        if let Some(prev) = self.last.clone() {
            let dt = t - prev.t;
            if dt > 0.0 && dt <= MAX_DT {
                self.totals.play_secs += dt;
                if let Some(a) = &self.area {
                    *self.totals.by_area.entry(a.clone()).or_default() += dt;
                    if let Some(age) = &g.age {
                        *self.totals.by_age_area.entry(age.clone()).or_default().entry(a.clone()).or_default() += dt;
                    }
                }
                if let (Some(p), Some(q)) = (prev.pos, g.pos) {
                    let step = ((q[0] - p[0]).powi(2) + (q[2] - p[2]).powi(2)).sqrt();
                    if !g.loading && !prev.loading && !g.event && step <= MAX_STEP {
                        self.totals.distance_units += step;
                    }
                }
            }
        }

        // Area: only trust the map name outside loading screens.
        if !g.loading {
            if let Some(m) = &g.map {
                if self.area.as_ref() != Some(m) {
                    self.area = Some(m.clone());
                    self.totals.areas_visited.insert(m.clone());
                    // The very first sample is a baseline, not an arrival.
                    if self.last.is_some() {
                        self.push(wall_ms, t, Kind::AreaEntered { entered: m.clone() });
                    }
                }
            }
        }

        if let (Some(a), Some(prev)) = (&g.age, self.last.as_ref().and_then(|l| l.age.clone())) {
            if *a != prev {
                self.push(wall_ms, t, Kind::AgeChanged { age: a.clone() });
            }
        }

        self.rupees(wall_ms, g);
        self.life(wall_ms, g);
        self.battle(wall_ms, g);
        self.scene(wall_ms, g);
        self.last = Some(g.clone());
    }

    fn rupees(&mut self, wall_ms: u64, g: &Game) {
        let Some(now) = g.rupees else { return };
        let Some(base) = self.rupee_base else {
            self.rupee_base = Some(now);
            return;
        };
        let last = self.last.as_ref().and_then(|l| l.rupees).unwrap_or(base);
        if now != last {
            self.rupee_changed_t = g.t;
        }
        if now != base && g.t - self.rupee_changed_t >= SETTLE_SECS {
            let d = now - base;
            if d > 0 {
                self.totals.rupees_gained += d;
                self.push(wall_ms, g.t, Kind::RupeesGained { amount: d });
            } else {
                self.totals.rupees_spent += -d;
                self.push(wall_ms, g.t, Kind::RupeesSpent { amount: -d });
            }
            self.rupee_base = Some(now);
        }
    }

    fn life(&mut self, wall_ms: u64, g: &Game) {
        // Max life first, so a heart container is not reported as healing.
        if let (Some(m), Some(pm)) = (g.max_life, self.last.as_ref().and_then(|l| l.max_life)) {
            if m > pm {
                self.push(wall_ms, g.t, Kind::MaxLifeUp { quarters: m - pm });
            }
        }
        let Some(now) = g.life else { return };
        if now == 0 && g.event && !self.dead {
            self.dead = true;
            self.totals.deaths += 1;
            self.push(wall_ms, g.t, Kind::Died);
        } else if now > 0 {
            self.dead = false;
        }
        let Some(base) = self.life_base else {
            self.life_base = Some(now);
            return;
        };
        let last = self.last.as_ref().and_then(|l| l.life).unwrap_or(base);
        // Damage is reported as it happens (hearts drop in one step); healing ticks up, so it settles first.
        if now < last {
            let d = last - now;
            self.totals.damage_quarters += d;
            self.push(wall_ms, g.t, Kind::DamageTaken { quarters: d });
            self.life_base = Some(now);
            self.life_changed_t = g.t;
        } else if now > last {
            self.life_changed_t = g.t;
        }
        if now > base && g.t - self.life_changed_t >= SETTLE_SECS {
            self.push(wall_ms, g.t, Kind::Healed { quarters: now - base });
            self.life_base = Some(now);
        } else if now < base && now == last {
            self.life_base = Some(now);
        }
    }

    fn battle(&mut self, wall_ms: u64, g: &Game) {
        let fighting = g.music.as_deref().is_some_and(|m| BATTLE_MUSIC.contains(&m));
        match (self.battle_since, fighting) {
            (None, true) => {
                self.battle_since = Some(g.t);
                self.battle_last = g.t;
                self.battle_quiet_since = None;
                self.totals.battles += 1;
                self.push(wall_ms, g.t, Kind::BattleStarted);
            }
            (Some(_), true) => {
                self.battle_quiet_since = None;
                self.battle_last = g.t;
            }
            (Some(start), false) => {
                let quiet = *self.battle_quiet_since.get_or_insert(g.t);
                if g.t - quiet >= BATTLE_END_SECS {
                    let secs = (self.battle_last - start).max(0.0);
                    self.totals.battle_secs += secs;
                    self.battle_since = None;
                    self.battle_quiet_since = None;
                    self.push(wall_ms, g.t, Kind::BattleEnded { secs });
                }
            }
            (None, false) => {}
        }
    }

    fn scene(&mut self, wall_ms: u64, g: &Game) {
        match (self.scene_since, g.event && !g.loading) {
            (None, true) => self.scene_since = Some(g.t),
            (Some(start), false) => {
                self.scene_since = None;
                let secs = g.t - start;
                if secs >= 1.0 && !g.loading {
                    self.totals.scenes += 1;
                    self.push(wall_ms, g.t, Kind::Scene { secs });
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn g(t: f64) -> Game {
        Game { t, map: Some("HyruleField_Adult".into()), pos: Some([0.0, 0.0, 0.0]), life: Some(20), max_life: Some(20), rupees: Some(100), ..Default::default() }
    }

    fn kinds(j: &Journal) -> Vec<Kind> {
        j.snapshot().entries.into_iter().rev().map(|e| e.kind).collect()
    }

    #[test]
    fn time_is_split_by_age() {
        let mut j = Journal::new();
        let mut s = g(0.0);
        s.age = Some("child".into());
        j.push_sample(1, &s);
        s.t = 2.0;
        j.push_sample(2, &s);
        s.t = 3.0;
        s.age = Some("adult".into());
        j.push_sample(3, &s);
        let t = j.snapshot().totals;
        assert_eq!(t.by_age_area["child"]["HyruleField_Adult"], 2.0);
        assert_eq!(t.by_age_area["adult"]["HyruleField_Adult"], 1.0);
    }

    #[test]
    fn first_sample_is_a_baseline() {
        let mut j = Journal::new();
        j.push_sample(1, &g(0.0));
        assert!(kinds(&j).is_empty());
        assert!(j.snapshot().totals.areas_visited.contains("HyruleField_Adult"));
    }

    #[test]
    fn map_change_logs_arrival_but_not_during_loading() {
        let mut j = Journal::new();
        j.push_sample(1, &g(0.0));
        let mut a = g(0.1);
        a.map = Some("Market".into());
        a.loading = true;
        j.push_sample(2, &a);
        assert!(kinds(&j).is_empty(), "loading frames do not change the area");
        a.loading = false;
        a.t = 0.2;
        j.push_sample(3, &a);
        assert_eq!(kinds(&j), vec![Kind::AreaEntered { entered: "Market".into() }]);
    }

    #[test]
    fn counting_up_rupees_are_one_entry_after_they_settle() {
        let mut j = Journal::new();
        j.push_sample(1, &g(0.0));
        for (i, r) in [101, 105, 110, 115, 120].into_iter().enumerate() {
            let mut s = g(0.1 * (i as f64 + 1.0));
            s.rupees = Some(r);
            j.push_sample(2, &s);
        }
        assert!(kinds(&j).is_empty(), "still counting");
        let mut s = g(2.0);
        s.rupees = Some(120);
        j.push_sample(3, &s);
        assert_eq!(kinds(&j), vec![Kind::RupeesGained { amount: 20 }]);
        assert_eq!(j.snapshot().totals.rupees_gained, 20);
    }

    #[test]
    fn spending_is_logged_separately() {
        let mut j = Journal::new();
        j.push_sample(1, &g(0.0));
        let mut s = g(0.2);
        s.rupees = Some(70);
        j.push_sample(2, &s);
        let mut s = g(1.5);
        s.rupees = Some(70);
        j.push_sample(3, &s);
        assert_eq!(kinds(&j), vec![Kind::RupeesSpent { amount: 30 }]);
    }

    #[test]
    fn damage_heal_and_death() {
        let mut j = Journal::new();
        j.push_sample(1, &g(0.0));
        let mut s = g(0.5);
        s.life = Some(16);
        j.push_sample(2, &s);
        let mut s = g(0.6);
        s.life = Some(0);
        s.event = true;
        j.push_sample(3, &s);
        let k = kinds(&j);
        assert_eq!(k[0], Kind::DamageTaken { quarters: 4 });
        assert!(k.contains(&Kind::Died));
        assert_eq!(j.snapshot().totals.deaths, 1);
        // staying at 0 does not count a second death
        let mut s = g(0.7);
        s.life = Some(0);
        s.event = true;
        j.push_sample(4, &s);
        assert_eq!(j.snapshot().totals.deaths, 1);
    }

    #[test]
    fn battle_music_makes_a_fight_with_a_duration() {
        let mut j = Journal::new();
        j.push_sample(1, &g(0.0));
        for t in [1.0, 5.0, 10.0] {
            let mut s = g(t);
            s.music = Some("BGM_EnemyBattle".into());
            j.push_sample(2, &s);
        }
        for t in [11.0, 12.0, 15.0] {
            j.push_sample(3, &g(t));
        }
        let k = kinds(&j);
        assert_eq!(k[0], Kind::BattleStarted);
        match &k[1] {
            Kind::BattleEnded { secs } => assert!((secs - 9.0).abs() < 1e-9, "{secs}"),
            o => panic!("{o:?}"),
        }
        assert_eq!(j.snapshot().totals.battles, 1);
    }

    #[test]
    fn short_event_windows_are_ignored_long_ones_are_scenes() {
        let mut j = Journal::new();
        j.push_sample(1, &g(0.0));
        let mut s = g(1.0);
        s.event = true;
        j.push_sample(2, &s);
        j.push_sample(3, &g(1.3));
        assert!(kinds(&j).is_empty());
        let mut s = g(2.0);
        s.event = true;
        j.push_sample(4, &s);
        j.push_sample(5, &g(5.5));
        assert_eq!(kinds(&j), vec![Kind::Scene { secs: 3.5 }]);
    }

    #[test]
    fn distance_ignores_teleports_and_loading() {
        let mut j = Journal::new();
        j.push_sample(1, &g(0.0));
        let mut s = g(0.1);
        s.pos = Some([3.0, 0.0, 4.0]);
        j.push_sample(2, &s);
        let mut s = g(0.2);
        s.pos = Some([500.0, 0.0, 500.0]);
        j.push_sample(3, &s);
        assert!((j.snapshot().totals.distance_units - 5.0).abs() < 1e-9);
    }

    #[test]
    fn game_restart_keeps_the_days_totals() {
        let mut j = Journal::new();
        j.push_sample(1, &g(100.0));
        j.push_sample(2, &g(101.0));
        assert!(j.snapshot().totals.play_secs > 0.9);
        j.push_sample(3, &g(0.5));
        j.push_sample(4, &g(1.5));
        assert!(j.snapshot().totals.play_secs > 1.9, "the new run adds to the day");
    }

    #[test]
    fn a_saved_day_can_be_restored() {
        let mut j = Journal::new();
        j.push_sample(1, &g(0.0));
        let mut a = g(0.2);
        a.map = Some("Market".into());
        j.push_sample(2, &a);
        let text = serde_json::to_string(&j.snapshot()).unwrap();
        let mut back = Journal::from_snapshot(serde_json::from_str(&text).unwrap());
        assert_eq!(back.snapshot().entries, j.snapshot().entries);
        back.push_sample(3, &g(50.0)); // a baseline after the restore, not an arrival or a time jump
        assert_eq!(back.snapshot().entries.len(), 1);
    }

    /// The recorded session replays without panicking and yields plausible totals.
    #[test]
    fn replays_the_recorded_fixture() {
        let fx = oj_testkit::Fixture::session();
        let mut j = Journal::new();
        let mut n = 0;
        for (i, ev) in fx.events.iter().enumerate() {
            if ev["event"] == "oot" {
                let game: Game = serde_json::from_value(ev["game"].clone()).unwrap();
                j.push_sample(1_000 + i as u64, &game);
                n += 1;
            }
        }
        let s = j.snapshot();
        assert!(n > 100, "fixture has samples");
        assert!(s.totals.play_secs > 1.0);
        assert!(!s.totals.areas_visited.is_empty());
    }
}

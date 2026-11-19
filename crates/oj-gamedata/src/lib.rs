//! Names what a Longshot Ocarina of Time save holds, from the player's own game folder (read-only).
//!
//! The save stores only hashes. The game's own files say which flags exist (`GameData`), what things are called
//! (`Mals`), what the maps place (`Banc`) and what the quests are (`RSDB`). From those this crate builds a catalogue
//! of chests, Gold Skulltulas, heart pieces and containers, bosses, the Hall of Fallen Foes, songs and quests, and
//! checks it against a save. The rules follow Longshot's save editor (PR #1655); this is an independent Rust
//! implementation, tested against that tool's output. **Nothing from the game is stored in this repository.**

pub mod files;

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::path::Path;
use std::sync::Arc;

use files::{msbt, GameFiles, Key, Val};
use oj_savefile::{flag_hash, Save};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Game(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Save(#[from] oj_savefile::Error),
}

const KEY_BOOL: &str = "Bool64bitKey";

// ---------------------------------------------------------------------------------------------------------------- text
/// `Weapon_Sword_Master` -> `Weapon Sword Master`; `KakarikoVillage` -> `Kakariko Village`.
pub fn humanize(id: &str) -> String {
    let ch: Vec<char> = id.replace('_', " ").chars().collect();
    let mut out = String::new();
    for (i, c) in ch.iter().enumerate() {
        if i > 0 && c.is_ascii_uppercase() && (ch[i - 1].is_ascii_lowercase() || ch[i - 1].is_ascii_digit()) {
            out.push(' ');
        }
        out.push(*c);
    }
    out.split(' ').filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ")
}

/// A map's area: its name without the age and variant the game adds (`KakarikoVillage_Adult_Alternative`).
pub fn area_of(banc: &str) -> String {
    let s = banc.strip_suffix("_Alternative").unwrap_or(banc);
    s.strip_suffix("_Child").or_else(|| s.strip_suffix("_Adult")).unwrap_or(s).to_string()
}

fn py_round0(v: f64) -> String {
    // Python's "%.0f"; Rust's formatting also rounds ties to even.
    format!("{v:.0}")
}

// ------------------------------------------------------------------------------------------------------------ game data
pub struct GameData {
    pub revision: u32,
    flags: HashMap<u32, (String, Val)>,
}

impl GameData {
    fn load(files: &GameFiles) -> Result<Self, Error> {
        let rel = files.versioned("GameData", "GameDataList.Product.", ".byml.zs")?;
        let doc = files.byml(&rel)?;
        let mut flags = HashMap::new();
        for (tn, list) in doc.get("Data").map(Val::entries).unwrap_or(&[]) {
            let Key::S(tn) = tn else { continue };
            for ent in list.as_arr() {
                if let Some(h) = ent.get("Hash").and_then(Val::int) {
                    flags.insert(h as u32, (tn.clone(), ent.clone()));
                }
            }
        }
        let rev = files.raw(&format!("{}.revision.txt", rel.trim_end_matches(".byml.zs")))?;
        let revision = String::from_utf8_lossy(&rev).trim().parse().unwrap_or(0);
        Ok(Self { revision, flags })
    }
    /// The hash of a flag called `name`, if the game has one.
    pub fn find(&self, name: &str) -> Option<u32> {
        let h = flag_hash(name);
        self.flags.contains_key(&h).then_some(h)
    }
    fn entry(&self, h: u32) -> Option<&Val> {
        self.flags.get(&h).map(|(_, e)| e)
    }
    fn enum_values(&self, h: u32) -> Vec<String> {
        self.entry(h).and_then(|e| e.get("RawValues")).map(|v| v.as_arr().iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
    }
}

struct Names(HashMap<String, String>);

impl Names {
    fn load(files: &GameFiles) -> Self {
        let mut text = HashMap::new();
        for lang in ["USen", "EUen"] {
            if let Ok(rel) = files.versioned("Mals", &format!("{lang}.Product."), ".sarc.zs") {
                if let Ok(members) = files.sarc(&rel) {
                    for (name, data) in members {
                        if name == "ActorMsg/PouchContent.msbt" || name == "ActorMsg/Enemy.msbt" {
                            text.extend(msbt(&data));
                        }
                    }
                }
                break;
            }
        }
        Names(text)
    }
    fn text(&self, id: &str) -> Option<&str> {
        self.0.get(&format!("{id}_Name")).map(String::as_str).filter(|s| !s.is_empty())
    }
    fn of(&self, id: &str) -> String {
        self.text(id).map(String::from).unwrap_or_else(|| humanize(id))
    }
}

struct Actor {
    gyaml: String,
    hash: Option<Val>,
    translate: Vec<f64>,
    dynamic: Val,
    links: Vec<(Option<i128>, Option<i128>)>,
}

struct Placements {
    folder: BTreeMap<String, String>,
}

impl Placements {
    fn scan(files: &GameFiles) -> Result<Self, Error> {
        let mut folder = BTreeMap::new();
        for d in files.list("Banc") {
            for n in files.list(&format!("Banc/{d}")) {
                for kind in ["_Dynamic", "_Static"] {
                    if let Some(b) = n.strip_suffix(&format!("{kind}.bcett.byml.zs")) {
                        folder.insert(b.to_string(), d.clone());
                    }
                }
            }
        }
        if folder.is_empty() {
            return Err(Error::Game("the game folder has no Banc placements".into()));
        }
        Ok(Self { folder })
    }

    fn actors(&self, files: &GameFiles, banc: &str) -> Vec<Actor> {
        let mut out = vec![];
        let Some(dir) = self.folder.get(banc) else { return out };
        for kind in ["Dynamic", "Static"] {
            let rel = format!("Banc/{dir}/{banc}_{kind}.bcett.byml.zs");
            if !files.exists(&rel) {
                continue;
            }
            let Ok(doc) = files.byml(&rel) else { continue };
            for a in doc.get("Actors").map(Val::as_arr).unwrap_or(&[]) {
                out.push(Actor {
                    gyaml: a.get("Gyaml").and_then(Val::as_str).unwrap_or("").to_string(),
                    hash: a.get("Hash").cloned(),
                    translate: a.get("Translate").map(|t| t.as_arr().iter().filter_map(|v| match v { Val::F32(f) => Some(*f as f64), Val::F64(f) => Some(*f), _ => None }).collect()).unwrap_or_default(),
                    dynamic: a.get("Dynamic").cloned().unwrap_or(Val::Null),
                    links: a.get("Links").map(|l| l.as_arr().iter().map(|x| (x.get("Src").and_then(Val::int), x.get("Dst").and_then(Val::int))).collect()).unwrap_or_default(),
                });
            }
        }
        out
    }
}

// ------------------------------------------------------------------------------------------------------------ catalogue
/// `(group, size, IsGet flag)` of every bag, quiver and wallet row: each says what it raises its group's cap to.
type Bags = Arc<Vec<(String, i64, u32)>>;

/// The largest bag Link has in a group (none: 0).
fn limit(bags: &Bags, group: &str, gd: &GameData, sav: &Save) -> i64 {
    bags.iter().filter(|(g, _, get)| g == group && sav.get(*get).filter(|_| gd.flags.contains_key(get)).is_some_and(|w| w != 0)).map(|(_, n, _)| *n).max().unwrap_or(0)
}

#[derive(Debug, Clone)]
enum Kind {
    Flag(Option<u32>),
    Key(i128),
    Count(u32),
    Step(u32, HashSet<u32>, Vec<String>),
    Hearts { flag: u32, of: u32 },
    Rupees { flag: u32, bags: Bags },
    Item { get: u32, stock: Option<u32>, group: Option<String>, fixed: Option<i64>, counted: bool, bags: Bags },
    Keys { held: u32, found: u32, of: u32 },
}

#[derive(Debug, Clone)]
pub struct Entry {
    pub area: String,
    pub ident: String,
    pub label: String,
    pub note: Option<String>,
    kind: Kind,
}

impl Entry {
    pub fn id(&self, cat: &str) -> String {
        [cat, &self.area, &self.ident].iter().filter(|s| !s.is_empty()).copied().collect::<Vec<_>>().join("/")
    }
    /// How many of one the save has, or `None` when the save cannot say.
    fn have(&self, gd: &GameData, sav: &Save) -> Option<u32> {
        let word = |h: u32| sav.get(h).filter(|_| gd.flags.contains_key(&h));
        match &self.kind {
            Kind::Flag(h) => word((*h)?).map(|w| u32::from(w != 0)),
            Kind::Item { get, .. } => word(*get).map(|w| u32::from(w != 0)),
            Kind::Key(k) => Some(u32::from(u64::try_from(*k).is_ok_and(|k| sav.has_key(k)) || sav.has_key(*k as u64))),
            Kind::Count(h) => word(*h).map(|w| u32::from((w as i32) >= 1)),
            Kind::Step(h, done, _) => word(*h).map(|w| u32::from(done.contains(&w))),
            Kind::Hearts { flag, of } => word(*flag).map(|w| (w / 4).min(*of)),
            Kind::Rupees { flag, .. } => word(*flag).map(|w| w.min(self.size(gd, sav))),
            Kind::Keys { found, of, .. } => word(*found).map(|w| (w as i32).max(0).min(*of as i32) as u32),
        }
    }
    /// The counter behind a defeat flag.
    fn count(&self, gd: &GameData, sav: &Save) -> Option<u32> {
        if let Kind::Count(h) = &self.kind {
            return sav.get(*h).filter(|_| gd.flags.contains_key(h)).map(|w| (w as i32).max(0) as u32);
        }
        None
    }

    /// What the entry says about this save: a placement's position, or a quest's current step.
    fn describe(&self, gd: &GameData, sav: &Save) -> Option<String> {
        if let Kind::Item { stock, group, fixed, counted, bags, .. } = &self.kind {
            let n = stock.filter(|h| gd.flags.contains_key(h)).and_then(|h| sav.get(h)).map(|w| w as i32)?;
            if !counted {
                return None;
            }
            let cap = fixed.or_else(|| group.as_deref().map(|g| limit(bags, g, gd, sav)))?;
            return Some(format!("{n} of {cap}"));
        }
        if let Kind::Keys { held, .. } = &self.kind {
            return sav.get(*held).filter(|_| gd.flags.contains_key(held)).map(|w| format!("{} in hand", w as i32));
        }
        if let Kind::Step(h, _, values) = &self.kind {
            let w = sav.get(*h).filter(|_| gd.flags.contains_key(h))?;
            return Some(values.iter().find(|v| flag_hash(v) == w).cloned().unwrap_or_else(|| format!("{w:#x}")));
        }
        self.note.clone()
    }
    fn size(&self, gd: &GameData, sav: &Save) -> u32 {
        match &self.kind {
            Kind::Hearts { of, .. } | Kind::Keys { of, .. } => *of,
            // the largest wallet Link has
            Kind::Rupees { bags, .. } => limit(bags, "Rupee", gd, sav) as u32,
            _ => 1,
        }
    }
}

pub struct Category {
    pub id: &'static str,
    pub title: &'static str,
    pub counted: bool,
    pub entries: Vec<Entry>,
}

const TITLES: &[(&str, &str)] = &[
    ("equipment", "Equipment"), ("items", "Items"), ("masks", "Masks"), ("upgrades", "Upgrades"), ("songs", "Songs"),
    ("quest", "Quest items"), ("hearts", "Hearts"), ("heart-containers", "Heart containers"), ("heart-pieces", "Heart pieces"),
    ("rupees", "Rupees"), ("chests", "Chests opened"), ("skulltulas", "Gold Skulltulas"),
    ("dungeons", "Dungeon maps, compasses and boss keys"), ("small-keys", "Small keys"), ("bosses", "Bosses beaten"),
    ("enemies", "Hall of Fallen Foes (enemies defeated)"), ("story", "Story"), ("side-quests", "Side quests"), ("mini-games", "Mini-games"),
];

/// One Hall rematch record: the game keeps `DreamWorld_TimeTrial.<enemy>` as a struct of three flags.
struct HallSlot {
    id: String,
    label: String,
    have: u32,
    best: u32,
    other: u32,
}

fn hall_slots(gd: &GameData, names: &Names, cats: &[Category]) -> Vec<HallSlot> {
    let member = |n: &str| flag_hash(n);
    let (m_have, m_best) = (member("HaveRecordedTime"), member("BestTimeFrame"));
    let mut out = vec![];
    let mut candidates: Vec<String> = vec![];
    for c in cats {
        for e in &c.entries {
            match c.id {
                "enemies" => candidates.push(e.ident.clone()),
                "bosses" => candidates.push(format!("Enemy_DungeonBoss_{}", e.ident)),
                _ => {}
            }
        }
    }
    for gy in candidates {
        let Some(h) = gd.find(&format!("DreamWorld_TimeTrial.{gy}")) else { continue };
        let members: HashMap<u32, u32> = gd.entry(h).and_then(|e| e.get("DefaultValue")).map(|v| v.as_arr().iter().filter_map(|x| Some((x.get("Hash")?.int()? as u32, x.get("Value")?.int()? as u32))).collect()).unwrap_or_default();
        let (Some(have), Some(best)) = (members.get(&m_have), members.get(&m_best)) else { continue };
        let other = members.iter().find(|(k, _)| **k != m_have && **k != m_best).map(|(_, v)| *v).unwrap_or(0);
        out.push(HallSlot { id: gy.clone(), label: names.of(&gy), have: *have, best: *best, other });
    }
    // the three boss-rush trials
    for (best, have, label) in [
        ("DreamWorld_BossRushBestTime", "DreamBossStage_HaveRecordedTime_BossRush", "Boss rush (full)"),
        ("DreamWorld_BossrushBestTime_01", "DreamBossStage_HaveRecordedTime_BossRush_01", "Boss rush 1"),
        ("DreamWorld_BossrushBestTime_02", "DreamBossStage_HaveRecordedTime_BossRush_02", "Boss rush 2"),
    ] {
        if let (Some(b), Some(h)) = (gd.find(best), gd.find(have)) {
            out.push(HallSlot { id: format!("trial/{best}"), label: label.into(), have: h, best: b, other: 0 });
        }
    }
    out
}

pub struct Game {
    pub files: GameFiles,
    pub data: GameData,
    pub catalogue: Vec<Category>,
    hall: Vec<HallSlot>,
}

impl Game {
    /// Reads the game folder (the folder with `romfs`, or the RomFS folder) and builds the catalogue.
    pub fn open(path: &Path) -> Result<Self, Error> {
        let files = GameFiles::open(path)?;
        let data = GameData::load(&files)?;
        let names = Names::load(&files);
        let place = Placements::scan(&files)?;
        let mut cats: BTreeMap<&str, Vec<Entry>> = BTreeMap::new();
        items(&files, &data, &names, &mut cats);
        placed(&files, &data, &names, &place, &mut cats);
        quests(&files, &data, &mut cats);
        let catalogue: Vec<Category> = TITLES
            .iter()
            .filter_map(|(id, title)| {
                let entries = cats.remove(id).unwrap_or_default();
                (!entries.is_empty()).then(|| Category { id, title, counted: *id != "mini-games", entries })
            })
            .collect();
        let hall = hall_slots(&data, &names, &catalogue);
        Ok(Self { files, data, catalogue, hall })
    }
}

fn rows(files: &GameFiles, table: &str) -> Result<Val, Error> {
    let rel = files.versioned("RSDB", &format!("{table}.Product."), ".rstbl.byml.zs")?;
    files.byml(&rel)
}

/// The pouch: equipment, items, masks, upgrades, songs and quest items, and the rupee wallet.
fn items(files: &GameFiles, gd: &GameData, names: &Names, out: &mut BTreeMap<&str, Vec<Entry>>) {
    let Ok(rows) = rows(files, "PouchActorInfo") else { return };
    const FAMILIES: [(&str, &str); 5] = [("Item_Melody_", "songs"), ("Item_Stone_", "quest"), ("Item_Medal_", "quest"), ("Item_Token_", "quest"), ("Item_AgonyStone", "quest")];
    let mut all: Vec<(String, i64, u32)> = vec![];
    for row in rows.as_arr() {
        let Some(name) = row.get("__RowId").and_then(Val::as_str) else { continue };
        if let (Some(size), Some(group), Some(get)) = (
            row.get("AfterExpansionMaxNum").filter(|v| v.truthy()).and_then(Val::int),
            row.get("MaxNumGameData").filter(|v| v.truthy()).and_then(Val::as_str),
            gd.find(&format!("IsGet.{name}")),
        ) {
            all.push((group.to_string(), size as i64, get));
        }
    }
    let bags: Bags = Arc::new(all);
    for row in rows.as_arr() {
        let Some(name) = row.get("__RowId").and_then(Val::as_str) else { continue };
        if !["Item_", "Weapon_", "Armor_"].iter().any(|p| name.starts_with(p)) || name.starts_with("Item_Dungeon_") || name.starts_with("Pouch_") || name.contains("Bundle") {
            continue;
        }
        let Some(get) = gd.find(&format!("IsGet.{name}")) else { continue };
        let mut stock = gd.find(&format!("PouchData.{name}.StockNum"));
        let family = FAMILIES.iter().find(|(p, _)| name.starts_with(p)).map(|(_, c)| *c);
        let bottle = row.get("PouchSpecialDeal").and_then(Val::as_str) == Some("Bottle") || row.get("BottleItem").is_some_and(Val::truthy);
        if name == "Item_Bottle" && stock.is_none() {
            if let Some(a) = row.get("AssignableItem").filter(|v| v.truthy()).and_then(Val::as_str) {
                stock = gd.find(&format!("PouchData.{a}.StockNum"));
            }
        }
        if stock.is_none() && family.is_none() && !bottle {
            continue;
        }
        if gd.entry(get).and_then(|e| e.get("DefaultValue")).is_some_and(Val::truthy) || name.contains("Amiibo") || name.ends_with("_Base") || name.ends_with("_Normal") {
            continue;
        }
        let cat = family.unwrap_or_else(|| {
            let cat_of = |k: &str| row.get(k).and_then(Val::as_str);
            if row.get("AfterExpansionMaxNum").is_some_and(Val::truthy) || name.contains("Gauntlet") || name.contains("Scale") || name.contains("FairyBless") {
                "upgrades"
            } else if name.contains("_Mask_") {
                "masks"
            } else if matches!(cat_of("PouchCategory"), Some("Weapon" | "Shield" | "Armor" | "Boot")) && cat_of("PouchTabCategory") == Some("Equipment") {
                "equipment"
            } else {
                "items"
            }
        });
        let group = row.get("MaxNumGameData").filter(|v| v.truthy()).and_then(Val::as_str).map(String::from);
        let fixed = row.get("FixedMaxNum").filter(|v| !matches!(v, Val::Null)).and_then(Val::int).map(|v| v as i64);
        let counted = row.get("PouchStockable").is_some_and(Val::truthy) && (group.is_some() || fixed.is_some());
        out.entry(cat).or_default().push(Entry {
            area: String::new(), ident: name.to_string(), label: names.of(name), note: None,
            kind: Kind::Item { get, stock, group, fixed, counted, bags: bags.clone() },
        });
    }
    for list in out.values_mut() {
        list.sort_by_key(|e| e.label.to_lowercase());
    }
    if let Some(rupee) = gd.find("PlayerStatus.CurrentRupee") {
        out.entry("rupees").or_default().push(Entry { area: String::new(), ident: "rupees".into(), label: "Rupees".into(), note: None, kind: Kind::Rupees { flag: rupee, bags: bags.clone() } });
    }
}

fn actor_fields(a: &Actor) -> (String, Option<i128>) {
    let where_ = a.translate.iter().take(3).map(|v| py_round0(*v)).collect::<Vec<_>>().join(", ");
    (where_, a.hash.as_ref().and_then(Val::int))
}

fn placed(files: &GameFiles, gd: &GameData, names: &Names, place: &Placements, out: &mut BTreeMap<&str, Vec<Entry>>) {
    let keyflag: HashSet<i128> = gd.flags.values().filter(|(t, _)| t == KEY_BOOL).filter_map(|(_, e)| e.get("Hash").and_then(Val::int)).collect();
    let mut skull: BTreeMap<i128, (String, String)> = BTreeMap::new();
    let mut skull_order: Vec<i128> = vec![];
    let mut containers: BTreeMap<i128, (String, String)> = BTreeMap::new();
    // anchors: identity string (as Python's repr of the tuple, which is what the editor sorts by) -> (banc, where, ident)
    #[derive(Clone)]
    enum Anchor { Flag(String), Actor(i128), Own(i128) }
    let mut anchors: Vec<(Anchor, String, String)> = vec![];
    let mut chests: BTreeMap<i128, (String, String, String, Option<i64>)> = BTreeMap::new();
    let mut dungeon: BTreeMap<String, [u32; 3]> = BTreeMap::new();
    let mut keys_by: BTreeMap<String, BTreeSet<(u8, String)>> = BTreeMap::new();
    let mut bosses_seen: HashSet<String> = HashSet::new();
    let mut boss_list: Vec<Entry> = vec![];
    let mut bancs: Vec<&String> = place.folder.keys().collect();
    bancs.sort();
    for banc in bancs {
        if place.folder[banc] == "DreamWorld" {
            continue;
        }
        for a in place.actors(files, banc) {
            let (where_, hs) = actor_fields(&a);
            let gy = a.gyaml.as_str();
            let dyn_ = &a.dynamic;
            let drop = dyn_.get("Drop__DropActor").and_then(Val::as_str).unwrap_or("");
            if let (true, Some(h)) = (gy.starts_with("Obj_TBox"), hs) {
                if !chests.contains_key(&h) && gd.find(&format!("IsTreasureBoxOpen.{}", py_int(a.hash.as_ref()))).is_some() {
                    let room = dyn_.get("DefaultDungeonRoomIndex").and_then(Val::int).map(|r| r as i64);
                    chests.insert(h, (banc.clone(), where_.clone(), drop.to_string(), room));
                }
            }
            if let Some(h) = hs {
                if gy == "Enemy_Skulltula_Gold" && keyflag.contains(&h) {
                    if !skull.contains_key(&h) { skull_order.push(h); }
                    skull.entry(h).or_insert((banc.clone(), where_.clone()));
                } else if gy == "Obj_Heart_Container" && keyflag.contains(&h) {
                    containers.entry(h).or_insert((banc.clone(), where_.clone()));
                } else if gy == "HeartPieceAnchor" {
                    let path = dyn_.get("HeartPieceAnchor_GameDataPath").and_then(Val::as_str).filter(|s| !s.is_empty());
                    let refd = a.links.iter().find(|(src, _)| *src == Some(h)).and_then(|(_, dst)| *dst);
                    let ident = match (path, refd) {
                        (Some(p), _) => Anchor::Flag(p.to_string()),
                        (None, Some(r)) => Anchor::Actor(r),
                        (None, None) => Anchor::Own(h),
                    };
                    let repr = |x: &Anchor| match x {
                        Anchor::Flag(p) => format!("('flag', '{p}')"),
                        Anchor::Actor(r) => format!("('actor', {r})"),
                        Anchor::Own(r) => format!("('anchor', {r})"),
                    };
                    if !anchors.iter().any(|(x, _, _)| repr(x) == repr(&ident)) {
                        anchors.push((ident, banc.clone(), where_.clone()));
                    }
                }
            }
            // what each dungeon places: maps, compasses, boss keys and small keys
            let dname = area_of(banc);
            for (i, what) in ["Map", "Compass", "BossKey"].iter().enumerate() {
                if drop == format!("Item_Dungeon_{what}") {
                    dungeon.entry(dname.clone()).or_default()[i] += 1;
                }
            }
            if drop == "Item_Dungeon_SmallKey" || gy == "Obj_Dungeon_SmallKey" {
                keys_by.entry(dname.clone()).or_default().insert((0, py_int(a.hash.as_ref())));
            }
            for source in [gy, drop] {
                if let Some(n) = source.strip_prefix("Obj_Dungeon_SmallKey_").filter(|n| !n.is_empty()) {
                    keys_by.entry(dname.clone()).or_default().insert((1, n.to_string()));
                }
            }
            if let Some(g) = gy.strip_prefix("Enemy_DungeonBoss_") {
                if !g.is_empty() && g.bytes().all(|c| c.is_ascii_alphabetic()) && g != "Koume" && g != "Kotake" && !bosses_seen.contains(g) {
                    if let Some(flag) = gd.find(&format!("DefeatedEnemyNum.{gy}")) {
                        bosses_seen.insert(g.to_string());
                        boss_list.push(Entry { area: area_of(banc), ident: g.to_string(), label: names.of(gy), note: None, kind: Kind::Count(flag) });
                    }
                }
            }
        }
    }

    // Gold Skulltulas
    let mut by_area: BTreeMap<String, Vec<(i128, String)>> = BTreeMap::new();
    for h in &skull_order {
        let (banc, w) = &skull[h];
        by_area.entry(area_of(banc)).or_default().push((*h, w.clone()));
    }
    let list = out.entry("skulltulas").or_default();
    for (area, mut v) in by_area {
        v.sort_by(|a, b| a.1.cmp(&b.1));
        for (i, (h, w)) in v.into_iter().enumerate() {
            list.push(Entry { area: area.clone(), ident: (i + 1).to_string(), label: format!("Gold Skulltula {} in {} (at {w})", i + 1, humanize(&area)), note: Some(w), kind: Kind::Key(h) });
        }
    }

    // hearts
    let life = gd.find("PlayerStatus.MaxLife");
    let start = life.and_then(|l| gd.entry(l)).and_then(|e| e.get("DefaultValue")).and_then(Val::int).unwrap_or(0) as u32 / 4;
    let max = start + containers.len() as u32 + anchors.len() as u32 / 4;
    if let Some(l) = life {
        out.entry("hearts").or_default().push(Entry { area: String::new(), ident: "hearts".into(), label: "Hearts".into(), note: None, kind: Kind::Hearts { flag: l, of: max } });
    }
    let mut cs: Vec<_> = containers.iter().collect();
    cs.sort_by(|a, b| (area_of(&a.1 .0), &a.1 .1).cmp(&(area_of(&b.1 .0), &b.1 .1)));
    for (i, (h, (banc, w))) in cs.into_iter().enumerate() {
        out.entry("heart-containers").or_default().push(Entry {
            area: area_of(banc), ident: (i + 1).to_string(), label: format!("Heart container in {}", humanize(&area_of(banc))), note: Some(w.clone()), kind: Kind::Key(*h),
        });
    }

    // heart pieces
    let mut by_area: BTreeMap<String, Vec<(String, Anchor, String)>> = BTreeMap::new();
    for (ident, banc, w) in &anchors {
        let repr = match ident { Anchor::Flag(p) => format!("('flag', '{p}')"), Anchor::Actor(r) => format!("('actor', {r})"), Anchor::Own(r) => format!("('anchor', {r})") };
        by_area.entry(area_of(banc)).or_default().push((repr, ident.clone(), w.clone()));
    }
    for (area, mut v) in by_area {
        v.sort_by(|a, b| a.0.cmp(&b.0));
        for (i, (_, ident, w)) in v.into_iter().enumerate() {
            let n = i + 1;
            let label = format!("Heart piece {n} in {}", humanize(&area));
            let e = match &ident {
                Anchor::Flag(p) if gd.find(p).is_some() => Some(Entry { area: area.clone(), ident: n.to_string(), label: format!("{label} ({})", humanize(p)), note: None, kind: Kind::Flag(gd.find(p)) }),
                Anchor::Actor(r) if gd.find(&format!("IsTreasureBoxOpen.{r}")).is_some() => Some(Entry { area: area.clone(), ident: n.to_string(), label: format!("{label} (in a chest)"), note: Some(w.clone()), kind: Kind::Flag(gd.find(&format!("IsTreasureBoxOpen.{r}"))) }),
                Anchor::Actor(r) if keyflag.contains(r) => Some(Entry { area: area.clone(), ident: n.to_string(), label, note: Some(w.clone()), kind: Kind::Key(*r) }),
                _ => None,
            };
            if let Some(e) = e {
                out.entry("heart-pieces").or_default().push(e);
            }
        }
    }

    // chests
    let mut by_area: BTreeMap<String, Vec<(i64, String, i128, String)>> = BTreeMap::new();
    for (h, (banc, w, drop, room)) in &chests {
        by_area.entry(area_of(banc)).or_default().push((room.unwrap_or(-1), w.clone(), *h, drop.clone()));
    }
    for (area, mut v) in by_area {
        v.sort();
        for (i, (room, w, h, drop)) in v.into_iter().enumerate() {
            let content = if drop.is_empty() {
                "empty".to_string()
            } else {
                names.text(&drop).map(String::from).unwrap_or_else(|| humanize(drop.strip_prefix("TBox_").or_else(|| drop.strip_prefix("Item_")).unwrap_or(&drop)))
            };
            out.entry("chests").or_default().push(Entry {
                area: area.clone(), ident: (i + 1).to_string(), label: format!("Chest {} in {} ({content})", i + 1, humanize(&area)),
                note: Some(format!("room {room} at {w}")), kind: Kind::Flag(gd.find(&format!("IsTreasureBoxOpen.{h}"))),
            });
        }
    }

    // dungeons: each dungeon's struct names the flags of its map, compass, boss key and keys
    let member = |n: &str| flag_hash(n);
    let (m_map, m_compass, m_boss, m_keys, m_total) = (member("IsGetMap"), member("IsGetCompass"), member("IsGetBossKey"), member("SmallKeyNum"), member("SmallKeyTotalNum"));
    let dnames: HashMap<u32, String> = place.folder.keys().map(|b| (flag_hash(&format!("DungeonInfo.{}", area_of(b))), area_of(b))).collect();
    let mut structs: Vec<(u32, HashMap<u32, u32>)> = gd.flags.iter().filter(|(_, (t, _))| t == "Struct").filter_map(|(h, (_, e))| {
        let m: HashMap<u32, u32> = e.get("DefaultValue")?.as_arr().iter().filter_map(|x| Some((x.get("Hash")?.int()? as u32, x.get("Value")?.int()? as u32))).collect();
        m.contains_key(&m_map).then_some((*h, m))
    }).collect();
    structs.sort_by_key(|(h, _)| dnames.get(h).cloned().unwrap_or_else(|| format!("~{h:08x}")));
    for (h, members) in structs {
        let name = dnames.get(&h).cloned().unwrap_or_else(|| format!("Dungeon {h:08x}"));
        for (i, (key, what, ident)) in [(m_map, "map", "map"), (m_compass, "compass", "compass"), (m_boss, "boss key", "bosskey")].into_iter().enumerate() {
            if dungeon.get(&name).is_some_and(|d| d[i] > 0) {
                if let Some(flag) = members.get(&key) {
                    out.entry("dungeons").or_default().push(Entry { area: name.clone(), ident: ident.into(), label: format!("{}: {what}", humanize(&name)), note: None, kind: Kind::Flag(Some(*flag)) });
                }
            }
        }
        let total = keys_by.get(&name).map_or(0, BTreeSet::len);
        if let (true, Some(held), Some(found)) = (total > 0, members.get(&m_keys), members.get(&m_total)) {
            out.entry("small-keys").or_default().push(Entry { area: name.clone(), ident: "keys".into(), label: format!("{}: small keys", humanize(&name)), note: None, kind: Kind::Keys { held: *held, found: *found, of: total as u32 } });
        }
    }

    // bosses (companions are only used for editing; reading needs none)
    boss_list.sort_by(|a, b| (&a.area, &a.ident).cmp(&(&b.area, &b.ident)));
    out.entry("bosses").or_default().extend(boss_list);

    // the Hall of Fallen Foes
    let mut done = BTreeSet::new();
    let list = out.entry("enemies").or_default();
    for a in place.actors(files, "EnemyMuseum") {
        let gy = a.gyaml.as_str();
        if let Some(base) = gy.strip_suffix("_Dictionary") {
            if !gy.starts_with("Enemy_DungeonBoss") && done.insert(base.to_string()) {
                if let Some(flag) = gd.find(&format!("DefeatedEnemyNum.{base}")) {
                    list.push(Entry { area: String::new(), ident: base.to_string(), label: names.of(base), note: None, kind: Kind::Count(flag) });
                }
            }
        }
    }
    list.sort_by_key(|e| e.label.to_lowercase());
}

fn py_int(v: Option<&Val>) -> String {
    v.and_then(Val::int).map(|i| i.to_string()).unwrap_or_default()
}

fn quests(files: &GameFiles, gd: &GameData, out: &mut BTreeMap<&str, Vec<Entry>>) {
    let Ok(rows) = rows(files, "Challenge") else { return };
    let (main, sub) = (flag_hash("Main") as i128, flag_hash("Sub") as i128);
    for row in rows.as_arr() {
        let Some(id) = row.get("__RowId").and_then(Val::as_str) else { continue };
        let name = id.rsplit('/').next().unwrap_or(id).split('.').next().unwrap_or(id);
        let Some(flag) = gd.find(&format!("Step_{name}")) else { continue };
        let values = gd.enum_values(flag);
        if values.is_empty() {
            continue;
        }
        let kind = match row.get("Category").and_then(Val::int) {
            Some(c) if c == main => "story",
            Some(c) if c == sub => "side-quests",
            _ => "mini-games",
        };
        let final_ = row.get("Steps").and_then(|s| s.as_arr().last()).and_then(|s| s.get("Name")).and_then(Val::as_str).unwrap_or("").to_string();
        let done: HashSet<u32> = values.iter().filter(|v| *v == "Complete" || **v == final_).map(|v| flag_hash(v)).collect();
        let stripped = ["SubEvent_", "Minigame_", "MiniGame_"].iter().find_map(|p| name.strip_prefix(p)).unwrap_or(name);
        out.entry(kind).or_default().push(Entry { area: String::new(), ident: name.to_string(), label: humanize(stripped), note: None, kind: Kind::Step(flag, done, values.clone()) });
    }
    for k in ["story", "side-quests", "mini-games"] {
        if let Some(l) = out.get_mut(k) {
            l.sort_by(|a, b| a.ident.cmp(&b.ident));
        }
    }
}

// --------------------------------------------------------------------------------------------------------------- report
#[derive(Debug, Serialize)]
pub struct RepEntry {
    pub id: String,
    pub label: String,
    pub area: String,
    pub have: u32,
    pub of: u32,
    pub note: Option<String>,
    /// How many times it was defeated (enemies and bosses only): the game's `DefeatedEnemyNum` counter.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct RepCategory {
    pub id: String,
    pub title: String,
    pub counted: bool,
    pub have: u32,
    pub of: u32,
    pub entries: Vec<RepEntry>,
}

#[derive(Debug, Serialize)]
pub struct RepSlot {
    pub slot: String,
    pub number: u32,
    pub place: Option<serde_json::Value>,
    pub age: Option<String>,
    pub hearts: Option<f64>,
    pub rupees: Option<u32>,
    pub clock: Option<String>,
    pub saved: Option<String>,
    pub totals: BTreeMap<String, [u32; 2]>,
}

/// A rematch record as stored. `best_frames` is the game's `BestTimeFrame` float, **unit unverified**: the name says
/// frames, but no save on hand held a record to check against.
#[derive(Debug, Serialize)]
pub struct RepHall {
    pub id: String,
    pub label: String,
    pub recorded: bool,
    pub best_frames: Option<f32>,
    pub other: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct Report {
    pub schema: u32,
    pub generator: String,
    pub game_revision: u32,
    pub slot: String,
    pub slots: Vec<RepSlot>,
    pub categories: Vec<RepCategory>,
    pub hall: Vec<RepHall>,
}

impl Game {
    /// What a slot is: where Link is, hearts, rupees, the day and time in the game, when it was saved.
    fn slot_info(&self, n: u32, sav: &Save, caption: Option<&Save>) -> RepSlot {
        let flag = |name: &str| self.data.find(name);
        let banc = flag("Sequence_CurrentBanc").and_then(|h| sav.get_string(h, 64)).unwrap_or_default();
        let age = flag("Sequence_IsChildhood").map(|h| if sav.get(h).is_none_or(|w| w != 0) { "child" } else { "adult" }.to_string());
        let clock = sav.get_u64(0xEF10_B80F).map(|c| format!("day {} {:02}:{:02}", c >> 32, (c & 0xFFFF_FFFF) / 3600, (c & 0xFFFF_FFFF) % 3600 / 60));
        let saved = caption.and_then(|c| {
            let v: Option<Vec<u32>> = ["Year", "Month", "Day", "Hour", "Minute", "Second"].iter().map(|k| c.get(flag_hash(&format!("CaptionData.Date.{k}")))).collect();
            let v = v?;
            (v[0] != 0).then(|| format!("{:04}-{:02}-{:02} {:02}:{:02}", v[0], v[1], v[2], v[3], v[4]))
        });
        RepSlot {
            slot: format!("slot_{n:02}"), number: n,
            place: Some(serde_json::json!({ "area": banc, "name": if banc.is_empty() { None } else { Some(humanize(&area_of(&banc))) } })),
            age, hearts: Some(sav.get(flag_hash("PlayerStatus.MaxLife")).unwrap_or(0) as f64 / 4.0),
            rupees: Some(sav.get(flag_hash("PlayerStatus.CurrentRupee")).unwrap_or(0)), clock, saved, totals: self.totals(sav),
        }
    }

    /// Totals for one slot's save: `{category: [have, of]}`.
    pub fn totals(&self, sav: &Save) -> BTreeMap<String, [u32; 2]> {
        self.catalogue.iter().map(|c| {
            let (mut h, mut o) = (0, 0);
            for e in &c.entries {
                if let Some(x) = e.have(&self.data, sav) { h += x; o += e.size(&self.data, sav); }
            }
            (c.id.to_string(), [h, o])
        }).collect()
    }

    /// The report the app shows: every entry for `detail` (a slot number), and totals for every slot in `user_dir`.
    pub fn report(&self, user_dir: &Path, detail: Option<u32>) -> Result<Report, Error> {
        let mut slots = vec![];
        let mut saves: BTreeMap<u32, (Save, std::time::SystemTime)> = BTreeMap::new();
        let mut captions: BTreeMap<u32, Save> = BTreeMap::new();
        for e in std::fs::read_dir(user_dir)?.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let Some(n) = name.strip_prefix("slot_").and_then(|n| n.parse::<u32>().ok()) else { continue };
            let file = e.path().join("progress.sav");
            let Ok(sav) = Save::read(&file) else { continue };
            let mt = std::fs::metadata(&file).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
            if let Ok(c) = Save::read(&e.path().join("caption.sav")) {
                captions.insert(n, c);
            }
            saves.insert(n, (sav, mt));
        }
        let newest = saves.iter().max_by_key(|(_, (_, mt))| *mt).map(|(n, _)| *n);
        let pick = detail.filter(|d| saves.contains_key(d)).or(newest).ok_or_else(|| Error::Game("no save slot found".into()))?;
        for (n, (sav, _)) in &saves {
            slots.push(self.slot_info(*n, sav, captions.get(n)));
        }
        let sav = &saves[&pick].0;
        let categories = self.catalogue.iter().map(|c| {
            let entries: Vec<RepEntry> = c.entries.iter().filter_map(|e| {
                e.have(&self.data, sav).map(|h| RepEntry { id: e.id(c.id), label: e.label.clone(), area: e.area.clone(), have: h, of: e.size(&self.data, sav), note: e.describe(&self.data, sav), count: e.count(&self.data, sav) })
            }).collect();
            RepCategory { id: c.id.into(), title: c.title.into(), counted: c.counted, have: entries.iter().map(|e| e.have).sum(), of: entries.iter().map(|e| e.of).sum(), entries }
        }).collect();
        let hall = self.hall.iter().map(|h| {
            let w = |f: u32| sav.get(f).filter(|_| self.data.flags.contains_key(&f));
            RepHall { id: h.id.clone(), label: h.label.clone(), recorded: w(h.have).is_some_and(|v| v != 0), best_frames: w(h.best).map(f32::from_bits), other: w(h.other).map(f32::from_bits) }
        }).collect();
        Ok(Report { hall, schema: 1, generator: "oj-gamedata".into(), game_revision: self.data.revision, slot: format!("slot_{pick:02}"), slots, categories })
    }
}

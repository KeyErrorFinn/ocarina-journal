//! The game's own maps, read from the player's game folder: which picture each place uses, where a world position
//! falls on it, the floors of each dungeon, the exits, and where each place's name sits on the world map.
//! Pictures are decoded on demand and only kept on the player's PC; none ship with the app.
//!
//! Sources, all in the RomFS, and how each was checked (2026-11-20, v3.0.0-rc.5 files):
//! - `Game/MapMenuInfo` lists the places in a fixed order with their picture names (child, adult).
//! - `Game/MapCaptureInfo` has one entry per place **in the same order** (every placed chest, Skulltula and heart of
//!   each area falls inside its entry's rectangle). `CameraPos` X/Z is the picture's centre and `Height` the metres
//!   across the picture's **width** (+X to the right, +Z down). Checked against landmarks (Kokiri Forest: the Deku
//!   Tree and the exits; Hyrule Field and Gerudo Valley: the exits) and, for dungeons, against the game's own chest
//!   positions in `MapParam`, which land exactly on the chests.
//! - `Banc/BancBasedResource/MapParam` has each dungeon's floors (`TransY`, lowest first, numbered from `MinFloor`:
//!   B2, B1, 1F, 2F...) and each field map's exits (`EntranceAnchor`).
//! - The world map is `MapTexWorldAll_00` in `UI/Layout2Archive/Common...bntx`; the place names' positions are the
//!   panes of `PaMapWorld_00` (the layout's pane table as read by Longshot's `nx2/prompt_assets.py`).

use std::collections::BTreeMap;

use serde::Serialize;

use crate::files::{GameFiles, Val};
use crate::tex::{bntx_textures, decode, Image};
use crate::Error;

const COMMON_BNTX: &str = "UI/Layout2Archive/Common.Product.100.Nin_Ounce_NVN2.bntx.zs";
const COMMON_BLARC: &str = "UI/Layout2Archive/Common.Product.100.Nin_Ounce_NVN2.blarc.zs";
const WORLD_TEXTURE: &str = "MapTexWorldAll_00";
const WORLD_LAYOUT: &str = "PaMapWorld_00.buil";

/// World-map panes and the place each one names. The pane names are the game's; matching them to places is ours
/// (each is the place's name or an obvious short form).
const WORLD_PANES: &[(&str, &str)] = &[
    ("Pa_DekuTree_00", "InsideTheDekuTree"),
    ("Pa_Dodongo_00", "DodongoCavern"),
    ("Pa_Jabujabu_00", "InsideJabuJabuBelly"),
    ("Pa_IceCavern_00", "IceCavern"),
    ("Pa_Well_00", "BottomOfTheWell"),
    ("Pa_Forest_00", "ForestTemple"),
    ("Pa_Fire_00", "FireTemple"),
    ("Pa_Water_00", "WaterTemple"),
    ("Pa_Shadow_00", "ShadowTemple"),
    ("Pa_Spirit_00", "SpiritTemple"),
    ("Pa_Castle_00", "HyruleCastle"),
    ("Pa_LostWood_00", "LostWood"),
    ("Pa_Meadow_00", "SacredForestMeadow"),
    ("Pa_KokiriForest_00", "KokiriForest"),
    ("Pa_Lake_00", "LakeHylia"),
    ("Pa_Crater_00", "DeathMountainCrater"),
    ("Pa_Trail_00", "DeathMountainTrail"),
    ("Pa_GoronCity_00", "GoronCity"),
    ("Pa_Market_00", "Market"),
    ("Pa_Grave_00", "Graveyard"),
    ("Pa_Village_00", "KakarikoVillage"),
    ("Pa_Field_00", "HyruleField"),
    ("Pa_LonLon_00", "LonLonRanch"),
    ("Pa_River_00", "ZoraRiver"),
    ("Pa_ZoraDomain_00", "ZoraDomain"),
    ("Pa_Fountain_00", "ZoraFountain"),
    ("Pa_Valley_00", "GerudoValley"),
    ("Pa_Fortress_00", "GerudoFortress"),
    ("Pa_Colossus_00", "DesertColossus"),
    ("Pa_Desert_00", "HountedWasteland"),
];

/// Size of the coarse "is this drawn" grid sent for places that share another place's Banc (Lake Hylia, Lon Lon Ranch).
const MASK_W: u32 = 100;

#[derive(Debug, Clone, Serialize)]
pub struct MapIndex {
    pub world: World,
    pub places: BTreeMap<String, Place>,
}

#[derive(Debug, Clone, Serialize)]
pub struct World {
    /// Image name for [`map_image`].
    pub image: String,
    /// The layout's size of the world map (its own units; the picture fills it).
    pub width: f32,
    pub height: f32,
    /// Place -> name-banner position in layout units, origin at the centre, +y up.
    pub labels: BTreeMap<String, [f32; 2]>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Place {
    /// Picture centre (world X, Z) and metres across the picture's width.
    pub center: [f32; 2],
    pub span: f32,
    pub dungeon: bool,
    /// Field maps: the picture per age. Dungeons: empty; see `floors`.
    pub child: Option<Era>,
    pub adult: Option<Era>,
    pub floors: Vec<Floor>,
    /// The Banc a place's things are placed in when it has none of its own (Lake Hylia, Lon Lon Ranch: Hyrule Field).
    pub within: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Era {
    pub image: String,
    pub exits: Vec<Exit>,
    /// Only for places with `within`: a `MASK_W`-wide grid, row-major, '1' where the picture is drawn.
    pub mask: Option<Mask>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Mask {
    pub width: u32,
    pub height: u32,
    pub bits: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Floor {
    /// "B2", "1F", ...
    pub name: String,
    /// The floor's base height (metres); a thing is on the highest floor at or below it (plus a small margin).
    pub y: f32,
    pub image: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Exit {
    pub to: String,
    pub x: f32,
    pub z: f32,
}

fn num(v: Option<&Val>) -> Option<f32> {
    match v? {
        Val::F32(f) => Some(*f),
        Val::F64(f) => Some(*f as f32),
        o => o.int().map(|i| i as f32),
    }
}

fn floor_name(n: i64) -> String {
    if n < 0 { format!("B{}", -n) } else { format!("{}F", n + 1) }
}

fn field_texture(files: &GameFiles, name: &str) -> Option<String> {
    (!name.is_empty() && files.exists(&format!("UI/CustomTex/Map/Field/{name}.bntx.zs"))).then(|| name.to_string())
}

/// The dungeon floor's main picture: `<D>_<F>_Main`, or the first state's (`_State00_Main`), or, in the Water Temple,
/// the first water level's (`_Lv1_...`). Which level the game shows when is not read here (unverified).
fn floor_texture(files: &GameFiles, dungeon: &str, floor: &str) -> Option<String> {
    ["Main", "State00_Main", "Lv1_Main", "Lv1_State00_Main"]
        .map(|v| format!("{dungeon}_{floor}_{v}"))
        .into_iter()
        .find(|n| files.exists(&format!("UI/CustomTex/Map/Dungeon/{n}.bntx.zs")))
}

fn exits(param: Option<&Val>) -> Vec<Exit> {
    param
        .and_then(|p| p.get("EntranceAnchor"))
        .map(|a| a.as_arr())
        .unwrap_or_default()
        .iter()
        .filter(|e| e.get("IsVisible").is_none_or(|v| v.truthy()))
        .filter_map(|e| {
            let t = e.get("Trans")?.as_arr();
            Some(Exit { to: e.get("Location")?.as_str()?.to_string(), x: num(t.first())?, z: num(t.get(2))? })
        })
        .collect()
}

/// The pane table of a BFFH layout: name -> (x, y). Offsets as documented in Longshot's `nx2/prompt_assets.py`.
fn layout_panes(lay: &[u8]) -> BTreeMap<String, [f32; 2]> {
    let u64_at = |o: usize| lay.get(o..o + 8).map(|b| u64::from_le_bytes(b.try_into().unwrap()) as usize);
    let f32_at = |o: usize| lay.get(o..o + 4).map(|b| f32::from_le_bytes(b.try_into().unwrap()));
    let mut out = BTreeMap::new();
    let (Some(names), Some(recs), Some(n)) = (u64_at(0x118), u64_at(0x120), lay.get(0x130..0x134)) else { return out };
    let n = u32::from_le_bytes(n.try_into().unwrap()) as usize;
    for k in 0..n.min(4096) {
        let (Some(name_at), Some(rec)) = (u64_at(names + 8 * k), u64_at(recs + 8 * k)) else { break };
        let Some(end) = lay.get(name_at..).and_then(|s| s.iter().position(|&c| c == 0)) else { break };
        let name = String::from_utf8_lossy(&lay[name_at..name_at + end]).into_owned();
        if let (Some(x), Some(y)) = (f32_at(rec + 0x1c), f32_at(rec + 0x20)) {
            out.insert(name, [x, y]);
        }
    }
    out
}

fn mask_of(img: &Image) -> Mask {
    let h = (MASK_W * img.height).div_ceil(img.width);
    let mut bits = String::with_capacity((MASK_W * h) as usize);
    for gy in 0..h {
        for gx in 0..MASK_W {
            let x = ((gx as f32 + 0.5) * img.width as f32 / MASK_W as f32) as usize;
            let y = ((gy as f32 + 0.5) * img.height as f32 / h as f32) as usize;
            let a = img.rgba.get((y.min(img.height as usize - 1) * img.width as usize + x.min(img.width as usize - 1)) * 4 + 3).copied().unwrap_or(0);
            bits.push(if a > 64 { '1' } else { '0' });
        }
    }
    Mask { width: MASK_W, height: h, bits }
}

/// Reads the map index from the game files. Cheap except for the two masks (a few hundred ms in release builds).
pub fn map_index(files: &GameFiles) -> Result<MapIndex, Error> {
    let menu = files.byml("Game/MapMenuInfo/MapMenuInfo.game__ui__MapMenuInfo.bgyml")?;
    let capture = files.byml("Game/MapCaptureInfo/MapCaptureInfo.game__MapCaptureInfo.bgyml")?;
    let param = files.byml("Banc/BancBasedResource/MapParam.byml.zs")?;
    let menu = menu.get("MapMenuParamArray").map(|a| a.as_arr()).unwrap_or_default();
    let capture = capture.get("MapCaptureParamArray").map(|a| a.as_arr()).unwrap_or_default();
    let has_banc = |place: &str| files.list("Banc").iter().any(|d| d == place);

    let mut places = BTreeMap::new();
    for (i, m) in menu.iter().enumerate() {
        let Some(id) = m.get("LocationName").and_then(Val::as_str) else { continue };
        let Some(cap) = capture.get(i) else { continue };
        let (Some(cx), Some(cz), Some(span)) = (
            num(cap.get("CameraPos").and_then(|p| p.get("X"))),
            num(cap.get("CameraPos").and_then(|p| p.get("Z"))),
            num(cap.get("Height")),
        ) else {
            continue;
        };
        let tex: Vec<&str> = m.get("TextureName").map(|t| t.as_arr().iter().filter_map(Val::as_str).collect()).unwrap_or_default();
        let dungeon_param = param.get(id).filter(|p| p.get("Floor").is_some());
        let mut place = Place { center: [cx, cz], span, dungeon: dungeon_param.is_some(), child: None, adult: None, floors: vec![], within: None };
        if let Some(p) = dungeon_param {
            let min = p.get("MinFloor").and_then(Val::int).unwrap_or(0) as i64;
            for (k, f) in p.get("Floor").map(|f| f.as_arr()).unwrap_or_default().iter().enumerate() {
                let name = floor_name(min + k as i64);
                let image = floor_texture(files, id, &name).map(|_| format!("floor/{id}/{name}"));
                place.floors.push(Floor { name, y: num(f.get("TransY")).unwrap_or(0.0), image });
            }
        } else {
            if !has_banc(id) {
                place.within = Some("HyruleField".into()).filter(|_| has_banc("HyruleField") && id != "HyruleField");
            }
            for (age, slot) in [("Child", 0usize), ("Adult", 1)] {
                let Some(t) = tex.get(slot).and_then(|t| field_texture(files, t)) else { continue };
                let banc = m.get("BancName").and_then(|b| b.as_arr().get(slot)).and_then(Val::as_str).unwrap_or("");
                let p = param.get(banc).or_else(|| param.get(&format!("{id}_{age}")));
                let mask = match place.within {
                    Some(_) => Some(mask_of(&decode_named(files, &format!("UI/CustomTex/Map/Field/{t}.bntx.zs"), None)?)),
                    None => None,
                };
                let era = Era { image: format!("field/{t}"), exits: exits(p), mask };
                if slot == 0 { place.child = Some(era) } else { place.adult = Some(era) }
            }
        }
        places.insert(id.to_string(), place);
    }

    let panes = files
        .sarc(COMMON_BLARC)
        .ok()
        .and_then(|f| f.into_iter().find(|(n, _)| n == WORLD_LAYOUT))
        .map(|(_, d)| layout_panes(&d))
        .unwrap_or_default();
    let labels = WORLD_PANES.iter().filter_map(|(pane, place)| Some((place.to_string(), *panes.get(*pane)?))).collect();
    // (the world picture's pane, P_WorldMap_00: its size is at its record's +0x2c)
    let (width, height) = world_size(files).ok_or_else(|| Error::Game("the world map layout was not found".into()))?;
    Ok(MapIndex { world: World { image: "world".into(), width, height, labels }, places })
}

fn world_size(files: &GameFiles) -> Option<(f32, f32)> {
    let (_, lay) = files.sarc(COMMON_BLARC).ok()?.into_iter().find(|(n, _)| n == WORLD_LAYOUT)?;
    let u64_at = |o: usize| lay.get(o..o + 8).map(|b| u64::from_le_bytes(b.try_into().unwrap()) as usize);
    let (names, recs) = (u64_at(0x118)?, u64_at(0x120)?);
    let n = u32::from_le_bytes(lay.get(0x130..0x134)?.try_into().ok()?) as usize;
    for k in 0..n.min(4096) {
        let name_at = u64_at(names + 8 * k)?;
        let end = lay.get(name_at..)?.iter().position(|&c| c == 0)?;
        if &lay[name_at..name_at + end] == b"P_WorldMap_00" {
            let rec = u64_at(recs + 8 * k)?;
            let f = |o: usize| Some(f32::from_le_bytes(lay.get(rec + o..rec + o + 4)?.try_into().ok()?));
            return Some((f(0x2c)?, f(0x30)?));
        }
    }
    None
}

fn decode_named(files: &GameFiles, rel: &str, name: Option<&str>) -> Result<Image, Error> {
    let d = files.load(rel)?;
    let all = bntx_textures(&d)?;
    let t = match name {
        Some(n) => all.iter().find(|t| t.name == n),
        None => all.first(),
    }
    .ok_or_else(|| Error::Game(format!("{rel} has no texture {}", name.unwrap_or("at all"))))?;
    decode(&d, t)
}

/// Pictures served as JPEG (see `map_file`).
pub fn is_painting(name: &str) -> bool {
    name == "world" || name.starts_with("tapestry/")
}

fn safe(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
}

/// Draws `top` over `base` (both RGBA, same size), scaling `base`'s alpha by `fade`.
fn over(base: &mut Image, top: &Image, fade: f32) {
    if base.width != top.width || base.height != top.height {
        *base = top.clone();
        return;
    }
    for (b, t) in base.rgba.chunks_exact_mut(4).zip(top.rgba.chunks_exact(4)) {
        let ba = b[3] as f32 / 255.0 * fade;
        let ta = t[3] as f32 / 255.0;
        let a = ta + ba * (1.0 - ta);
        for c in 0..3 {
            b[c] = if a > 0.0 { ((t[c] as f32 * ta + b[c] as f32 * ba * (1.0 - ta)) / a).round() as u8 } else { 0 };
        }
        b[3] = (a * 255.0).round() as u8;
    }
}

/// A map picture by its index name: `world`, `field/<texture>`, `floor/<dungeon>/<floor>`, or a picture of the
/// Threads of Time tapestry, `tapestry/<base|shadow|woven>`. Returns RGBA.
/// Names are checked to be plain identifiers, so this only ever reads the game's own map files.
pub fn map_image(files: &GameFiles, name: &str) -> Result<Image, Error> {
    let parts: Vec<&str> = name.split('/').collect();
    match parts.as_slice() {
        ["world"] => decode_named(files, COMMON_BNTX, Some(WORLD_TEXTURE)),
        ["field", t] if safe(t) => decode_named(files, &format!("UI/CustomTex/Map/Field/{t}.bntx.zs"), None),
        ["floor", d, f] if safe(d) && safe(f) => {
            let main = floor_texture(files, d, f).ok_or_else(|| Error::Game(format!("no map for {d} {f}")))?;
            let top = decode_named(files, &format!("UI/CustomTex/Map/Dungeon/{main}.bntx.zs"), None)?;
            // The dungeon's `All` picture is the soft shadow of every floor; the game draws the floor over it.
            match decode_named(files, &format!("UI/CustomTex/Map/Dungeon/{d}_All.bntx.zs"), None) {
                Ok(mut base) => {
                    over(&mut base, &top, 0.45);
                    Ok(base)
                }
                Err(_) => Ok(top),
            }
        }
        ["tapestry", layer] => crate::tapestry::tapestry_image(files, layer),
        _ => Err(Error::Game(format!("unknown map picture {name:?}"))),
    }
}

impl Image {
    /// Halves the size (box filter), for the 4608-wide world map.
    pub fn half(&self) -> Image {
        let (w, h) = (self.width / 2, self.height / 2);
        let mut rgba = vec![0u8; (w * h * 4) as usize];
        for y in 0..h as usize {
            for x in 0..w as usize {
                for c in 0..4 {
                    let s: u32 = [(0, 0), (1, 0), (0, 1), (1, 1)]
                        .iter()
                        .map(|(dx, dy)| self.rgba[((2 * y + dy) * self.width as usize + 2 * x + dx) * 4 + c] as u32)
                        .sum();
                    rgba[(y * w as usize + x) * 4 + c] = (s / 4) as u8;
                }
            }
        }
        Image { width: w, height: h, rgba }
    }
}

/// A map picture as file bytes and its MIME type: the world map (half size) and the tapestry as JPEG over parchment
/// (they are full paintings, and a PNG of the world map is over 30 MB), every other one as PNG (they need their
/// transparency).
pub fn map_file(files: &GameFiles, name: &str) -> Result<(Vec<u8>, &'static str), Error> {
    let img = map_image(files, name)?;
    if !is_painting(name) {
        return Ok((img.png()?, "image/png"));
    }
    let mut img = if name == "world" { img.half() } else { img };
    for px in img.rgba.chunks_exact_mut(4) {
        let a = px[3] as u32;
        for (c, bg) in px[..3].iter_mut().zip([227u32, 204, 148]) {
            *c = ((*c as u32 * a + bg * (255 - a)) / 255) as u8;
        }
    }
    let mut out = Vec::new();
    jpeg_encoder::Encoder::new(&mut out, 86)
        .encode(&img.rgba, img.width as u16, img.height as u16, jpeg_encoder::ColorType::Rgba)
        .map_err(|e| Error::Game(e.to_string()))?;
    Ok((out, "image/jpeg"))
}

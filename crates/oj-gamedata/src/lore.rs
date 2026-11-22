//! Game text for the quiz and for place names, read from the player's own message archive (`Mals/USen…sarc.zs`,
//! falling back to `EUen`). Nothing of it ships with the app.
//!
//! - `LocationMsg/Location.msbt`: each place's name, keyed by the map's id (`KokiriForest` → "Kokiri Forest").
//! - `ActorMsg/PouchContent.msbt`: items, `<Item>_Name` with a description in `<Item>_Caption`.
//! - `ActorMsg/Enemy.msbt`: enemies, `Enemy_<Name>_Name` with a description in `Enemy_<Name>_Caption_00`.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::files::{msbt, GameFiles};
use crate::Error;

#[derive(Debug, Clone, Serialize)]
pub struct Lore {
    /// Map id → the game's name for the place.
    pub places: BTreeMap<String, String>,
    /// Items with a description: name, description.
    pub items: Vec<(String, String)>,
    /// Enemies with a description: name, description.
    pub enemies: Vec<(String, String)>,
}

pub fn lore(files: &GameFiles) -> Result<Lore, Error> {
    let rel = files
        .versioned("Mals", "USen.Product.", ".sarc.zs")
        .or_else(|_| files.versioned("Mals", "EUen.Product.", ".sarc.zs"))?;
    let mut lore = Lore { places: BTreeMap::new(), items: vec![], enemies: vec![] };
    let flat = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
    for (name, data) in files.sarc(&rel)? {
        let m = msbt(&data);
        match name.as_str() {
            "LocationMsg/Location.msbt" => lore.places.extend(m.into_iter().filter(|(_, v)| !v.is_empty())),
            "ActorMsg/PouchContent.msbt" | "ActorMsg/Enemy.msbt" => {
                let enemy = name.ends_with("Enemy.msbt");
                let suffix = if enemy { "_Caption_00" } else { "_Caption" };
                let mut list: Vec<(String, String)> = m
                    .iter()
                    .filter_map(|(k, cap)| {
                        let id = k.strip_suffix(suffix)?;
                        let name = m.get(&format!("{id}_Name")).filter(|n| !n.is_empty())?;
                        (!cap.is_empty()).then(|| (name.clone(), flat(cap)))
                    })
                    .collect();
                list.sort();
                list.dedup_by(|a, b| a.0 == b.0);
                if enemy {
                    lore.enemies = list
                } else {
                    lore.items = list
                }
            }
            _ => {}
        }
    }
    Ok(lore)
}

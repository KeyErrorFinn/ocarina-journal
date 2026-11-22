//! Places worth finding for this app's own Gossip Quests, read from the maps of the player's game (`Banc`). The original
//! app's rumours (photos and wording) live in Nintendo's app, not in the game, so this app makes its own from landmarks
//! the game places: gossip stones, grotto entrances, cows, the owl's perches, scarecrow spots, frogs, soft soil for
//! magic beans and beehives. Only field maps (`<Area>_Child`, `<Area>_Adult`) are read, so every rumour has a spot on a
//! map picture; one landmark placed in both eras is one rumour, and actors of a kind standing together are one place.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::files::{GameFiles, Val};
use crate::{area_of, Error};

#[derive(Debug, Clone, Serialize)]
pub struct Rumor {
    /// Stable id: kind, area and rounded position.
    pub id: String,
    /// `stone`, `grotto`, `cow`, `owl`, `scarecrow`, `frog`, `bean` or `beehive`.
    pub kind: String,
    /// The area's map id (`KokiriForest`).
    pub area: String,
    /// Position in the area's map, in metres.
    pub pos: [f64; 3],
    /// The eras it is placed in: `child`, `adult`.
    pub eras: Vec<String>,
}

/// The rumour kind of a placed actor, if it is a landmark.
fn kind_of(gyaml: &str) -> Option<&'static str> {
    let k = match gyaml {
        g if g.starts_with("Obj_GossipStone_") => "stone",
        "LookAttentionActor_HidingHoleEntrance" => "grotto",
        g if g.starts_with("Animal_Cow") => "cow",
        g if g.starts_with("Npc_Kaepora") => "owl",
        "Npc_Pierre_CallOcarina" => "scarecrow",
        g if g.starts_with("Animal_Frog_") => "frog",
        // Not soft soil: `Obj_Plant_MagicBean*` are the grown plant's leaves (73 of them, several per spot), so there is
        // no single actor that marks a soft-soil patch [V: DeathMountainCrater has two leaves 64 m apart].
        g if g.starts_with("Obj_Kokiri_Beehive_") => "beehive",
        _ => return None,
    };
    Some(k)
}

pub fn rumors(files: &GameFiles) -> Result<Vec<Rumor>, Error> {
    let mut by_id: BTreeMap<String, Rumor> = BTreeMap::new();
    for dir in files.list("Banc") {
        for file in files.list(&format!("Banc/{dir}")) {
            let Some(banc) = file.strip_suffix("_Dynamic.bcett.byml.zs").or_else(|| file.strip_suffix("_Static.bcett.byml.zs")) else { continue };
            let era = if banc.contains("_Child") { "child" } else if banc.contains("_Adult") { "adult" } else { continue };
            if area_of(banc) != dir {
                continue; // grottos, shops and other rooms inside an area have no map picture of their own
            }
            let Ok(doc) = files.byml(&format!("Banc/{dir}/{file}")) else { continue };
            for a in doc.get("Actors").map(Val::as_arr).unwrap_or(&[]) {
                let Some(kind) = a.get("Gyaml").and_then(Val::as_str).and_then(kind_of) else { continue };
                let t: Vec<f64> = a.get("Translate").map(|t| t.as_arr().iter().filter_map(|v| match v { Val::F32(f) => Some(*f as f64), Val::F64(f) => Some(*f), _ => None }).collect()).unwrap_or_default();
                let [x, y, z] = t[..] else { continue };
                let id = format!("{kind}/{dir}/{:.0}_{:.0}", (x / 2.0).round() * 2.0, (z / 2.0).round() * 2.0);
                let r = by_id.entry(id.clone()).or_insert_with(|| Rumor { id, kind: kind.into(), area: dir.clone(), pos: [x, y, z], eras: vec![] });
                if !r.eras.iter().any(|e| e == era) {
                    r.eras.push(era.into());
                }
            }
        }
    }
    if by_id.is_empty() {
        return Err(Error::Game("no landmarks found in the game's maps".into()));
    }
    // One spot can hold several actors of a kind (Kakariko's beehive is six within 4 m, the Zora River frogs sit
    // together, two cows stand 3 m apart): within MERGE metres in the same area they are one place, one rumour.
    const MERGE: f64 = 8.0;
    let mut out: Vec<Rumor> = Vec::new();
    for r in by_id.into_values() {
        let near = out.iter_mut().find(|o| o.kind == r.kind && o.area == r.area && (o.pos[0] - r.pos[0]).hypot(o.pos[2] - r.pos[2]) < MERGE);
        match near {
            Some(o) => {
                for e in r.eras {
                    if !o.eras.contains(&e) {
                        o.eras.push(e);
                    }
                }
            }
            None => out.push(r),
        }
    }
    Ok(out)
}

//! Dev helper: print every game-data flag hash with its type table, as JSON (`{"0x..": "Bool"}`), for a local census.
//! cargo run --release -p oj-gamedata --example flaglist -- <game dir> > flags.json
use oj_gamedata::files::{GameFiles, Key, Val};
use std::collections::BTreeMap;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let g = GameFiles::open(std::path::Path::new(&a[1])).unwrap();
    let rel = g.versioned("GameData", "GameDataList.Product.", ".byml.zs").unwrap();
    let doc = g.byml(&rel).unwrap();
    let mut out = BTreeMap::new();
    for (tn, list) in doc.get("Data").map(Val::entries).unwrap_or(&[]) {
        let Key::S(tn) = tn else { continue };
        for ent in list.as_arr() {
            if let Some(h) = ent.get("Hash").and_then(Val::int) {
                out.insert(format!("{:#x}", h as u32), tn.clone());
            }
        }
    }
    println!("{}", serde_json::to_string(&out).unwrap());
}

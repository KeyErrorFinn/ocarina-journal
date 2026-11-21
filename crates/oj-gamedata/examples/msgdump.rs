//! Dev helper: print every English message of the player's game as JSON (`file/label` -> text), for research.
//! cargo run --release -p oj-gamedata --example msgdump -- <game dir> > out.json
use oj_gamedata::files::{msbt, GameFiles};
use std::collections::BTreeMap;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let g = GameFiles::open(std::path::Path::new(&a[1])).unwrap();
    let rel = g.versioned("Mals", "USen.Product.", ".sarc.zs").unwrap();
    let mut out = BTreeMap::new();
    for (name, data) in g.sarc(&rel).unwrap() {
        for (k, v) in msbt(&data) {
            out.insert(format!("{name}/{k}"), v);
        }
    }
    println!("{}", serde_json::to_string_pretty(&out).unwrap());
}

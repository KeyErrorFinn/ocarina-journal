//! Dev helper: count every placed actor type across the game's maps, with one example map and position each, for research.
//! cargo run --release -p oj-gamedata --example actorcensus -- <game dir> > actors.tsv
use oj_gamedata::files::{GameFiles, Val};
use std::collections::BTreeMap;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let g = GameFiles::open(std::path::Path::new(&a[1])).unwrap();
    let mut seen: BTreeMap<String, (u32, String, String)> = BTreeMap::new();
    for d in g.list("Banc") {
        for n in g.list(&format!("Banc/{d}")) {
            if !n.ends_with(".bcett.byml.zs") {
                continue;
            }
            let Ok(doc) = g.byml(&format!("Banc/{d}/{n}")) else { continue };
            for act in doc.get("Actors").map(Val::as_arr).unwrap_or(&[]) {
                let gy = act.get("Gyaml").and_then(Val::as_str).unwrap_or("").to_string();
                let t: Vec<String> = act.get("Translate").map(|t| t.as_arr().iter().map(|v| format!("{v:?}")).collect()).unwrap_or_default();
                let e = seen.entry(gy).or_insert((0, n.clone(), t.join(",")));
                e.0 += 1;
            }
        }
    }
    for (gy, (c, n, t)) in seen {
        println!("{c}\t{gy}\t{n}\t{t}");
    }
}

//! Dev helper: print actor names and positions in one banc file containing a word. cargo run -p oj-gamedata --example bancxyz -- <game> <Area> <file part> [actor part]
use oj_gamedata::files::{GameFiles, Val};
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let g = GameFiles::open(std::path::Path::new(&a[1])).unwrap();
    for f in g.list(&format!("Banc/{}", a[2])) {
        if !f.contains(&a[3]) { continue }
        let doc = g.byml(&format!("Banc/{}/{f}", a[2])).unwrap();
        for x in doc.get("Actors").map(Val::as_arr).unwrap_or(&[]) {
            let n = x.get("Gyaml").and_then(Val::as_str).unwrap_or("?");
            if a.get(4).is_some_and(|w| !n.contains(w.as_str())) { continue }
            println!("{f} {n} {:?}", x.get("Translate"));
        }
    }
}

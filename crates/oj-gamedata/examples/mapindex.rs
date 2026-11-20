//! Dev helper: print the map index as JSON, and optionally write one map picture as PNG.
//! cargo run --release -p oj-gamedata --example mapindex -- <game dir> [picture name] [out.png]
use oj_gamedata::{files::GameFiles, maps};
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let g = GameFiles::open(std::path::Path::new(&a[1])).unwrap();
    let t = std::time::Instant::now();
    let idx = maps::map_index(&g).unwrap();
    eprintln!("index in {:?}", t.elapsed());
    if let (Some(name), Some(out)) = (a.get(2), a.get(3)) {
        let t = std::time::Instant::now();
        let (bytes, mime) = maps::map_file(&g, name).unwrap();
        eprintln!("{name}: {} bytes {mime} in {:?}", bytes.len(), t.elapsed());
        std::fs::write(out, bytes).unwrap();
    } else {
        println!("{}", serde_json::to_string_pretty(&idx).unwrap());
    }
}

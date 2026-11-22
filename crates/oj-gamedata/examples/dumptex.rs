//! Dev helper: decode textures from the player's game files to PNGs in a folder (never in the repo).
//! cargo run --release -p oj-gamedata --example dumptex -- <game dir> <out dir> <romfs path> [name filter]
use oj_gamedata::{files::GameFiles, tex};
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let g = GameFiles::open(std::path::Path::new(&a[1])).unwrap();
    let d = g.load(&a[3]).unwrap();
    for t in tex::bntx_textures(&d).unwrap() {
        if a.get(4).is_some_and(|f| !t.name.contains(f.as_str())) {
            continue;
        }
        let t0 = std::time::Instant::now();
        match tex::decode(&d, &t) {
            Ok(img) => {
                std::fs::write(format!("{}/{}.png", a[2], t.name), img.png().unwrap()).unwrap();
                println!("{} {:#x} {}x{} {:?}", t.name, t.format, t.width, t.height, t0.elapsed());
            }
            Err(e) => println!("{}: {e}", t.name),
        }
    }
}

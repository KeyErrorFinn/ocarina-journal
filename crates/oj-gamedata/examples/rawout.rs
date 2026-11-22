//! Dev helper: write one game file, decompressed, to a path outside the repository. cargo run -p oj-gamedata --example rawout -- <game dir> <rel> <out>
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let g = oj_gamedata::files::GameFiles::open(std::path::Path::new(&a[1])).unwrap();
    std::fs::write(&a[3], g.load(&a[2]).unwrap()).unwrap();
}

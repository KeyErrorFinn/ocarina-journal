//! Dev helper: print a save's value for every named flag whose name contains a word.
//! cargo run -p oj-gamedata --example flagprobe -- <names.json> <word> [slot dir]
use oj_savefile::Save;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let names: std::collections::BTreeMap<String, Vec<(String, String)>> = serde_json::from_slice(&std::fs::read(&a[1]).unwrap()).unwrap();
    let dir = a.get(3).map(std::path::PathBuf::from).unwrap_or_else(|| oj_savefile::default_save_dir().unwrap());
    for e in std::fs::read_dir(&dir).unwrap().flatten() {
        let Ok(s) = Save::read(&e.path().join("progress.sav")) else { continue };
        println!("== {}", e.path().display());
        for (h, n) in &names {
            let n = &n[0].0;
            if !n.to_lowercase().contains(&a[2].to_lowercase()) { continue }
            let h = u32::from_str_radix(h.trim_start_matches("0x"), 16).unwrap();
            if let Some(v) = s.get(h) { println!("{n} = {v}") }
        }
    }
}

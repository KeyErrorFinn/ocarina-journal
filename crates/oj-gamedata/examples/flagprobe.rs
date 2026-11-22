//! Dev helper: print a save's value for every named flag whose name contains a word.
//! cargo run -p oj-gamedata --example flagprobe -- <names.json> <word> [slot dir]
use oj_savefile::Save;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let names: std::collections::BTreeMap<String, Vec<(String, String)>> =
        serde_json::from_slice(&std::fs::read(&a[1]).unwrap()).unwrap();
    let dir = a.get(3).map(std::path::PathBuf::from).unwrap_or_else(|| oj_savefile::default_save_dir().unwrap());
    let files: Vec<std::path::PathBuf> = if dir.is_file() {
        vec![dir.clone()]
    } else {
        std::fs::read_dir(&dir).unwrap().flatten().map(|e| e.path().join("progress.sav")).collect()
    };
    for f in files {
        let Ok(s) = Save::read(&f) else { continue };
        println!("== {} ({} flags)", f.display(), s.flag_count());
        for (h, n) in &names {
            let n = &n[0].0;
            if !n.to_lowercase().contains(&a[2].to_lowercase()) {
                continue;
            }
            let h = u32::from_str_radix(h.trim_start_matches("0x"), 16).unwrap();
            if let Some(v) = s.get(h) {
                println!("{n} = {v}")
            }
        }
    }
}

//! Compares this crate's report with the one Longshot's save editor (PR #1655) makes for the same game and save.
//! Needs the player's own files, so it only runs when these are set (nothing of the game is in the repository):
//!   OJ_TEST_GAME=<game folder>  OJ_TEST_SAVE=<user save folder with slot_NN>  OJ_TEST_GOLDEN=<report.json>  OJ_TEST_SLOT=<n>

use std::path::PathBuf;

fn env(k: &str) -> Option<String> {
    std::env::var(k).ok()
}

#[test]
fn matches_the_reference_tool() {
    let (Some(game), Some(save), Some(golden)) = (env("OJ_TEST_GAME"), env("OJ_TEST_SAVE"), env("OJ_TEST_GOLDEN")) else { return };
    let slot: u32 = env("OJ_TEST_SLOT").and_then(|s| s.parse().ok()).unwrap_or(1);
    let started = std::time::Instant::now();
    let g = oj_gamedata::Game::open(&PathBuf::from(game)).expect("open game");
    let rep = g.report(&PathBuf::from(save), Some(slot)).expect("report");
    eprintln!("built in {:?}", started.elapsed());
    let gold: serde_json::Value = serde_json::from_slice(&std::fs::read(golden).unwrap()).unwrap();
    let mine = serde_json::to_value(&rep).unwrap();
    let mut checked = 0;
    for c in mine["categories"].as_array().unwrap() {
        let id = c["id"].as_str().unwrap();
        let Some(gc) = gold["categories"].as_array().unwrap().iter().find(|x| x["id"] == id) else { panic!("{id} missing from the reference") };
        assert_eq!((c["have"].as_u64(), c["of"].as_u64()), (gc["have"].as_u64(), gc["of"].as_u64()), "totals of {id}");
        let (a, b) = (c["entries"].as_array().unwrap(), gc["entries"].as_array().unwrap());
        assert_eq!(a.len(), b.len(), "entry count of {id}");
        for (x, y) in a.iter().zip(b) {
            for k in ["id", "label", "area", "have", "of", "note"] {
                assert_eq!(x[k], y[k], "{id}: {k} of {}", y["id"]);
            }
            checked += 1;
        }
    }
    assert!(checked > 400, "only {checked} entries compared");
    eprintln!("{checked} entries identical");
    // every slot's totals agree too
    for s in mine["slots"].as_array().unwrap() {
        let gs = gold["slots"].as_array().unwrap().iter().find(|x| x["slot"] == s["slot"]).expect("slot in reference");
        for (k, v) in s["totals"].as_object().unwrap() {
            assert_eq!(v, &gs["totals"][k], "{} totals of {k}", s["slot"]);
        }
    }
}

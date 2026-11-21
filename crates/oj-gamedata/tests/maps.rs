//! Reads the map data from a real game folder. Only runs with OJ_TEST_GAME set (nothing of the game is in the
//! repository). The expected values are the ones checked by hand when the reader was written (v3.0.0-rc.5).

#[test]
fn reads_the_game_maps() {
    let Ok(game) = std::env::var("OJ_TEST_GAME") else { return };
    let files = oj_gamedata::files::GameFiles::open(std::path::Path::new(&game)).unwrap();
    let idx = oj_gamedata::maps::map_index(&files).unwrap();
    assert_eq!((idx.world.width, idx.world.height), (7680.0, 5600.0));
    assert_eq!(idx.world.labels.len(), 30);
    let kf = &idx.places["KokiriForest"];
    assert_eq!((kf.center, kf.span, kf.dungeon), ([-5.0, -12.0], 300.0, false));
    assert_eq!(kf.child.as_ref().unwrap().image, "field/KokiriForest_Child_00");
    let ft = &idx.places["ForestTemple"];
    assert_eq!(ft.floors.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(), ["B2", "B1", "1F", "2F", "3F"]);
    assert_eq!(idx.places["LakeHylia"].within.as_deref(), Some("HyruleField"));
    assert!(idx.places["LakeHylia"].child.as_ref().unwrap().mask.is_some());
    let img = oj_gamedata::maps::map_image(&files, "field/KokiriForest_Child_00").unwrap();
    assert_eq!((img.width, img.height), (2000, 1440));
    assert!(oj_gamedata::maps::map_image(&files, "field/../x").is_err());
}

#[test]
fn reads_the_game_tapestry() {
    let Ok(game) = std::env::var("OJ_TEST_GAME") else { return };
    let files = oj_gamedata::files::GameFiles::open(std::path::Path::new(&game)).unwrap();
    let t = oj_gamedata::tapestry::tapestry_index(&files).unwrap();
    assert_eq!((t.width, t.height), (1536, 3072));
    assert_eq!(t.sections.len(), 21);
    let deku = t.sections.iter().find(|s| s.name == "Meet_DekuTree").unwrap();
    assert!(deku.shadow.is_some());
    // the sleeping Link and Navi at the top left of the Deku Tree (texture coordinates 0.24..0.49, 0.06..0.14)
    assert_eq!(deku.bounds, [367, 188, 380, 255]);
    assert!(t.sections.iter().find(|s| s.name == "GameClear").unwrap().shadow.is_none());
    let img = oj_gamedata::maps::map_image(&files, "tapestry/woven").unwrap();
    assert_eq!((img.width, img.height), (1536, 3072));
    assert!(oj_gamedata::maps::map_image(&files, "tapestry/other").is_err());
    let card = oj_gamedata::maps::map_image(&files, "bossname/Gohma").unwrap();
    assert_eq!((card.width, card.height), (896, 282));
    assert!(card.rgba.chunks_exact(4).any(|p| p == [255, 255, 255, 255]));
    assert!(oj_gamedata::maps::map_image(&files, "bossname/Nobody").is_err());
}

#[test]
fn reads_the_game_lore() {
    let Ok(game) = std::env::var("OJ_TEST_GAME") else { return };
    let files = oj_gamedata::files::GameFiles::open(std::path::Path::new(&game)).unwrap();
    let l = oj_gamedata::lore::lore(&files).unwrap();
    assert_eq!(l.places.get("KokiriForest").map(String::as_str), Some("Kokiri Forest"));
    assert!(l.items.len() > 50 && l.enemies.len() > 40, "{} items, {} enemies", l.items.len(), l.enemies.len());
    assert!(l.enemies.iter().any(|(n, c)| n == "Armos" && c.contains("statues")));
}

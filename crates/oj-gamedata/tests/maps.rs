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

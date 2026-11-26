//! Reads the map data from a real game folder. Only runs with OJ_TEST_GAME set (nothing of the game is in the
//! repository). The expected values are the ones checked by hand when the reader was written (v3.0.0-rc.5).

#[test]
fn collectible_eras_come_from_the_players_placements() {
    let Ok(game) = std::env::var("OJ_TEST_GAME") else { return };
    let game = oj_gamedata::Game::open(std::path::Path::new(&game)).unwrap();
    let (mut child, mut adult, mut both, mut unknown) = (0, 0, 0, 0);
    for category in &game.catalogue {
        if !["chests", "skulltulas", "heart-pieces", "heart-containers"].contains(&category.id) {
            continue;
        }
        for entry in &category.entries {
            match game.eras(entry) {
                None => unknown += 1,
                Some(eras) => {
                    assert!(eras.iter().all(|age| age == "child" || age == "adult"));
                    if eras.len() == 2 {
                        both += 1;
                    } else if eras[0] == "child" {
                        child += 1;
                    } else {
                        adult += 1;
                    }
                }
            }
        }
    }
    assert!(child > 0 && adult > 0 && both > 0 && unknown > 0);
    eprintln!("Placement provenance: {child} child-only, {adult} adult-only, {both} both, {unknown} unspecified");
}

#[test]
fn bean_soil_spots_come_with_their_rides() {
    let Ok(game) = std::env::var("OJ_TEST_GAME") else { return };
    let files = oj_gamedata::files::GameFiles::open(std::path::Path::new(&game)).unwrap();
    let spots = oj_gamedata::beans::bean_spots(&files).unwrap();
    let ids: Vec<&str> = spots.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(
        ids,
        [
            "DeathMountainCrater",
            "DeathMountainTrail",
            "DesertColossus",
            "GerudoValley",
            "Graveyard",
            "KokiriForest",
            "LakeHylia",
            "LostWood01",
            "LostWood02",
            "ZoraRiver02"
        ]
    );
    for s in &spots {
        assert!(s.path.len() > 2 && s.length > 1.0, "{} has no route", s.id);
        assert!(!s.stops.is_empty(), "{} has no stops", s.id);
    }
    // Checked by hand against the rails: Zora's River is a 318 m loop with three stops, the Graveyard's a 4 m hop.
    let zora = spots.iter().find(|s| s.id == "ZoraRiver02").unwrap();
    assert_eq!(zora.stops.len(), 3);
    assert!((zora.length - 318.0).abs() < 40.0, "{}", zora.length);
    assert!(spots.iter().find(|s| s.id == "Graveyard").unwrap().length < 10.0);
    eprintln!("bean soil: {} spots, Zora's River route {:.0} m", spots.len(), zora.length);
}

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

/// The Lost Woods map parameters name no destinations and its picture draws no paths; both come from the scene.
/// (Checked by hand on v3.1.1: four real exits, and about a hundred maze volumes inside the picture's frame.)
#[test]
fn reads_the_lost_woods_maze() {
    let Ok(game) = std::env::var("OJ_TEST_GAME") else { return };
    let files = oj_gamedata::files::GameFiles::open(std::path::Path::new(&game)).unwrap();
    let idx = oj_gamedata::maps::map_index(&files).unwrap();
    let lw = &idx.places["LostWood"];
    for era in [lw.child.as_ref().unwrap(), lw.adult.as_ref().unwrap()] {
        let mut to: Vec<&str> = era.exits.iter().map(|e| e.to.as_str()).collect();
        to.sort_unstable();
        assert_eq!(to, ["GoronCity", "KokiriForest", "SacredForestMeadow", "ZoraRiver"]);
        assert!((80..=140).contains(&era.walk.len()), "{} maze volumes", era.walk.len());
        let half = lw.span / 2.0;
        for w in &era.walk {
            assert!(
                (w.x - lw.center[0]).abs() < half && (w.z - lw.center[1]).abs() < half,
                "{w:?} is outside the picture"
            );
            assert!(w.w > 0.0 && w.d > 0.0);
        }
    }
    // Every other place keeps its exits and gets no maze.
    assert!(idx.places["KokiriForest"].adult.as_ref().unwrap().walk.is_empty());
    assert!(idx.places["KokiriForest"].adult.as_ref().unwrap().exits.iter().all(|e| !e.to.is_empty()));
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

#[test]
fn finds_landmarks_for_rumours() {
    let Ok(game) = std::env::var("OJ_TEST_GAME") else { return };
    let files = oj_gamedata::files::GameFiles::open(std::path::Path::new(&game)).unwrap();
    let r = oj_gamedata::rumors::rumors(&files).unwrap();
    let count = |k: &str| r.iter().filter(|x| x.kind == k).count();
    eprintln!(
        "{} rumours: {:?}",
        r.len(),
        ["stone", "grotto", "cow", "owl", "scarecrow", "frog", "beehive"].map(|k| (k, count(k)))
    );
    assert!(count("stone") >= 10 && count("grotto") >= 10);
    // Hyrule Castle's scene file has no age in its name; its grotto and Gossip Stones are still places on its map, for both ages.
    let castle: Vec<_> = r.iter().filter(|x| x.area == "HyruleCastle").collect();
    assert!(castle.iter().any(|x| x.kind == "grotto") && castle.iter().filter(|x| x.kind == "stone").count() >= 3);
    assert!(castle.iter().all(|x| x.eras.len() == 2));
    // Dungeons have no landmarks on their maps.
    for dungeon in ["DodongoCavern", "FireTemple", "WaterTemple", "SpiritTemple", "ShadowTemple", "ForestTemple"] {
        assert!(r.iter().all(|x| x.area != dungeon), "{dungeon} has landmarks");
    }
    assert!(r.iter().all(|x| !x.eras.is_empty()));
    // No two rumours of a kind share a spot.
    for (i, a) in r.iter().enumerate() {
        for b in &r[i + 1..] {
            assert!(
                a.kind != b.kind || a.area != b.area || (a.pos[0] - b.pos[0]).hypot(a.pos[2] - b.pos[2]) >= 8.0,
                "{} and {}",
                a.id,
                b.id
            );
        }
    }
}

/// The ocarina's notes are the game's own recordings; each one sounds at its note's pitch, an octave above middle
/// D to D (D5 F5 A5 B5 D6) [V].
#[test]
fn plays_the_games_ocarina_notes() {
    let Ok(game) = std::env::var("OJ_TEST_GAME") else { return };
    let files = oj_gamedata::files::GameFiles::open(std::path::Path::new(&game)).unwrap();
    for (name, hz) in [
        ("Ocarina_D", 587.3),
        ("Ocarina_F", 698.5),
        ("Ocarina_A", 880.0),
        ("Ocarina_B", 987.8),
        ("Ocarina_HighD", 1174.7),
    ] {
        let w = oj_gamedata::sound::wav(&files, name, 2.0).unwrap();
        assert_eq!(&w[..4], b"RIFF");
        let s: Vec<f64> = w[44..].chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]]) as f64).collect();
        // The note repeats every 1/hz seconds: a strong normalised autocorrelation at that period.
        let part = &s[24_000..24_000 + 4_800];
        let energy = part[..4_000].iter().map(|a| a * a).sum::<f64>();
        let corr = |lag: usize| part[..4_000].iter().zip(&part[lag..]).map(|(a, b)| a * b).sum::<f64>() / energy;
        let period = 48_000.0 / hz;
        let best =
            ((period * 0.94) as usize..=(period * 1.06) as usize).max_by(|a, b| corr(*a).total_cmp(&corr(*b))).unwrap();
        eprintln!("{name}: {:.1} Hz, correlation {:.2} (expected {hz})", 48_000.0 / best as f64, corr(best));
        assert!(corr(best) > 0.8, "{name} does not repeat at {hz} Hz");
    }
    assert!(oj_gamedata::sound::wav(&files, "BGM_Title", 1.0).is_err());
}

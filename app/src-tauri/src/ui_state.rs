//! App-owned progress only. This cannot name a file, change settings or write to the game.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct UiState {
    pub revision: u64,
    pub values: Map<String, Value>,
}

impl UiState {
    pub fn apply(&mut self, key: &str, value: Value, initialize: bool) -> Result<(), String> {
        let array = key == "lostwood.seen";
        if ![
            "home.seen",
            "gossip.found",
            "gossip.helped",
            "landmark.visited",
            "quiz.best",
            "lostwood.seen",
            "rewards.owned",
        ]
        .contains(&key)
        {
            return Err("This value is not shared.".into());
        }
        let mut next = self.values.get(key).cloned().unwrap_or_else(|| {
            if array {
                Value::Array(vec![])
            } else {
                Value::Object(Map::new())
            }
        });
        if array {
            let items = value.as_array().ok_or("Expected explored rooms.")?;
            let dest = next.as_array_mut().ok_or("Invalid stored rooms.")?;
            for item in items {
                if !item.as_u64().is_some_and(|v| v < 100_000) {
                    return Err("Invalid explored room.".into());
                }
                if !dest.contains(item) {
                    dest.push(item.clone());
                }
            }
        } else {
            let entries = value.as_object().ok_or("Expected progress entries.")?;
            let dest = next.as_object_mut().ok_or("Invalid stored progress.")?;
            for (id, v) in entries {
                if id.is_empty() || id.len() > 128 {
                    return Err("Invalid progress identifier.".into());
                }
                let valid = match key {
                    "home.seen" => v.as_str().is_some_and(|s| s.len() <= 4096),
                    "gossip.helped" | "rewards.owned" => v == true,
                    _ => v.as_u64().is_some_and(|n| n <= 9_007_199_254_740_991),
                };
                if !valid {
                    return Err("Invalid progress value.".into());
                }
                if initialize && key == "home.seen" && dest.contains_key(id) {
                    continue;
                }
                if key != "home.seen" && dest.get(id).is_some_and(|old| old.as_u64() > v.as_u64()) {
                    continue;
                }
                dest.insert(id.clone(), v.clone());
            }
        }
        if next.to_string().len() > 262_144 {
            return Err("Shared progress is too large.".into());
        }
        if self.values.get(key) != Some(&next) {
            self.values.insert(key.into(), next);
            self.revision += 1;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn changes_merge_without_losing_other_screens_progress() {
        let mut s = UiState::default();
        s.apply("home.seen", json!({"map":"one"}), false).unwrap();
        s.apply("home.seen", json!({"foes":"two"}), false).unwrap();
        s.apply("home.seen", json!({"map":"old"}), true).unwrap();
        assert_eq!(s.values["home.seen"], json!({"map":"one","foes":"two"}));
        s.apply("quiz.best", json!({"easy":5}), false).unwrap();
        s.apply("quiz.best", json!({"easy":2,"hard":3}), false).unwrap();
        assert_eq!(s.values["quiz.best"], json!({"easy":5,"hard":3}));
        s.apply("lostwood.seen", json!([1, 2]), false).unwrap();
        s.apply("lostwood.seen", json!([2, 3]), false).unwrap();
        assert_eq!(s.values["lostwood.seen"], json!([1, 2, 3]));
        let saved = serde_json::to_string(&s).unwrap();
        let back: UiState = serde_json::from_str(&saved).unwrap();
        assert_eq!(back.values, s.values);
    }

    #[test]
    fn rejects_settings_paths_and_invalid_values_atomically() {
        let mut s = UiState::default();
        assert!(s.apply("save_dir", json!({"path":"anything"}), false).is_err());
        assert!(s.apply("home.seen", json!({"map":1}), false).is_err());
        assert!(s.apply("quiz.best", json!({"easy":-1}), false).is_err());
        assert!(s.apply("lostwood.seen", json!([1, "bad"]), false).is_err());
        assert!(s.values.is_empty());
        assert_eq!(s.revision, 0);
    }
}

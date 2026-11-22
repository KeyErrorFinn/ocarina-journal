//! Read-only reader for Longshot's Ocarina of Time `progress.sav`.
//!
//! Layout (from Longshot PR #1401's documentation, checked here against a real save): little-endian;
//! `u32` magic `0x01020304`, `u32` revision, `u32` data offset; a flag table at `0x28` of 8-byte
//! `{hash, value}` entries (an entry `{0, k}` closes group `k`; the last entry has hash `0xA3DB7114`
//! and its value is the offset of the key list); then a sorted list of `u64` keys that are true.
//!
//! This crate **never writes**. Flag names are hashes (`MurmurHash3_x86_32`, seed 0, of the UTF-8 name);
//! the file holds no names, so only the flags listed in [`known`] are given a meaning here.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::Serialize;

pub const MAGIC: u32 = 0x0102_0304;
pub const TAIL_HASH: u32 = 0xA3DB_7114;
const TABLE: usize = 0x28;
pub const MAX_FILE: usize = 4 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("not a progress.sav (bad magic)")]
    BadMagic,
    #[error("file is damaged or being written: {0}")]
    Damaged(&'static str),
    #[error("file is larger than {MAX_FILE} bytes")]
    TooLarge,
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// `MurmurHash3_x86_32`, seed 0.
pub fn murmur3_32(data: &[u8]) -> u32 {
    const C1: u32 = 0xcc9e_2d51;
    const C2: u32 = 0x1b87_3593;
    let mut h = 0u32;
    let mut chunks = data.chunks_exact(4);
    for c in &mut chunks {
        let mut k = u32::from_le_bytes([c[0], c[1], c[2], c[3]]);
        k = k.wrapping_mul(C1).rotate_left(15).wrapping_mul(C2);
        h ^= k;
        h = h.rotate_left(13).wrapping_mul(5).wrapping_add(0xe654_6b64);
    }
    let r = chunks.remainder();
    if !r.is_empty() {
        let mut k = 0u32;
        for (i, b) in r.iter().enumerate() {
            k |= (*b as u32) << (8 * i);
        }
        k = k.wrapping_mul(C1).rotate_left(15).wrapping_mul(C2);
        h ^= k;
    }
    h ^= data.len() as u32;
    h ^= h >> 16;
    h = h.wrapping_mul(0x85eb_ca6b);
    h ^= h >> 13;
    h = h.wrapping_mul(0xc2b2_ae35);
    h ^ (h >> 16)
}

pub fn flag_hash(name: &str) -> u32 {
    murmur3_32(name.as_bytes())
}

/// Flags whose meaning is established. Anything else stays an anonymous hash.
pub mod known {
    use super::flag_hash;

    pub const RUPEES: &str = "PlayerStatus.CurrentRupee";
    pub const LIFE: &str = "PlayerStatus.Life";
    pub const MAX_LIFE: &str = "PlayerStatus.MaxLife";
    /// The Gold Skulltula token count. The **name is unknown**: the hash was found by diffing a save
    /// before and after collecting a token (54 -> 55, matching the pause menu) and agrees with the count
    /// that Longshot's save-editor report derives independently (55). Unverified beyond that one slot.
    pub const GOLD_SKULLTULAS_HASH: u32 = 0x0473_5978;

    pub fn rupees() -> u32 {
        flag_hash(RUPEES)
    }
    pub fn life() -> u32 {
        flag_hash(LIFE)
    }
    pub fn max_life() -> u32 {
        flag_hash(MAX_LIFE)
    }
}

#[derive(Debug, Clone)]
pub struct Save {
    pub revision: u32,
    raw: Vec<u8>,
    words: HashMap<u32, u32>,
    /// Keys that are true (one per placed object: chest, Gold Skulltula, heart piece ...).
    pub true_keys: Vec<u64>,
}

impl Save {
    pub fn parse(b: &[u8]) -> Result<Self, Error> {
        if b.len() > MAX_FILE {
            return Err(Error::TooLarge);
        }
        let u32_at = |o: usize| -> Result<u32, Error> {
            b.get(o..o + 4).map(|s| u32::from_le_bytes(s.try_into().unwrap())).ok_or(Error::Damaged("truncated"))
        };
        if u32_at(0)? != MAGIC {
            return Err(Error::BadMagic);
        }
        let revision = u32_at(4)?;
        let start = u32_at(8)? as usize;
        if start <= TABLE || start > b.len() {
            return Err(Error::Damaged("data offset out of range"));
        }
        let mut words = HashMap::new();
        let mut o = TABLE;
        // The flag table runs to the data section; a progress file ends it with the tail entry that points at the key list.
        let mut key_off = None;
        while o + 8 <= start {
            let (h, v) = (u32_at(o)?, u32_at(o + 4)?);
            o += 8;
            if h == TAIL_HASH {
                key_off = Some(v as usize);
                break;
            }
            if h != 0 {
                words.insert(h, v);
            }
        }
        let mut true_keys = Vec::new();
        if let Some(key_off) = key_off {
            if key_off < o || key_off > b.len() {
                return Err(Error::Damaged("key list offset out of range"));
            }
            let mut k = key_off;
            loop {
                let Some(s) = b.get(k..k + 8) else { return Err(Error::Damaged("key list not terminated")) };
                let x = u64::from_le_bytes(s.try_into().unwrap());
                if x == 0 {
                    break;
                }
                true_keys.push(x);
                k += 8;
            }
        }
        Ok(Self { revision, raw: b.to_vec(), words, true_keys })
    }

    pub fn read(path: &Path) -> Result<Self, Error> {
        let b = std::fs::read(path)?;
        Self::parse(&b)
    }

    pub fn get(&self, hash: u32) -> Option<u32> {
        self.words.get(&hash).copied()
    }

    /// A Float flag's value (stored in the table word itself).
    pub fn get_f32(&self, hash: u32) -> Option<f32> {
        self.get(hash).map(f32::from_bits)
    }

    /// A String flag's text (the table value is an offset to NUL-terminated bytes of at most `max`).
    pub fn get_string(&self, hash: u32, max: usize) -> Option<String> {
        let o = self.get(hash)? as usize;
        let s = self.raw.get(o..(o + max).min(self.raw.len()))?;
        let n = s.iter().position(|b| *b == 0).unwrap_or(s.len());
        Some(String::from_utf8_lossy(&s[..n]).into_owned())
    }

    /// A 64-bit flag's value (the table value is an offset to eight bytes).
    pub fn get_u64(&self, hash: u32) -> Option<u64> {
        let o = self.get(hash)? as usize;
        Some(u64::from_le_bytes(self.raw.get(o..o + 8)?.try_into().ok()?))
    }

    /// Is this 64-bit placement key in the file's list of keys that are true?
    pub fn has_key(&self, key: u64) -> bool {
        self.true_keys.binary_search(&key).is_ok()
    }

    pub fn flag_count(&self) -> usize {
        self.words.len()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SlotSummary {
    pub slot: String,
    pub modified_ms: Option<u64>,
    pub rupees: Option<u32>,
    pub life: Option<u32>,
    pub max_life: Option<u32>,
    pub gold_skulltulas: Option<u32>,
    pub true_keys: usize,
}

impl SlotSummary {
    pub fn of(slot: &str, modified: Option<SystemTime>, save: &Save) -> Self {
        Self {
            slot: slot.to_string(),
            modified_ms: modified
                .and_then(|m| m.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64),
            rupees: save.get(known::rupees()),
            life: save.get(known::life()),
            max_life: save.get(known::max_life()),
            gold_skulltulas: save.get(known::GOLD_SKULLTULAS_HASH),
            true_keys: save.true_keys.len(),
        }
    }
}

/// Where Longshot keeps saves on Windows: `%APPDATA%\Longshot\save\<user id>`; the first user folder found.
pub fn default_save_dir() -> Option<PathBuf> {
    let root = PathBuf::from(std::env::var_os("APPDATA")?).join("Longshot").join("save");
    let mut users: Vec<_> = std::fs::read_dir(root).ok()?.flatten().filter(|e| e.path().is_dir()).collect();
    users.sort_by_key(|e| e.file_name());
    users.into_iter().next().map(|e| e.path())
}

/// Summaries of every `slot_NN/progress.sav` under a user save folder, newest first. Unreadable or
/// half-written files are skipped (the game may be writing); the next call retries.
pub fn list_slots(user_dir: &Path) -> Vec<SlotSummary> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(user_dir) else { return out };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if !name.starts_with("slot_") {
            continue;
        }
        let file = e.path().join("progress.sav");
        let modified = std::fs::metadata(&file).and_then(|m| m.modified()).ok();
        if let Ok(save) = Save::read(&file) {
            out.push(SlotSummary::of(&name, modified, &save));
        }
    }
    out.sort_by_key(|a| std::cmp::Reverse(a.modified_ms));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal valid save: given words, given true keys.
    fn build(words: &[(u32, u32)], keys: &[u64]) -> Vec<u8> {
        let mut b = vec![0u8; TABLE];
        b[0..4].copy_from_slice(&MAGIC.to_le_bytes());
        b[4..8].copy_from_slice(&7u32.to_le_bytes());
        for (h, v) in words {
            b.extend_from_slice(&h.to_le_bytes());
            b.extend_from_slice(&v.to_le_bytes());
        }
        b.extend_from_slice(&0u32.to_le_bytes());
        b.extend_from_slice(&1u32.to_le_bytes()); // closes group 1
        let key_off = (b.len() + 8) as u32;
        b.extend_from_slice(&TAIL_HASH.to_le_bytes());
        b.extend_from_slice(&key_off.to_le_bytes());
        let start = b.len() as u32; // the data section starts after the table
        b[8..12].copy_from_slice(&start.to_le_bytes());
        for k in keys {
            b.extend_from_slice(&k.to_le_bytes());
        }
        b.extend_from_slice(&0u64.to_le_bytes());
        b
    }

    #[test]
    fn murmur_known_vectors() {
        assert_eq!(murmur3_32(b""), 0);
        assert_eq!(murmur3_32(b"test"), 0xba6b_d213);
        assert_eq!(murmur3_32(b"Hello, world!"), 0xc036_3e43);
    }

    /// The rupee flag's hash, taken from a real save and from the bridge's own flag watch, equals the hash of its name.
    #[test]
    fn rupee_name_hashes_to_the_hash_seen_in_a_real_save() {
        assert_eq!(flag_hash(known::RUPEES), 0xa779_21d7);
    }

    #[test]
    fn parses_words_and_keys() {
        let b = build(&[(known::rupees(), 943), (known::GOLD_SKULLTULAS_HASH, 55)], &[3, 9, 40]);
        let s = Save::parse(&b).unwrap();
        assert_eq!(s.revision, 7);
        assert_eq!(s.get(known::rupees()), Some(943));
        assert_eq!(s.get(known::GOLD_SKULLTULAS_HASH), Some(55));
        assert_eq!(s.true_keys, vec![3, 9, 40]);
        let sum = SlotSummary::of("slot_01", None, &s);
        assert_eq!((sum.rupees, sum.gold_skulltulas, sum.true_keys), (Some(943), Some(55), 3));
    }

    #[test]
    fn rejects_bad_and_truncated_files() {
        assert!(matches!(Save::parse(&[0; 64]), Err(Error::BadMagic)));
        let mut b = build(&[(1, 2)], &[5]);
        b.truncate(b.len() - 8); // lose the terminator
        assert!(matches!(Save::parse(&b), Err(Error::Damaged(_))));
        assert!(Save::parse(&b[..10]).is_err());
    }

    /// Optional: `OJ_TEST_SAVE=<progress.sav>` checks a real file (never shipped).
    #[test]
    fn real_save_if_provided() {
        let Some(p) = std::env::var_os("OJ_TEST_SAVE") else { return };
        let s = Save::read(Path::new(&p)).unwrap();
        assert!(s.flag_count() > 1000);
        assert!(s.get(known::rupees()).is_some());
    }
}

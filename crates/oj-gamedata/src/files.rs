//! The game's file formats, read-only: zstd frames (some made with the game's own dictionary), SARC archives, BYML
//! documents and MSBT message files. Nothing of the game is in this crate; every table is read from the player's folder.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::Error;

/// A BYML value. Integers keep their stored width because the game's hashes are compared as written.
#[derive(Debug, Clone, PartialEq)]
pub enum Val {
    Null,
    Bool(bool),
    I32(i32),
    U32(u32),
    I64(i64),
    U64(u64),
    F32(f32),
    F64(f64),
    Str(String),
    Bin(Vec<u8>),
    Arr(Vec<Val>),
    Map(Vec<(Key, Val)>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Key {
    S(String),
    H(u64),
}

impl Val {
    pub fn get(&self, k: &str) -> Option<&Val> {
        match self {
            Val::Map(m) => m.iter().find_map(|(key, v)| matches!(key, Key::S(s) if s == k).then_some(v)),
            _ => None,
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        if let Val::Str(s) = self { Some(s) } else { None }
    }
    pub fn as_arr(&self) -> &[Val] {
        if let Val::Arr(a) = self { a } else { &[] }
    }
    pub fn entries(&self) -> &[(Key, Val)] {
        if let Val::Map(m) = self { m } else { &[] }
    }
    /// The integer as Python would hold it (signedness as stored), for exact comparisons and `%d` formatting.
    pub fn int(&self) -> Option<i128> {
        Some(match self {
            Val::I32(x) => *x as i128,
            Val::U32(x) => *x as i128,
            Val::I64(x) => *x as i128,
            Val::U64(x) => *x as i128,
            Val::Bool(b) => *b as i128,
            _ => return None,
        })
    }
    /// Python truthiness.
    pub fn truthy(&self) -> bool {
        match self {
            Val::Null => false,
            Val::Bool(b) => *b,
            Val::F32(f) => *f != 0.0,
            Val::F64(f) => *f != 0.0,
            Val::Str(s) => !s.is_empty(),
            Val::Bin(b) => !b.is_empty(),
            Val::Arr(a) => !a.is_empty(),
            Val::Map(m) => !m.is_empty(),
            other => other.int().is_some_and(|i| i != 0),
        }
    }
}

// ------------------------------------------------------------------------------------------------------------- zstd
const ZSTD_MAGIC: [u8; 4] = [0x28, 0xB5, 0x2F, 0xFD];

/// The dictionary id a zstd frame asks for (0 when it uses none).
fn frame_dict_id(d: &[u8]) -> u32 {
    if d.len() < 6 || d[..4] != ZSTD_MAGIC {
        return 0;
    }
    let fhd = d[4];
    let single = (fhd >> 5) & 1 == 1;
    let at = 5 + usize::from(!single);
    let n = [0usize, 1, 2, 4][(fhd & 3) as usize];
    let mut id = 0u32;
    for i in 0..n {
        id |= u32::from(*d.get(at + i).unwrap_or(&0)) << (8 * i);
    }
    id
}

pub fn zs_decompress(data: &[u8], dicts: &HashMap<u32, Vec<u8>>) -> Result<Vec<u8>, Error> {
    let want = frame_dict_id(data);
    let mut out = Vec::new();
    if want == 0 {
        zstd::stream::read::Decoder::new(data)?.read_to_end(&mut out)?;
    } else {
        let dict = dicts.get(&want).ok_or_else(|| Error::Game(format!("a game file needs zstd dictionary {want}, which Pack/ZsDic.pack.zs does not hold")))?;
        zstd::stream::read::Decoder::with_dictionary(data, dict)?.read_to_end(&mut out)?;
    }
    Ok(out)
}

// ------------------------------------------------------------------------------------------------------------- SARC
fn rd_u16(d: &[u8], o: usize, le: bool) -> Result<u16, Error> {
    let b: [u8; 2] = d.get(o..o + 2).ok_or(Error::Game("truncated file".into()))?.try_into().unwrap();
    Ok(if le { u16::from_le_bytes(b) } else { u16::from_be_bytes(b) })
}
fn rd_u32(d: &[u8], o: usize, le: bool) -> Result<u32, Error> {
    let b: [u8; 4] = d.get(o..o + 4).ok_or(Error::Game("truncated file".into()))?.try_into().unwrap();
    Ok(if le { u32::from_le_bytes(b) } else { u32::from_be_bytes(b) })
}
fn rd_u64(d: &[u8], o: usize, le: bool) -> Result<u64, Error> {
    let b: [u8; 8] = d.get(o..o + 8).ok_or(Error::Game("truncated file".into()))?.try_into().unwrap();
    Ok(if le { u64::from_le_bytes(b) } else { u64::from_be_bytes(b) })
}
fn cstr(d: &[u8], o: usize) -> Result<String, Error> {
    let s = d.get(o..).ok_or(Error::Game("string out of range".into()))?;
    let n = s.iter().position(|b| *b == 0).ok_or(Error::Game("unterminated string".into()))?;
    Ok(String::from_utf8_lossy(&s[..n]).into_owned())
}

/// `{name: bytes}` of a SARC archive.
pub fn sarc(d: &[u8]) -> Result<Vec<(String, Vec<u8>)>, Error> {
    if d.get(..4) != Some(b"SARC") {
        return Err(Error::Game("not a SARC archive".into()));
    }
    let le = d.get(6..8) == Some(&[0xFF, 0xFE]);
    let header = rd_u16(d, 4, le)? as usize;
    let start = rd_u32(d, 12, le)? as usize;
    let count = rd_u16(d, header + 6, le)? as usize;
    let names = header + 12 + count * 16 + 8;
    let mut out = Vec::with_capacity(count);
    for i in 0..count {
        let e = header + 12 + i * 16;
        let attr = rd_u32(d, e + 4, le)?;
        let (lo, hi) = (rd_u32(d, e + 8, le)? as usize, rd_u32(d, e + 12, le)? as usize);
        let name = cstr(d, names + (attr & 0xFF_FFFF) as usize * 4)?;
        out.push((name, d.get(start + lo..start + hi).ok_or(Error::Game("SARC member out of range".into()))?.to_vec()));
    }
    Ok(out)
}

// ------------------------------------------------------------------------------------------------------------- BYML
struct Byml<'a> {
    d: &'a [u8],
    le: bool,
    keys: Vec<String>,
    strs: Vec<String>,
}

pub fn byml(d: &[u8]) -> Result<Val, Error> {
    let le = d.get(..2) == Some(b"YB");
    if !le && d.get(..2) != Some(b"BY") {
        return Err(Error::Game("not a BYML document".into()));
    }
    let (kt, st, root) = (rd_u32(d, 4, le)? as usize, rd_u32(d, 8, le)? as usize, rd_u32(d, 12, le)? as usize);
    let mut b = Byml { d, le, keys: vec![], strs: vec![] };
    b.keys = b.table(kt)?;
    b.strs = b.table(st)?;
    b.node(root, 0)
}

impl Byml<'_> {
    fn word(&self, o: usize) -> Result<u32, Error> {
        rd_u32(self.d, o, self.le)
    }
    fn count(&self, o: usize) -> Result<usize, Error> {
        let w = self.word(o)?;
        Ok(if self.le { w >> 8 } else { w & 0xFF_FFFF } as usize)
    }
    fn table(&self, o: usize) -> Result<Vec<String>, Error> {
        if o == 0 {
            return Ok(vec![]);
        }
        let n = self.count(o)?;
        (0..n).map(|i| cstr(self.d, o + self.word(o + 4 + 4 * i)? as usize)).collect()
    }
    fn val(&self, t: u8, v: u32, depth: usize) -> Result<Val, Error> {
        let o = v as usize;
        Ok(match t {
            0xA0 => Val::Str(self.strs.get(o).cloned().ok_or(Error::Game("BYML string index".into()))?),
            0xA1 | 0xA2 => {
                let n = self.word(o)? as usize;
                Val::Bin(self.d.get(o + 4..o + 4 + n).ok_or(Error::Game("BYML binary".into()))?.to_vec())
            }
            0x20 | 0x21 | 0xC0 | 0xC1 => self.node(o, depth + 1)?,
            0xD0 => Val::Bool(v != 0),
            0xD1 => Val::I32(v as i32),
            0xD2 => Val::F32(f32::from_bits(v)),
            0xD3 => Val::U32(v),
            0xD4 => Val::I64(rd_u64(self.d, o, self.le)? as i64),
            0xD5 => Val::U64(rd_u64(self.d, o, self.le)?),
            0xD6 => Val::F64(f64::from_bits(rd_u64(self.d, o, self.le)?)),
            0xFF => Val::Null,
            other => return Err(Error::Game(format!("BYML value type {other:#x} is not read"))),
        })
    }
    fn node(&self, o: usize, depth: usize) -> Result<Val, Error> {
        if depth > 64 {
            return Err(Error::Game("BYML nesting too deep".into()));
        }
        let t = *self.d.get(o).ok_or(Error::Game("BYML node".into()))?;
        let n = self.count(o)?;
        match t {
            0x20 | 0x21 => {
                let w = if t == 0x20 { 8 } else { 12 };
                let types = o + 4 + w * n;
                let mut m = Vec::with_capacity(n);
                for i in 0..n {
                    let p = o + 4 + w * i;
                    let (h, v) = if t == 0x20 {
                        (self.word(p)? as u64, self.word(p + 4)?)
                    } else {
                        (rd_u64(self.d, p, self.le)?, self.word(p + 8)?)
                    };
                    m.push((Key::H(h), self.val(self.d[types + i], v, depth)?));
                }
                Ok(Val::Map(m))
            }
            0xC0 => {
                let (types, vals) = (o + 4, o + 4 + ((n + 3) & !3));
                (0..n).map(|i| self.val(self.d[types + i], self.word(vals + 4 * i)?, depth)).collect::<Result<_, _>>().map(Val::Arr)
            }
            0xC1 => {
                let mut m = Vec::with_capacity(n);
                for i in 0..n {
                    let p = o + 4 + 8 * i;
                    let kw = self.word(p)?;
                    let ki = if self.le { kw & 0xFF_FFFF } else { kw >> 8 } as usize;
                    let key = self.keys.get(ki).cloned().ok_or(Error::Game("BYML key index".into()))?;
                    m.push((Key::S(key), self.val(self.d[p + 3], self.word(p + 4)?, depth)?));
                }
                Ok(Val::Map(m))
            }
            other => Err(Error::Game(format!("BYML node type {other:#x} is not read"))),
        }
    }
}

// ------------------------------------------------------------------------------------------------------------- MSBT
/// `{label: text}` of an MSBT message file in UTF-8 (this game's), control tags left out.
pub fn msbt(d: &[u8]) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if d.get(..8) != Some(b"MsgStdBn") || d.get(0xC) != Some(&0) {
        return out;
    }
    let le = d.get(8..10) == Some(&[0xFF, 0xFE]);
    let Ok(n) = rd_u16(d, 0xE, le) else { return out };
    let (mut o, mut labels, mut texts): (usize, Vec<(String, u32)>, Vec<&[u8]>) = (0x20, vec![], vec![]);
    for _ in 0..n {
        let (Some(tag), Ok(size)) = (d.get(o..o + 4), rd_u32(d, o + 4, le)) else { break };
        let size = size as usize;
        let Some(body) = d.get(o + 16..o + 16 + size) else { break };
        match tag {
            b"LBL1" => {
                let groups = rd_u32(body, 0, le).unwrap_or(0) as usize;
                for i in 0..groups {
                    let (Ok(count), Ok(off)) = (rd_u32(body, 4 + 8 * i, le), rd_u32(body, 8 + 8 * i, le)) else { break };
                    let mut off = off as usize;
                    for _ in 0..count {
                        let Some(&len) = body.get(off) else { break };
                        let len = len as usize;
                        let (Some(name), Ok(idx)) = (body.get(off + 1..off + 1 + len), rd_u32(body, off + 1 + len, le)) else { break };
                        labels.push((String::from_utf8_lossy(name).into_owned(), idx));
                        off += 1 + len + 4;
                    }
                }
            }
            b"TXT2" => {
                let count = rd_u32(body, 0, le).unwrap_or(0) as usize;
                let offs: Vec<usize> = (0..count).filter_map(|i| rd_u32(body, 4 + 4 * i, le).ok()).map(|x| x as usize).collect();
                for i in 0..offs.len() {
                    let end = offs.get(i + 1).copied().unwrap_or(body.len());
                    if let Some(s) = body.get(offs[i]..end) {
                        texts.push(s);
                    }
                }
            }
            _ => {}
        }
        o = (o + 16 + size + 15) & !15;
    }
    for (label, idx) in labels {
        let Some(raw) = texts.get(idx as usize) else { continue };
        let (mut text, mut i) = (Vec::new(), 0usize);
        while i < raw.len() && raw[i] != 0 {
            if raw[i] == 0x0E {
                i = if i + 7 <= raw.len() { i + 7 + rd_u16(raw, i + 5, le).unwrap_or(0) as usize } else { raw.len() };
            } else if raw[i] == 0x0F {
                i += 5;
            } else {
                text.push(raw[i]);
                i += 1;
            }
        }
        out.insert(label, String::from_utf8_lossy(&text).trim().to_string());
    }
    out
}

// ------------------------------------------------------------------------------------------------------ game folder
/// The player's own game files: `<game>/romfs/...`, or the RomFS folder itself.
pub struct GameFiles {
    pub root: PathBuf,
    dicts: HashMap<u32, Vec<u8>>,
}

impl GameFiles {
    pub fn open(path: &Path) -> Result<Self, Error> {
        for root in [path.join("romfs"), path.to_path_buf()] {
            if root.join("GameData").is_dir() {
                let mut g = GameFiles { root, dicts: HashMap::new() };
                g.load_dicts()?;
                return Ok(g);
            }
        }
        Err(Error::Game(format!("{} holds no game files (no GameData folder)", path.display())))
    }

    fn load_dicts(&mut self) -> Result<(), Error> {
        let p = self.root.join("Pack").join("ZsDic.pack.zs");
        if let Ok(raw) = std::fs::read(&p) {
            for (_, blob) in sarc(&zs_decompress(&raw, &HashMap::new())?)? {
                if blob.get(..4) == Some(&[0x37, 0xA4, 0x30, 0xEC]) {
                    self.dicts.insert(rd_u32(&blob, 4, true)?, blob);
                }
            }
        }
        Ok(())
    }

    fn path(&self, rel: &str) -> PathBuf {
        rel.split('/').fold(self.root.clone(), |p, s| p.join(s))
    }

    pub fn exists(&self, rel: &str) -> bool {
        self.path(rel).is_file()
    }

    pub fn raw(&self, rel: &str) -> Result<Vec<u8>, Error> {
        std::fs::read(self.path(rel)).map_err(|e| Error::Game(format!("cannot read game file {rel}: {e}")))
    }

    pub fn load(&self, rel: &str) -> Result<Vec<u8>, Error> {
        let raw = self.raw(rel)?;
        if rel.ends_with(".zs") { zs_decompress(&raw, &self.dicts) } else { Ok(raw) }
    }

    pub fn byml(&self, rel: &str) -> Result<Val, Error> {
        byml(&self.load(rel)?)
    }

    pub fn sarc(&self, rel: &str) -> Result<Vec<(String, Vec<u8>)>, Error> {
        sarc(&self.load(rel)?)
    }

    pub fn list(&self, folder: &str) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(self.path(folder)).into_iter().flatten().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        v.sort();
        v
    }

    /// The last file in a folder named `<prefix><digits><suffix>` (the game's versioned names), as its RomFS path.
    pub fn versioned(&self, folder: &str, prefix: &str, suffix: &str) -> Result<String, Error> {
        self.list(folder)
            .into_iter()
            .rfind(|n| n.strip_prefix(prefix).and_then(|r| r.strip_suffix(suffix)).is_some_and(|d| !d.is_empty() && d.bytes().all(|c| c.is_ascii_digit())))
            .map(|n| format!("{folder}/{n}"))
            .ok_or_else(|| Error::Game(format!("the game folder has no {folder}/{prefix}<n>{suffix}")))
    }
}

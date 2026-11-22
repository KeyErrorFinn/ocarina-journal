//! The game's own Threads of Time tapestry, read from the player's game folder. Nothing from it ships with the app.
//!
//! Sources, all in the RomFS (2026-11-20, v3.0.0-rc.5 files):
//! - Three full pictures of the cloth, 1536×3072, in `Tex/`: `Cloth_TapestryChallengeMenu_Base_Alb` (empty panels),
//!   `Cloth_TapestryChallengeMenu_Alb` (every panel as a silhouette) and `Cloth_TapestryChallengeMenu_Complete_Alb`
//!   (every panel woven).
//! - One small model per section, `Model/Obj_TapestryChallengeMenu.<Section>.bfres.zs` (drawn with the silhouette
//!   picture) and `<Section>_Complete` (the woven one). The meshes' texture coordinates (`_u0`) outline the section
//!   on the pictures; the two outlines of a section can differ. `GameClear_Complete` (the bottom band) has no
//!   silhouette.
//! - The section names are the game's Threads of Time quests (`RSDB/Challenge`, `Work/Challenge/<Section>`), whose
//!   progress the save keeps in `Step_<Section>`.
//!
//! BFRES (version 10, Switch 2) is read only as far as this needs, at offsets checked on every section model: the
//! header's memory pool (+0xB0) holds the buffer data's file offset (+8); a shape (`FSHP`) points to its vertex
//! buffer (+0x10) and first mesh (+0x18); the vertex buffer (`FVTX`) has its attributes (+0x08), strides (+0x38),
//! offset in the buffer data (+0x48), attribute count (+0x4C) and vertex count (+0x50); the mesh has the index
//! offset (+0x20), primitive type (+0x24, 3 = triangles), index format (+0x28, 1 = u16) and index count (+0x2C).
//! `_u0` is two unsigned normalised 16-bit values (format 0x1201).

use serde::Serialize;

use crate::files::GameFiles;
use crate::tex::{bntx_textures, decode, Image};
use crate::Error;

const MODEL_PREFIX: &str = "Obj_TapestryChallengeMenu.";
const LAYERS: [(&str, &str); 3] = [
    ("base", "Cloth_TapestryChallengeMenu_Base_Alb"),
    ("shadow", "Cloth_TapestryChallengeMenu_Alb"),
    ("woven", "Cloth_TapestryChallengeMenu_Complete_Alb"),
];

#[derive(Debug, Clone, Serialize)]
pub struct Tapestry {
    pub width: u32,
    pub height: u32,
    pub sections: Vec<Section>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Section {
    /// The game's quest name (`Meet_DekuTree`, `SageOfWater`...), or `GameClear`.
    pub name: String,
    /// The woven section's outline on the pictures, as an SVG path in pixels (one triangle per subpath).
    pub path: String,
    /// The silhouette's outline, which can differ (the woven Door of Time adds the Master Sword, which the woven
    /// All Sage leaves out). `None` when the game has no silhouette for it (only woven or empty).
    pub shadow: Option<String>,
    /// The woven outline's bounding box in pixels: x, y, width, height.
    pub bounds: [u32; 4],
}

/// The tapestry's size and sections, from the player's game files.
pub fn tapestry_index(files: &GameFiles) -> Result<Tapestry, Error> {
    let d = files.load(&format!("Tex/{}.bntx.zs", LAYERS[0].1))?;
    let t = bntx_textures(&d)?.into_iter().next().ok_or_else(|| Error::Game("no tapestry picture".into()))?;
    let (w, h) = (t.width as f32, t.height as f32);
    let mut sections = vec![];
    for file in files.list("Model") {
        let Some(name) = file.strip_prefix(MODEL_PREFIX).and_then(|n| n.strip_suffix("_Complete.bfres.zs")) else {
            continue;
        };
        let (path, bounds) = outline(&section_triangles(&files.load(&format!("Model/{file}"))?)?, w, h);
        if path.is_empty() {
            continue;
        }
        let plain = format!("Model/{MODEL_PREFIX}{name}.bfres.zs");
        let shadow =
            if files.exists(&plain) { Some(outline(&section_triangles(&files.load(&plain)?)?, w, h).0) } else { None };
        sections.push(Section { name: name.to_string(), path, shadow, bounds });
    }
    if sections.is_empty() {
        return Err(Error::Game("no tapestry sections found".into()));
    }
    Ok(Tapestry { width: t.width, height: t.height, sections })
}

/// Texture-coordinate triangles as an SVG path in pixels, and their bounding box.
fn outline(tris: &[[(f32, f32); 3]], w: f32, h: f32) -> (String, [u32; 4]) {
    let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, 0f32, 0f32);
    let mut path = String::new();
    for t in tris {
        for (k, (u, v)) in t.iter().enumerate() {
            let (x, y) = (u * w, v * h);
            (x0, y0, x1, y1) = (x0.min(x), y0.min(y), x1.max(x), y1.max(y));
            path.push_str(&format!("{}{:.1} {:.1}", if k == 0 { "M" } else { "L" }, x, y));
        }
        path.push('Z');
    }
    (path, [x0 as u32, y0 as u32, (x1 - x0).ceil() as u32, (y1 - y0).ceil() as u32])
}

/// One of the three tapestry pictures: `base`, `shadow` or `woven`.
pub fn tapestry_image(files: &GameFiles, layer: &str) -> Result<Image, Error> {
    let (_, tex) = LAYERS
        .iter()
        .find(|(l, _)| *l == layer)
        .ok_or_else(|| Error::Game(format!("unknown tapestry layer {layer:?}")))?;
    let d = files.load(&format!("Tex/{tex}.bntx.zs"))?;
    let t = bntx_textures(&d)?.into_iter().next().ok_or_else(|| Error::Game(format!("{tex} has no texture")))?;
    decode(&d, &t)
}

/// The texture-coordinate triangles of every shape in a section model, in 0..1.
fn section_triangles(d: &[u8]) -> Result<Vec<[(f32, f32); 3]>, Error> {
    let bad = || Error::Game("unexpected tapestry model layout".into());
    let u16_ = |o: usize| d.get(o..o + 2).map(|b| u16::from_le_bytes([b[0], b[1]])).ok_or_else(bad);
    let u32_ = |o: usize| d.get(o..o + 4).map(|b| u32::from_le_bytes(b.try_into().unwrap())).ok_or_else(bad);
    let ptr = |o: usize| d.get(o..o + 8).map(|b| u64::from_le_bytes(b.try_into().unwrap()) as usize).ok_or_else(bad);
    if !d.starts_with(b"FRES") {
        return Err(bad());
    }
    let base = ptr(ptr(0xB0)? + 8)?;
    let mut out = vec![];
    let mut at = 0;
    while let Some(i) = d[at..].windows(4).position(|w| w == b"FSHP") {
        let shape = at + i;
        at = shape + 4;
        let (vb, mesh) = (ptr(shape + 0x10)?, ptr(shape + 0x18)?);
        if d.get(vb..vb + 4) != Some(b"FVTX") {
            return Err(bad());
        }
        let (attrs, stride, voff, nattr, nvert) = (
            ptr(vb + 8)?,
            u32_(ptr(vb + 0x38)?)? as usize,
            u32_(vb + 0x48)? as usize,
            *d.get(vb + 0x4C).ok_or_else(bad)? as usize,
            u32_(vb + 0x50)? as usize,
        );
        let mut uv_at = None;
        for k in 0..nattr {
            let a = attrs + 0x10 * k;
            let name = ptr(a)?;
            let len = u16_(name)? as usize;
            if d.get(name + 2..name + 2 + len) == Some(b"_u0") {
                if u32_(a + 8)? != 0x1201 {
                    return Err(Error::Game("tapestry texture coordinates in an unknown format".into()));
                }
                uv_at = Some(u16_(a + 12)? as usize);
            }
        }
        let uv_at = uv_at.ok_or_else(bad)?;
        let uv = (0..nvert)
            .map(|k| {
                let o = base + voff + stride * k + uv_at;
                Ok((u16_(o)? as f32 / 65535.0, u16_(o + 2)? as f32 / 65535.0))
            })
            .collect::<Result<Vec<_>, Error>>()?;
        if u32_(mesh + 0x24)? != 3 || u32_(mesh + 0x28)? != 1 {
            return Err(Error::Game("tapestry mesh is not u16 triangles".into()));
        }
        let (ioff, count) = (u32_(mesh + 0x20)? as usize, u32_(mesh + 0x2C)? as usize);
        let idx =
            (0..count).map(|k| u16_(base + ioff + 2 * k).map(|i| i as usize)).collect::<Result<Vec<_>, Error>>()?;
        for t in idx.chunks_exact(3) {
            let p = |i: usize| uv.get(i).copied().ok_or_else(bad);
            out.push([p(t[0])?, p(t[1])?, p(t[2])?]);
        }
    }
    Ok(out)
}

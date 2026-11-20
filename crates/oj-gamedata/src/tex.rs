//! Textures from the player's own game files (BNTX), decoded to RGBA so the app can show the game's own map pictures.
//! Read-only and local: decoded images are only ever kept on the player's PC. Nothing here ships any game data.
//!
//! BNTX layout as used here: each texture is a `BRTI` block with its format at 0x1C, size at 0x24, block-height log2
//! in the low bits of 0x34, image size at 0x50, name pointer at 0x60 and a pointer to the mip offset table at 0x70.
//! The data is block linear with the **Switch 2** GOB layout (the files are `Nin_Ounce_NVN2`; the Tegra X1 layout gives
//! a scrambled picture). The layout follows Longshot's `gpu/vk/texture_tiles.h` (GPL-3.0). Verified by decoding the
//! map textures and icons and checking them by eye; formats not seen in these files are rejected rather than guessed.

use crate::Error;

#[derive(Debug, Clone)]
pub struct TexInfo {
    pub name: String,
    pub format: u32,
    pub width: u32,
    pub height: u32,
    block_height_log2: u32,
    data_offset: usize,
    data_size: usize,
}

/// An 8-bit RGBA image, row-major, no padding.
#[derive(Debug, Clone)]
pub struct Image {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

fn u16_at(d: &[u8], o: usize) -> Result<u16, Error> {
    d.get(o..o + 2).map(|b| u16::from_le_bytes([b[0], b[1]])).ok_or_else(|| Error::Game("BNTX: truncated".into()))
}
fn u32_at(d: &[u8], o: usize) -> Result<u32, Error> {
    d.get(o..o + 4).map(|b| u32::from_le_bytes(b.try_into().unwrap())).ok_or_else(|| Error::Game("BNTX: truncated".into()))
}
fn u64_at(d: &[u8], o: usize) -> Result<u64, Error> {
    d.get(o..o + 8).map(|b| u64::from_le_bytes(b.try_into().unwrap())).ok_or_else(|| Error::Game("BNTX: truncated".into()))
}

/// Every texture in a BNTX file.
pub fn bntx_textures(d: &[u8]) -> Result<Vec<TexInfo>, Error> {
    if d.get(..4) != Some(b"BNTX") {
        return Err(Error::Game("not a BNTX file".into()));
    }
    let mut out = Vec::new();
    let mut i = 0;
    while let Some(p) = d[i..].windows(4).position(|w| w == b"BRTI") {
        let b = i + p;
        let name_at = u64_at(d, b + 0x60)? as usize;
        let len = u16_at(d, name_at)? as usize;
        let name = String::from_utf8_lossy(d.get(name_at + 2..name_at + 2 + len).unwrap_or_default()).into_owned();
        let mips_at = u64_at(d, b + 0x70)? as usize;
        out.push(TexInfo {
            name,
            format: u32_at(d, b + 0x1C)?,
            width: u32_at(d, b + 0x24)?,
            height: u32_at(d, b + 0x28)?,
            block_height_log2: u32_at(d, b + 0x34)? & 7,
            data_offset: u64_at(d, mips_at)? as usize,
            data_size: u32_at(d, b + 0x50)? as usize,
        });
        i = b + 4;
    }
    Ok(out)
}

#[derive(Clone, Copy, PartialEq)]
enum Bc {
    B1,
    B2,
    B3,
    B4,
    B5,
    B7,
}

enum Kind {
    Astc(u32, u32),
    Bc(Bc, u32),
    Plain(u32),
}

fn kind(format: u32) -> Option<Kind> {
    let astc = [(4, 4), (5, 4), (5, 5), (6, 5), (6, 6), (8, 5), (8, 6), (8, 8), (10, 5), (10, 6), (10, 8), (10, 10), (12, 10), (12, 12)];
    Some(match format >> 8 {
        t @ 0x2d..=0x3a => {
            let (w, h) = astc[(t - 0x2d) as usize];
            Kind::Astc(w, h)
        }
        0x1a => Kind::Bc(Bc::B1, 8),
        0x1b => Kind::Bc(Bc::B2, 16),
        0x1c => Kind::Bc(Bc::B3, 16),
        0x1d => Kind::Bc(Bc::B4, 8),
        0x1e => Kind::Bc(Bc::B5, 16),
        0x20 => Kind::Bc(Bc::B7, 16),
        0x02 => Kind::Plain(1),
        0x09 => Kind::Plain(2),
        0x0b => Kind::Plain(4),
        _ => return None,
    })
}

/// Block linear to linear rows. A GOB is 64 bytes by 8 rows (512 bytes); GOBs stack `1 << tile_h` high into blocks,
/// and blocks run left to right, then down. Inside a Switch 2 GOB, row `r` is four 16-byte pieces at
/// `(r & 3) * 16 + (r >> 2) * 128` plus 0, 64, 256 and 320.
fn unswizzle(src: &[u8], row_bytes: usize, rows: usize, tile_h: usize) -> Option<Vec<u8>> {
    let columns = row_bytes.div_ceil(64);
    let pitch = columns * 64;
    let gob_rows = rows.div_ceil(8);
    let per_block = 1usize << tile_h;
    let padded = gob_rows.div_ceil(per_block) * per_block;
    if src.len() < padded * columns * 512 {
        return None;
    }
    let mut out = vec![0u8; gob_rows * 8 * pitch];
    for y in 0..gob_rows {
        let top = y & !(per_block - 1);
        for x in 0..columns {
            let gob = &src[(top * columns + x * per_block + (y - top)) * 512..][..512];
            for r in 0..8 {
                let at = (r & 3) * 16 + (r >> 2) * 128;
                let o = (y * 8 + r) * pitch + x * 64;
                for (i, piece) in [0, 64, 256, 320].into_iter().enumerate() {
                    out[o + i * 16..o + i * 16 + 16].copy_from_slice(&gob[at + piece..at + piece + 16]);
                }
            }
        }
    }
    // (drop the padding: rows of exactly `row_bytes`)
    Some((0..rows).flat_map(|r| out[r * pitch..r * pitch + row_bytes].iter().copied()).collect())
}

/// Decodes the first mip of a texture to RGBA. Single-channel formats come out as grey with full alpha;
/// two-channel ones as grey with the second channel as alpha.
pub fn decode(d: &[u8], t: &TexInfo) -> Result<Image, Error> {
    let k = kind(t.format).ok_or_else(|| Error::Game(format!("texture {} has an unsupported format {:#x}", t.name, t.format)))?;
    let src = d.get(t.data_offset..t.data_offset + t.data_size).ok_or_else(|| Error::Game("BNTX: data out of range".into()))?;
    let (bw, bh, bpb) = match k {
        Kind::Astc(w, h) => (w, h, 16),
        Kind::Bc(_, n) => (4, 4, n),
        Kind::Plain(n) => (1, 1, n),
    };
    let row_bytes = t.width.div_ceil(bw) as usize * bpb as usize;
    let rows = t.height.div_ceil(bh) as usize;
    let linear = unswizzle(src, row_bytes, rows, t.block_height_log2 as usize).ok_or_else(|| Error::Game(format!("texture {}: too little data", t.name)))?;
    let (w, h) = (t.width as usize, t.height as usize);
    let mut px = vec![0u32; w * h];
    let res = match k {
        Kind::Astc(fw, fh) => texture2ddecoder::decode_astc(&linear, w, h, fw as usize, fh as usize, &mut px),
        Kind::Bc(f, _) => match f {
            Bc::B1 => texture2ddecoder::decode_bc1a(&linear, w, h, &mut px),
            Bc::B2 => texture2ddecoder::decode_bc2(&linear, w, h, &mut px),
            Bc::B3 => texture2ddecoder::decode_bc3(&linear, w, h, &mut px),
            Bc::B4 => texture2ddecoder::decode_bc4(&linear, w, h, &mut px),
            Bc::B5 => texture2ddecoder::decode_bc5(&linear, w, h, &mut px),
            Bc::B7 => texture2ddecoder::decode_bc7(&linear, w, h, &mut px),
        },
        Kind::Plain(n) => {
            for (p, s) in px.iter_mut().zip(linear.chunks_exact(n as usize)) {
                let [r, g, b, a] = match n {
                    1 => [s[0], s[0], s[0], 255],
                    2 => [s[0], s[0], s[0], s[1]],
                    _ => [s[0], s[1], s[2], s[3]],
                };
                *p = u32::from_le_bytes([b, g, r, a]);
            }
            Ok(())
        }
    };
    res.map_err(|e| Error::Game(format!("texture {}: {e}", t.name)))?;
    // The decoder writes BGRA words; single-channel BC4 comes out in red, shown here as grey.
    let grey = matches!(k, Kind::Bc(Bc::B4, _));
    let mut rgba = Vec::with_capacity(w * h * 4);
    for p in px {
        let [b, g, r, a] = p.to_le_bytes();
        rgba.extend_from_slice(&if grey { [r, r, r, 255] } else { [r, g, b, a] });
    }
    Ok(Image { width: t.width, height: t.height, rgba })
}

impl Image {
    pub fn png(&self) -> Result<Vec<u8>, Error> {
        let mut out = Vec::new();
        let mut enc = png::Encoder::new(&mut out, self.width, self.height);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_compression(png::Compression::Fast);
        let mut w = enc.write_header().map_err(|e| Error::Game(e.to_string()))?;
        w.write_image_data(&self.rgba).map_err(|e| Error::Game(e.to_string()))?;
        w.finish().map_err(|e| Error::Game(e.to_string()))?;
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::unswizzle;

    /// Builds a block-linear surface the documented way round, then reads it back.
    #[test]
    fn unswizzles_the_switch_2_gob_layout() {
        let (row_bytes, rows, tile_h) = (128usize, 24usize, 1usize);
        let linear: Vec<u8> = (0..row_bytes * rows).map(|i| (i * 7 % 251) as u8).collect();
        let (columns, per_block) = (row_bytes / 64, 1usize << tile_h);
        let padded = rows.div_ceil(8).div_ceil(per_block) * per_block;
        let mut src = vec![0u8; padded * columns * 512];
        for y in 0..rows / 8 {
            let top = y & !(per_block - 1);
            for x in 0..columns {
                let gob = (top * columns + x * per_block + (y - top)) * 512;
                for r in 0..8 {
                    for (i, piece) in [0, 64, 256, 320].into_iter().enumerate() {
                        let at = gob + (r & 3) * 16 + (r >> 2) * 128 + piece;
                        let from = (y * 8 + r) * row_bytes + x * 64 + i * 16;
                        src[at..at + 16].copy_from_slice(&linear[from..from + 16]);
                    }
                }
            }
        }
        assert_eq!(unswizzle(&src, row_bytes, rows, tile_h).unwrap(), linear);
        assert!(unswizzle(&src[..100], row_bytes, rows, tile_h).is_none());
    }
}

//! The game's own ocarina sounds, decoded from the player's files for the app to play. Nothing is copied into the app:
//! each sound is read from `romfs/Sound/Resource/Stream/<name>.bwav` when asked for and handed over as a WAV.
//!
//! BWAV layout [V: read from Ocarina_D.bwav and friends]: "BWAV", byte-order mark, version, CRC, prefetch flag, then a
//! u16 channel count at 0x0E. One 0x4C-byte record per channel from 0x10: codec u16 (1 = DSP-ADPCM), pan u16, sample
//! rate u32, sample count u32, prefetch sample count u32, 16 i16 predictor coefficients, then the data offset u32 at
//! +0x30. DSP-ADPCM frames are 8 bytes: a predictor/scale byte and 14 four-bit samples.

use crate::files::GameFiles;
use crate::Error;

/// Names the app may ask for: single notes (`Ocarina_A`, `Piccolo_HighD`, ...), the game's recordings of each song
/// (`Ocarina_ZeldaLullaby`) and the ocarina window's success sound.
pub fn allowed(name: &str) -> bool {
    let ok_chars = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric());
    match name.split_once('_') {
        Some(("Ocarina" | "Piccolo", rest)) => ok_chars(rest),
        _ => name == "SE_Sys_OcarinaWindow_Success00",
    }
}

/// One sound as a 16-bit PCM WAV (at most two channels, at most `max_secs` long).
pub fn wav(files: &GameFiles, name: &str, max_secs: f32) -> Result<Vec<u8>, Error> {
    if !allowed(name) {
        return Err(Error::Game(format!("not a sound the app plays: {name}")));
    }
    let data = files.raw(&format!("Sound/Resource/Stream/{name}.bwav"))?;
    let (rate, channels) = decode(&data)?;
    let keep = channels.len().min(2);
    let len = channels.iter().map(Vec::len).min().unwrap_or(0).min((rate as f32 * max_secs) as usize);
    Ok(to_wav(rate, &channels[..keep], len))
}

/// Every channel of a BWAV, decoded.
pub fn decode(d: &[u8]) -> Result<(u32, Vec<Vec<i16>>), Error> {
    let bad = || Error::Game("not a BWAV sound the app can read".into());
    if d.get(..4) != Some(b"BWAV") {
        return Err(bad());
    }
    let u16_at = |o: usize| d.get(o..o + 2).map(|b| u16::from_le_bytes([b[0], b[1]])).ok_or_else(bad);
    let u32_at = |o: usize| d.get(o..o + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]])).ok_or_else(bad);
    let count = u16_at(0x0E)? as usize;
    let mut rate = 0;
    let mut out = vec![];
    for c in 0..count {
        let rec = 0x10 + 0x4C * c;
        if u16_at(rec)? != 1 {
            return Err(Error::Game("this sound is not DSP-ADPCM".into()));
        }
        rate = u32_at(rec + 4)?;
        let samples = u32_at(rec + 8)? as usize;
        let coefs: Vec<i32> =
            (0..16).map(|i| u16_at(rec + 0x10 + 2 * i).map(|v| v as i16 as i32)).collect::<Result<_, _>>()?;
        let start = u32_at(rec + 0x30)? as usize;
        out.push(dsp_adpcm(d.get(start..).ok_or_else(bad)?, &coefs, samples));
    }
    Ok((rate, out))
}

/// Standard GameCube/Switch DSP-ADPCM.
fn dsp_adpcm(d: &[u8], coefs: &[i32], samples: usize) -> Vec<i16> {
    let mut out = Vec::with_capacity(samples);
    let (mut h1, mut h2) = (0i32, 0i32);
    for frame in d.chunks(8) {
        let header = frame[0];
        let scale = 1i32 << (header & 0x0F);
        let k = ((header >> 4) as usize & 7) * 2;
        let (c1, c2) = (coefs[k], coefs[k + 1]);
        for i in 0..14 {
            if out.len() >= samples {
                return out;
            }
            let Some(&byte) = frame.get(1 + i / 2) else { return out };
            let nibble = if i % 2 == 0 { byte >> 4 } else { byte & 0x0F } as i32;
            let nibble = if nibble >= 8 { nibble - 16 } else { nibble };
            let s = (((nibble * scale) << 11) + 1024 + c1 * h1 + c2 * h2) >> 11;
            let s = s.clamp(i16::MIN as i32, i16::MAX as i32);
            out.push(s as i16);
            h2 = h1;
            h1 = s;
        }
    }
    out
}

fn to_wav(rate: u32, channels: &[Vec<i16>], len: usize) -> Vec<u8> {
    let ch = channels.len().max(1) as u16;
    let bytes = len as u32 * ch as u32 * 2;
    let mut w = Vec::with_capacity(44 + bytes as usize);
    w.extend_from_slice(b"RIFF");
    w.extend_from_slice(&(36 + bytes).to_le_bytes());
    w.extend_from_slice(b"WAVEfmt ");
    w.extend_from_slice(&16u32.to_le_bytes());
    w.extend_from_slice(&1u16.to_le_bytes());
    w.extend_from_slice(&ch.to_le_bytes());
    w.extend_from_slice(&rate.to_le_bytes());
    w.extend_from_slice(&(rate * ch as u32 * 2).to_le_bytes());
    w.extend_from_slice(&(ch * 2).to_le_bytes());
    w.extend_from_slice(&16u16.to_le_bytes());
    w.extend_from_slice(b"data");
    w.extend_from_slice(&bytes.to_le_bytes());
    for i in 0..len {
        for c in channels {
            w.extend_from_slice(&c[i].to_le_bytes());
        }
    }
    w
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_ocarina_sounds_are_allowed() {
        assert!(allowed("Ocarina_HighD"));
        assert!(allowed("Piccolo_Asharp"));
        assert!(allowed("Ocarina_ZeldaLullaby"));
        assert!(!allowed("Ocarina_../x"));
        assert!(!allowed("BGM_Title"));
        assert!(!allowed("Ocarina_"));
    }

    #[test]
    fn decodes_a_silent_frame() {
        // One channel, DSP-ADPCM, 14 samples of silence.
        let mut d = vec![0u8; 0x10 + 0x4C];
        d[..4].copy_from_slice(b"BWAV");
        d[0x0E] = 1;
        d[0x10] = 1;
        d[0x14..0x18].copy_from_slice(&48000u32.to_le_bytes());
        d[0x18..0x1C].copy_from_slice(&14u32.to_le_bytes());
        let start = d.len() as u32;
        d[0x40..0x44].copy_from_slice(&start.to_le_bytes());
        d.extend_from_slice(&[0; 8]);
        let (rate, ch) = decode(&d).unwrap();
        assert_eq!((rate, ch.len(), ch[0].len()), (48000, 1, 14));
        assert!(ch[0].iter().all(|&s| s == 0));
        let w = to_wav(rate, &ch, 14);
        assert_eq!(&w[..4], b"RIFF");
        assert_eq!(w.len(), 44 + 28);
    }
}

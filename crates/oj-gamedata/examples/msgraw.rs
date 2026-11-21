//! Dev helper: print one message file's raw text with control tags shown as {group:type:params}.
//! cargo run -p oj-gamedata --example msgraw -- <game dir> <file name part> [label part]
use oj_gamedata::files::GameFiles;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let g = GameFiles::open(std::path::Path::new(&a[1])).unwrap();
    let rel = g.versioned("Mals", "USen.Product.", ".sarc.zs").unwrap();
    for (name, d) in g.sarc(&rel).unwrap() {
        if !name.contains(&a[2]) { continue }
        // Text section: every UTF-8 run, with 0x0E tags expanded. Labels are not matched; print all messages.
        let p = d.windows(4).position(|w| w == b"TXT2").unwrap();
        let size = u32::from_le_bytes(d[p + 4..p + 8].try_into().unwrap()) as usize;
        let body = &d[p + 16..p + 16 + size];
        let n = u32::from_le_bytes(body[0..4].try_into().unwrap()) as usize;
        for i in 0..n {
            let s = u32::from_le_bytes(body[4 + 4 * i..8 + 4 * i].try_into().unwrap()) as usize;
            let e = if i + 1 < n { u32::from_le_bytes(body[8 + 4 * i..12 + 4 * i].try_into().unwrap()) as usize } else { body.len() };
            let raw = &body[s..e];
            let (mut out, mut j) = (String::new(), 0);
            while j < raw.len() && raw[j] != 0 {
                if raw[j] == 0x0E && j + 7 <= raw.len() {
                    let grp = u16::from_le_bytes([raw[j + 1], raw[j + 2]]);
                    let typ = u16::from_le_bytes([raw[j + 3], raw[j + 4]]);
                    let len = u16::from_le_bytes([raw[j + 5], raw[j + 6]]) as usize;
                    let prm: Vec<String> = raw[j + 7..(j + 7 + len).min(raw.len())].iter().map(|b| format!("{b:02x}")).collect();
                    out.push_str(&format!("{{{grp}:{typ}:{}}}", prm.join("")));
                    j += 7 + len;
                } else { out.push(raw[j] as char); j += 1; }
            }
            if a.get(3).is_none_or(|w| out.contains(w.as_str())) { println!("{name}#{i}: {out}"); }
        }
    }
}

//! Dev helper: print one BYML file from the game as JSON-like text.
//! cargo run -p oj-gamedata --example bymldump -- <game dir> <romfs-relative path>
use oj_gamedata::files::{GameFiles, Key, Val};
fn show(v: &Val, d: usize, out: &mut String) {
    let pad = "  ".repeat(d);
    match v {
        Val::Arr(a) => {
            out.push_str("[\n");
            for x in a {
                out.push_str(&pad);
                out.push_str("  ");
                show(x, d + 1, out);
                out.push('\n');
            }
            out.push_str(&pad);
            out.push(']');
        }
        Val::Map(m) => {
            out.push_str("{\n");
            for (k, x) in m {
                let k = match k {
                    Key::S(s) => s.clone(),
                    Key::H(i) => format!("{i:#x}"),
                };
                out.push_str(&format!("{pad}  {k}: "));
                show(x, d + 1, out);
                out.push('\n');
            }
            out.push_str(&pad);
            out.push('}');
        }
        other => out.push_str(&format!("{other:?}")),
    }
}
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let g = GameFiles::open(std::path::Path::new(&a[1])).unwrap();
    let mut s = String::new();
    show(&g.byml(&a[2]).unwrap(), 0, &mut s);
    println!("{s}");
}

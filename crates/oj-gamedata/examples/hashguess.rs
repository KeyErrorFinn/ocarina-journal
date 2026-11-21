//! Dev helper: murmur3 of candidate names, to name enum hashes. cargo run -p oj-gamedata --example hashguess -- a b c
fn main() { for s in std::env::args().skip(1) { println!("{} {}", oj_savefile::murmur3_32(s.as_bytes()), s); } }

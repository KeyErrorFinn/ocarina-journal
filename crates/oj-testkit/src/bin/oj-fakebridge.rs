//! `oj-fakebridge [pipe-name] [ms-per-event]`: replay the recorded session on a local pipe so the
//! app can be developed without launching the game. Windows only (the real bridge uses a pipe).

#[cfg(windows)]
#[tokio::main]
async fn main() -> std::io::Result<()> {
    let mut args = std::env::args().skip(1);
    let name = args.next().unwrap_or_else(|| "oj-fake".into());
    let ms: u64 = args.next().and_then(|s| s.parse().ok()).unwrap_or(100);
    eprintln!("fake bridge on \\\\.\\pipe\\{name}, one event every {ms} ms (Ctrl-C to stop)");
    oj_testkit::serve_pipe(&name, oj_testkit::Fixture::session(), std::time::Duration::from_millis(ms)).await
}

#[cfg(not(windows))]
fn main() {
    eprintln!("oj-fakebridge only supports Windows named pipes");
}

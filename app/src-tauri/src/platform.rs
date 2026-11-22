//! Host paths and executable names. See docs/research/LINUX.md for the upstream evidence behind them.
use std::path::{Path, PathBuf};

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}

pub fn data_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    let dir = PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("OcarinaJournal");
    #[cfg(unix)]
    let dir = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| Some(home_dir()?.join(".local/share")))?
        .join("ocarina-journal");
    #[cfg(unix)]
    {
        use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
        std::fs::DirBuilder::new().recursive(true).mode(0o700).create(&dir).ok()?;
        // The control socket lives here and Longshot refuses a folder others can write to, so keep it private even
        // when it already existed with looser permissions.
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).ok()?;
    }
    #[cfg(windows)]
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

pub fn game_binary(dir: &Path) -> PathBuf {
    dir.join("bin").join(if cfg!(windows) { "longshot.exe" } else { "longshot" })
}

pub fn is_game_process(name: &str) -> bool {
    if cfg!(windows) {
        name.eq_ignore_ascii_case("longshot.exe")
    } else {
        name == "longshot"
    }
}

pub fn bridge_endpoint() -> String {
    if let Ok(value) = std::env::var("OJ_PIPE") {
        return value;
    }
    #[cfg(windows)]
    return "longshot".into();
    #[cfg(unix)]
    data_dir().map(|p| p.join("control.sock").to_string_lossy().into_owned()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_packaged_game_not_the_launcher() {
        let root = std::env::temp_dir().join("oj-synthetic-layout");
        let name = if cfg!(windows) { "longshot.exe" } else { "longshot" };
        assert_eq!(game_binary(&root), root.join("bin").join(name));
        assert!(is_game_process(name));
        assert!(!is_game_process("LongshotLauncher"));
        assert!(!is_game_process("unrelated-game"));
    }
}

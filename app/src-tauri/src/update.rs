//! Telling the player that a newer release exists.
//!
//! This is the app's only network call. It runs only when the player presses "Check for updates", or at start-up if
//! they have not switched that off (it starts on). It sends one plain HTTPS GET to GitHub's public release API, with no
//! identifier and no body, and only reads the answer. It never downloads or installs anything: the player opens the
//! release page and installs it themselves.

use serde::{Deserialize, Serialize};

const API: &str = "https://api.github.com/repos/KeyErrorFinn/ocarina-journal/releases/latest";
/// The only address the app will ever open from a release answer.
const RELEASES_PREFIX: &str = "https://github.com/KeyErrorFinn/ocarina-journal/releases/";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateInfo {
    /// The newest published release, without the leading `v`.
    pub latest: String,
    /// The release page, always under `RELEASES_PREFIX`.
    pub url: String,
    /// True when `latest` is newer than the running app.
    pub newer: bool,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

/// `1.2.3` or `v1.2.3` as numbers; anything else (including a pre-release suffix) is not a version we compare.
fn parse_version(text: &str) -> Option<(u64, u64, u64)> {
    let mut parts = text.trim().trim_start_matches('v').split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    parts.next().is_none().then_some((major, minor, patch))
}

/// Reads GitHub's answer. `None` for a draft, a pre-release, an unreadable tag or a link outside this project.
fn read_release(body: &str, current: &str) -> Option<UpdateInfo> {
    let release: Release = serde_json::from_str(body).ok()?;
    if release.draft || release.prerelease || !release.html_url.starts_with(RELEASES_PREFIX) {
        return None;
    }
    let latest = parse_version(&release.tag_name)?;
    let running = parse_version(current)?;
    Some(UpdateInfo {
        latest: release.tag_name.trim_start_matches('v').to_string(),
        url: release.html_url,
        newer: latest > running,
    })
}

/// Asks GitHub for the newest release. Blocking: call it off the UI thread.
pub fn check(current: &str) -> Result<UpdateInfo, String> {
    let agent: ureq::Agent =
        ureq::Agent::config_builder().timeout_global(Some(std::time::Duration::from_secs(10))).build().into();
    let mut response = agent
        .get(API)
        .header("User-Agent", "ocarina-journal-update-check")
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|_| "Couldn't reach GitHub. Check your connection and try again.".to_string())?;
    let body = response
        .body_mut()
        .with_config()
        .limit(1 << 20)
        .read_to_string()
        .map_err(|_| "GitHub's answer couldn't be read.".to_string())?;
    read_release(&body, current).ok_or_else(|| "GitHub's answer wasn't a release this app understands.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn answer(tag: &str, url: &str, prerelease: bool) -> String {
        format!(r#"{{"tag_name":"{tag}","html_url":"{url}","draft":false,"prerelease":{prerelease}}}"#)
    }
    const URL: &str = "https://github.com/KeyErrorFinn/ocarina-journal/releases/tag/v1.2.1";

    #[test]
    fn versions_compare_as_numbers() {
        assert_eq!(parse_version("v1.10.0"), Some((1, 10, 0)));
        assert!(parse_version("v1.10.0") > parse_version("1.9.9"));
        assert_eq!(parse_version("1.2"), None);
        assert_eq!(parse_version("1.2.3-rc1"), None);
    }

    #[test]
    fn newer_same_and_older() {
        assert!(read_release(&answer("v1.2.1", URL, false), "1.2.0").unwrap().newer);
        assert!(!read_release(&answer("v1.2.0", URL, false), "1.2.0").unwrap().newer);
        assert!(!read_release(&answer("v1.1.1", URL, false), "1.2.0").unwrap().newer);
    }

    #[test]
    fn refuses_prereleases_and_foreign_links() {
        assert!(read_release(&answer("v1.3.0", URL, true), "1.2.0").is_none());
        assert!(read_release(&answer("v1.3.0", "https://example.com/releases/", false), "1.2.0").is_none());
        assert!(read_release("not json", "1.2.0").is_none());
    }
}

"""Print release changelogs, including every patch back through the current minor release."""

import argparse
from pathlib import Path
import re


def release_notes(changelog: str, version: str) -> str:
    major, minor, patch = map(int, version.split("."))
    sections = list(re.finditer(r"^## (\d+\.\d+\.\d+) - .+$", changelog, re.MULTILINE))
    versions = [match[1] for match in sections]
    first = versions.index(version)
    last = versions.index(f"{major}.{minor}.0") if patch else first
    if last < first:
        raise ValueError("Changelog must be ordered newest first")
    selected = sections[first:last + 1]
    if any(tuple(map(int, match[1].split(".")[:2])) != (major, minor) for match in selected):
        raise ValueError("Changelog crosses a minor release unexpectedly")
    end = sections[last + 1].start() if last + 1 < len(sections) else len(changelog)
    return changelog[sections[first].start():end].strip() + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", help="Release version, for example 1.3.1")
    args = parser.parse_args()
    changelog = Path(__file__).resolve().parents[1] / "CHANGELOG.md"
    print(release_notes(changelog.read_text(encoding="utf-8"), args.version), end="")

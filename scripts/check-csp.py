"""Checks that the app's Content Security Policy allows what the frontend code does.

The installed app enforces the policy in app/src-tauri/tauri.conf.json; `tauri dev` does not, so a missing source
only shows up in a release build (1.0.0 and 1.1.0 shipped without `blob:` in img-src, and the game maps were blank).
This is a static check; scripts/smoke-windows.mjs loads the built app under the real policy.
"""
import json
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent.parent
conf = json.loads((root / "app/src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
csp = conf["app"]["security"]["csp"]
directives = {}
for part in csp.split(";"):
    words = part.split()
    if words:
        directives[words[0]] = words[1:]


def allows(directive, source):
    return source in directives.get(directive, directives.get("default-src", []))


source = "\n".join(
    p.read_text(encoding="utf-8", errors="replace")
    for p in (root / "app/src").rglob("*")
    if p.suffix in {".ts", ".tsx", ".css", ".html"}
) + (root / "app/index.html").read_text(encoding="utf-8")

problems = []
if "'unsafe-eval'" in csp:
    problems.append("the policy allows 'unsafe-eval'; nothing here needs it")
if directives.get("default-src") != ["'self'"]:
    problems.append("default-src should stay 'self'")

# Each rule: (what to look for in the frontend, the directive that must allow it, the source it needs).
needs = [
    (r"createObjectURL", "img-src", "blob:", "pictures made from game files are shown from blob: URLs (src/maps.ts)"),
    (r"data:image/", "img-src", "data:", "inline data: pictures"),
    (r"new Worker\(", "worker-src", "blob:", "web workers"),
    (r"new Audio\(|<audio|<video", "media-src", "blob:", "audio or video elements"),
    (r"\bfetch\((?!\s*[\"']/\.local/)", "connect-src", "'self'", "fetch calls"),
]
for pattern, directive, wanted, why in needs:
    if re.search(pattern, source) and not allows(directive, wanted):
        problems.append(f"{why}: {directive} must allow {wanted} (it has: {' '.join(directives.get(directive, ['(default-src)']))})")

if problems:
    print("Content Security Policy problems (app/src-tauri/tauri.conf.json):")
    for p in problems:
        print(" -", p)
    sys.exit(1)
print("Content Security Policy covers what the frontend uses:", csp)

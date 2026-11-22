"""Tripwire for the unused glib string iterator affected by RUSTSEC-2024-0429.

This source scan is conservative, not a formal reachability proof. See the dependency review.
"""
import json
import pathlib
import re
import subprocess

metadata = json.loads(subprocess.check_output([
    "cargo", "metadata", "--locked", "--format-version", "1",
    "--filter-platform", "x86_64-unknown-linux-gnu",
], text=True, encoding="utf-8"))
active = {node["id"] for node in metadata["resolve"]["nodes"]}
pattern = re.compile(r"\b(?:array_iter_str|VariantStrIter)\b")
definitions = {"src/lib.rs", "src/variant.rs", "src/variant_iter.rs"}
hits = []
packages = 0
for package in metadata["packages"]:
    if package["id"] not in active:
        continue
    packages += 1
    root = pathlib.Path(package["manifest_path"]).parent
    for path in (root / "src").rglob("*.rs"):
        relative = path.relative_to(root).as_posix()
        if package["name"] == "glib" and relative in definitions:
            continue  # Definitions, constructor, docs and tests in the locked upstream crate.
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if pattern.search(line):
                hits.append(f"{package['name']}/{relative}:{number}")
if hits:
    raise SystemExit("Review glib iterator references before shipping Linux:\n" + "\n".join(hits))
print(f"No glib string-iterator references outside its known definitions in {packages} locked packages.")

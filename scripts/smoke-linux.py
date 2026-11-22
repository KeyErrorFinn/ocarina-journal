"""Run under xvfb-run in an ephemeral Linux CI runner; no game or user data is supplied."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

with tempfile.TemporaryDirectory(prefix="oj-linux-smoke-") as temporary:
    root = Path(temporary)
    for mode in ("no-game", "synthetic-report"):
        data = root / mode
        env = {**os.environ, "XDG_DATA_HOME": str(data), "OJ_GAME": str(root / "missing-game"),
               "OJ_SAVE_DIR": str(root / "missing-save"), "GDK_BACKEND": "x11",
               "WEBKIT_DISABLE_COMPOSITING_MODE": "1", "LIBGL_ALWAYS_SOFTWARE": "1"}
        env.pop("OJ_TEST_REAL", None)
        env.pop("OJ_REPORT", None)
        if mode == "synthetic-report":
            report = root / "synthetic-report.json"
            report.write_text(json.dumps({"schema": 1, "game_revision": 0, "slot": "demo",
                                          "slots": [], "categories": [], "hall": [], "hall_open": False}))
            env["OJ_REPORT"] = str(report)
        with (root / f"{mode}.log").open("w+") as log:
            process = subprocess.Popen([sys.argv[1]], env=env, stdout=log, stderr=log)
            try:
                time.sleep(8)
                if process.poll() is not None:
                    log.seek(0)
                    raise RuntimeError(f"{mode}: app exited {process.returncode}: {log.read()}")
                windows = subprocess.check_output(["xwininfo", "-root", "-tree"], text=True)
                assert "Ocarina Journal" in windows, "App has no visible X11 window"
                journal_dir = data / "ocarina-journal"
                assert journal_dir.is_dir(), "Linux app-data directory was not created"
                assert journal_dir.stat().st_mode & 0o077 == 0, "App-data directory is not private"
                print(f"{mode}: process alive, X11 window present, private Linux app-data directory created")
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

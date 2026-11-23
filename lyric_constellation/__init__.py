"""Lyric Constellation: kinetic-typography lyrics for whatever Windows is playing.

This file runs first whenever any part of the package is imported. It holds the few things every other file
needs: the version number, where the app's files are, and two small helpers for reading and writing JSON files.
"""
import json
import os
import shutil
import sys
from pathlib import Path

__version__ = "1.0.0"

# ROOT: the folder with the app's own read-only files (ui/, songs.txt).
# When running from source it is the project folder. When running as the built .exe, PyInstaller unpacks
# those files into a temporary folder and tells us where through `sys._MEIPASS`.
ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))

# DATA: the folder for each user's own files (settings, lyrics cache, log): %APPDATA%\LyricConstellation.
# It is never the install folder, because that folder may be read-only (for example under Program Files).
DATA = Path(os.environ.get("APPDATA") or Path.home()) / "LyricConstellation"


def read_json(f, default=None):
    """Read a JSON file and return its data. If the file is missing or broken, return `default` instead."""
    try:
        return json.loads(Path(f).read_text("utf-8"))
    except (OSError, ValueError):
        return default


def write_json(f, data):
    """Save data to a JSON file safely.

    We first write to a temporary file and then swap it into place in one step. So if the app crashes
    halfway through writing, the old file is still there in one piece; we never leave half a file behind.
    """
    f = Path(f)
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_name(f.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    os.replace(tmp, f)


def migrate_old_data():
    """Before version 0.9 the cache and settings lived next to app.py. Copy them to DATA once, if they exist."""
    old = Path(__file__).resolve().parent.parent

    if (old / "cache").is_dir() and not (DATA / "cache").exists():
        shutil.copytree(old / "cache", DATA / "cache")

    if (old / "settings.json").is_file() and not (DATA / "settings.json").exists():
        DATA.mkdir(parents=True, exist_ok=True)
        shutil.copy2(old / "settings.json", DATA / "settings.json")

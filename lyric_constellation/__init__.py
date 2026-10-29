"""Lyric Constellation: kinetic-typography lyrics for whatever Windows is playing."""
import json, os, shutil, sys
from pathlib import Path

__version__ = "0.9.1"

# Read-only app files (ui/, songs.txt): next to the package, or inside the PyInstaller bundle.
ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
# Per-user files (settings, lyrics cache, log): never inside the install folder, which may be read-only.
DATA = Path(os.environ.get("APPDATA") or Path.home()) / "LyricConstellation"


def read_json(f, default=None):
    """A JSON file -> its data, or default when it is missing or damaged."""
    try:
        return json.loads(Path(f).read_text("utf-8"))
    except (OSError, ValueError):
        return default


def write_json(f, data):
    """Write JSON atomically: a crash mid-write leaves the old file, never half a file."""
    f = Path(f)
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_name(f.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    os.replace(tmp, f)


def migrate_old_data():
    """Before 0.9 the cache and settings lived next to app.py: copy them over once."""
    old = Path(__file__).resolve().parent.parent
    if (old / "cache").is_dir() and not (DATA / "cache").exists():
        shutil.copytree(old / "cache", DATA / "cache")
    if (old / "settings.json").is_file() and not (DATA / "settings.json").exists():
        DATA.mkdir(parents=True, exist_ok=True)
        shutil.copy2(old / "settings.json", DATA / "settings.json")

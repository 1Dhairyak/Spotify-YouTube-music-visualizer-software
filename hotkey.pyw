"""Ctrl+Alt+Z opens Music Sync; pressing it again closes it. Double-click this file to start it (no window).
Stop it from Task Manager (the pythonw process) or by restarting the PC."""
import ctypes, ctypes.wintypes as wt, subprocess, sys
from pathlib import Path

MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, WM_HOTKEY, WM_CLOSE = 0x1, 0x2, 0x4000, 0x312, 0x10
ROOT = Path(__file__).resolve().parent
user32 = ctypes.windll.user32

if not user32.RegisterHotKey(None, 1, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, ord("Z")):
    user32.MessageBoxW(None, "Ctrl+Alt+Z is already in use, probably because the Music Sync helper "
                             "is already running.", "Music Sync", 0x40)
    sys.exit()

msg = wt.MSG()
while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
    if msg.message != WM_HOTKEY:
        continue
    win = user32.FindWindowW(None, "Music Sync")
    if win:
        user32.PostMessageW(win, WM_CLOSE, 0, 0)  # normal close: the app shuts its second screen too
    else:
        subprocess.Popen([str(Path(sys.executable).with_name("pythonw.exe")), str(ROOT / "app.py")], cwd=ROOT)

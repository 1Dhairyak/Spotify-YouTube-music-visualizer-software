"""Ctrl+Alt+Z opens Music Sync; pressing it again closes it.

Double-click this file to start it: it runs invisibly in the background (.pyw files open no console window).
To stop it, end the "pythonw" process in Task Manager, or restart the PC.

It talks to Windows directly through `ctypes` (Python's way of calling Windows' own functions):
RegisterHotKey asks Windows to tell us whenever Ctrl+Alt+Z is pressed, anywhere.
"""
import ctypes
import ctypes.wintypes as wt
import subprocess
import sys
from pathlib import Path

# Windows' numeric codes for the keys and messages we use
MOD_ALT = 0x1
MOD_CONTROL = 0x2
MOD_NOREPEAT = 0x4000    # holding the keys down counts as one press
WM_HOTKEY = 0x312        # the message Windows sends when our hotkey is pressed
WM_CLOSE = 0x10          # the message that asks a window to close (like clicking its X)

ROOT = Path(__file__).resolve().parent
user32 = ctypes.windll.user32

if not user32.RegisterHotKey(None, 1, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, ord("Z")):
    user32.MessageBoxW(None, "Ctrl+Alt+Z is already in use, probably because the Music Sync helper "
                             "is already running.", "Music Sync", 0x40)
    sys.exit()

# Wait for messages from Windows, forever. GetMessageW sleeps until one arrives, so this uses no CPU.
msg = wt.MSG()
while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
    if msg.message != WM_HOTKEY:
        continue
    win = user32.FindWindowW(None, "Music Sync")   # is the app's window open?
    if win:
        user32.PostMessageW(win, WM_CLOSE, 0, 0)   # close it normally, so it closes its other screens too
    else:
        pythonw = Path(sys.executable).with_name("pythonw.exe")   # Python without a console window
        subprocess.Popen([str(pythonw), str(ROOT / "app.py")], cwd=ROOT)

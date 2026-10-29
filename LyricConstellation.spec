# PyInstaller build for the Windows download:  python -m PyInstaller LyricConstellation.spec
# Output: dist/LyricConstellation/LyricConstellation.exe (one folder, zipped for the GitHub Release).
from PyInstaller.utils.hooks import collect_all

datas, binaries, hidden = [("ui", "ui"), ("songs.txt", ".")], [], []
# packages that load data files or submodules at runtime, which the import scan alone misses
for pkg in ("webview", "winrt", "soundcard", "shazamio", "shazamio_core", "faster_whisper"):
    d, b, h = collect_all(pkg)
    datas += d; binaries += b; hidden += h

# big packages other installed libraries mention optionally; nothing this app uses needs them
a = Analysis(["app.py"], datas=datas, binaries=binaries, hiddenimports=hidden, excludes=["tkinter", "pytest", "pyarrow", "pandas", "scipy", "botocore", "boto3", "lxml", "PIL", "matplotlib", "IPython", "jupyter"])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="LyricConstellation", console=False)
coll = COLLECT(exe, a.binaries, a.datas, name="LyricConstellation")

@echo off
rem Starts Lyric Constellation from source (run install.bat once first). Add --demo to try it without music.
cd /d "%~dp0"
if not exist .venv\Scripts\pythonw.exe (
    echo Run install.bat first.
    pause
    exit /b 1
)
start "" .venv\Scripts\pythonw.exe app.py %*

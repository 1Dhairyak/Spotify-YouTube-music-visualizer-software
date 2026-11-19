@echo off
rem Sets up Lyric Constellation to run from source: makes a private Python environment (.venv) in this folder
rem and installs what the app needs into it. Run once; afterwards double-click run.bat.
rem (Only for running from source. The ready-made download needs none of this.)
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo Python was not found. Install Python 3.10 or newer from https://www.python.org/downloads/
    echo and tick "Add python.exe to PATH" during setup, then run this again.
    pause
    exit /b 1
)

echo Creating the .venv folder...
python -m venv .venv || goto :failed
echo Installing packages (a few minutes the first time)...
.venv\Scripts\python -m pip install --upgrade pip || goto :failed
.venv\Scripts\python -m pip install -r requirements.txt || goto :failed

echo.
echo Done. Double-click run.bat to start the app.
pause
exit /b 0

:failed
echo.
echo Something went wrong (see the messages above).
pause
exit /b 1

@echo off
REM Starts the Geo-Linguistic web service on this Windows laptop.
REM First run: creates a Python environment and installs packages (about 10 minutes, needs internet).
REM Later runs: starts in a few seconds and works offline.

cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel% neq 0 (
  echo Python is not installed. Install Python 3.11 from https://www.python.org/downloads/
  echo and tick "Add python.exe to PATH" during installation, then run this file again.
  pause
  exit /b 1
)

if not exist "model\model.pt" (
  echo The trained model is missing. Copy v31_best_model.pt into the "model" folder,
  echo rename it to model.pt, then run this file again. See model\README.txt.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating the Python environment...
  py -3.11 -m venv .venv || py -m venv .venv
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)

echo.
echo Starting the web service. Open http://localhost:8000 in your browser.
echo Press Ctrl+C in this window to stop it.
start "" http://localhost:8000
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause

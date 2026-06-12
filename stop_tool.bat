@echo off
cd /d "%~dp0"
echo Stopping RMS Warehouse Document Generator on port 5001...
set "found="

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5001 ^| findstr LISTENING') do (
    taskkill /f /pid %%a
    set "found=1"
)

if defined found (
    echo Tool stopped successfully.
) else (
    echo Tool does not seem to be running on port 5001.
)
pause

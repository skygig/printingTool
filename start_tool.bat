@echo off
cd /d "%~dp0"

echo =========================================
echo    RMS Warehouse Document Generator      
echo =========================================
echo.

:: If venv exists, jump to running the app
if exist venv goto :run_app

echo Virtual environment (venv) not found.
echo Initializing venv using your local Python installation...
python -m venv venv
if errorlevel 1 goto :venv_error

echo Installing dependencies...
call venv\Scripts\pip install --upgrade pip
call venv\Scripts\pip install Flask openpyxl reportlab python-docx werkzeug
if errorlevel 1 goto :install_error

:run_app
echo Starting Flask web server on port 5001...
echo This window will remain active. To stop the server, press Ctrl+C.
echo.
call venv\Scripts\python app.py
goto :eof

:venv_error
echo.
echo Error: Failed to create virtual environment. 
echo Please ensure Python is added to your system environment variables (PATH).
pause
exit /b

:install_error
echo.
echo Error: Failed to install dependencies.
pause
exit /b

@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%run-dev.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

if "%EXITCODE%"=="2" (
    if "%~1"=="" (
        echo.
        echo The Ugnay dev stack is already running.
        echo Frontend: http://localhost:3000
        echo Backend:  http://localhost:8000/docs
        echo.
        pause
    )
    exit /b 0
)

if not "%EXITCODE%"=="0" (
    if "%~1"=="" (
        echo.
        echo run-dev.cmd could not start the app.
        echo Read the message above, fix the issue, then try again.
        echo.
        pause
    )
)

exit /b %EXITCODE%

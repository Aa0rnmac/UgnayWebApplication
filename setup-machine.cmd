@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%setup-machine.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
    if "%~1"=="" (
        echo.
        echo setup-machine.cmd could not finish the machine setup.
        echo Read the message above, fix the issue, then try again.
        echo.
        pause
    )
)

exit /b %EXITCODE%

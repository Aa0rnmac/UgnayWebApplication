param(
    [switch]$DryRun,
    [switch]$UseMegaDatasets
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$backendPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$backendEnv = Join-Path $backendDir ".env"
$frontendEnv = Join-Path $frontendDir ".env.local"
$frontendNodeModules = Join-Path $frontendDir "node_modules"
$megaDatasets = "D:\MEGA\datasets"
$powershellExe = Join-Path $PSHOME "powershell.exe"

function Quote-PowerShell {
    param([string]$Value)

    return "'" + ($Value -replace "'", "''") + "'"
}

function Require-Path {
    param(
        [string]$Label,
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        $script:missing += "${Label}: $Path"
    }
}

$missing = @()
Require-Path -Label "Missing backend env" -Path $backendEnv
Require-Path -Label "Missing frontend env" -Path $frontendEnv
Require-Path -Label "Missing backend virtual environment" -Path $backendPython
Require-Path -Label "Missing frontend node_modules" -Path $frontendNodeModules

if ($UseMegaDatasets -and -not (Test-Path -LiteralPath $megaDatasets)) {
    $missing += "Missing MEGA datasets root: $megaDatasets"
}

if ($missing.Count -gt 0) {
    Write-Error ("Cannot start the dev stack because these prerequisites are missing:`n- " + ($missing -join "`n- "))
    exit 1
}

$backendSteps = @(
    '$host.UI.RawUI.WindowTitle = ''Ugnay Backend'''
    'Set-Location -LiteralPath ' + (Quote-PowerShell $backendDir)
    'Write-Host ''Backend API: http://localhost:8000/api'' -ForegroundColor Cyan'
    'Write-Host ''Swagger docs: http://localhost:8000/docs'' -ForegroundColor Cyan'
)

if ($UseMegaDatasets) {
    $backendSteps += '$env:DATASETS_ROOT = ' + (Quote-PowerShell $megaDatasets)
    $backendSteps += 'Write-Host ''DATASETS_ROOT override: D:\MEGA\datasets'' -ForegroundColor Yellow'
} else {
    $backendSteps += 'Write-Host ''DATASETS_ROOT source: backend\.env'' -ForegroundColor Yellow'
}

$backendSteps += 'Write-Host ''Backend startup still requires valid PostgreSQL credentials in backend\.env.'' -ForegroundColor Yellow'
$backendSteps += '& ' + (Quote-PowerShell $backendPython) + ' -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000'

$frontendSteps = @(
    '$host.UI.RawUI.WindowTitle = ''Ugnay Frontend'''
    'Set-Location -LiteralPath ' + (Quote-PowerShell $frontendDir)
    'Write-Host ''Frontend app: http://localhost:3000'' -ForegroundColor Cyan'
    'Write-Host ''If port 3000 is busy, Next.js may move to port 3001.'' -ForegroundColor Yellow'
    'cmd /c npm run dev'
)

$backendCommand = '& { ' + ($backendSteps -join '; ') + ' }'
$frontendCommand = '& { ' + ($frontendSteps -join '; ') + ' }'

Write-Host "Ready to launch the dev stack." -ForegroundColor Green
Write-Host "Backend:  http://localhost:8000/api"
Write-Host "Frontend: http://localhost:3000"
if ($UseMegaDatasets) {
    Write-Host "Dataset mode: MEGA override enabled ($megaDatasets)"
} else {
    Write-Host "Dataset mode: using backend\\.env"
}

if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run only. Commands were not started." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "[Backend Command]"
    Write-Host $backendCommand
    Write-Host ""
    Write-Host "[Frontend Command]"
    Write-Host $frontendCommand
    exit 0
}

$backendProcess = Start-Process -FilePath $powershellExe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $backendCommand
) -WorkingDirectory $backendDir -PassThru

$frontendProcess = Start-Process -FilePath $powershellExe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $frontendCommand
) -WorkingDirectory $frontendDir -PassThru

Write-Host ""
Write-Host "Started backend window (PID $($backendProcess.Id))."
Write-Host "Started frontend window (PID $($frontendProcess.Id))."
Write-Host "Close those windows to stop the servers."

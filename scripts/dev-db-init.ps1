param(
    [string]$MaintenanceDb = "postgres",
    [switch]$AllowSharedDb,
    [switch]$SkipMigrate
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$backendPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$devDbInitScript = Join-Path $backendDir "scripts\dev_db_init.py"

if (-not (Test-Path -LiteralPath $backendPython)) {
    throw "Missing backend Python executable: $backendPython`nRun setup-machine.ps1 first."
}

if (-not (Test-Path -LiteralPath $devDbInitScript)) {
    throw "Missing backend DB init script: $devDbInitScript"
}

$args = @($devDbInitScript, "--maintenance-db", $MaintenanceDb)
if ($AllowSharedDb) {
    $args += "--allow-shared-db"
}
if ($SkipMigrate) {
    $args += "--skip-migrate"
}

Push-Location $backendDir
try {
    & $backendPython @args
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

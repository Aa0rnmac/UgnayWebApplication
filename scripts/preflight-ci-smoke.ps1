param(
    [switch]$SkipFrontendCi,
    [switch]$SkipBackendInstall,
    [switch]$SkipFrontendSmoke,
    [switch]$SkipBackendSmoke,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$scriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptsDir

$frontendDir = Join-Path $repoRoot "frontend"
$backendDir = Join-Path $repoRoot "backend"

$frontendPackageJson = Join-Path $frontendDir "package.json"
$frontendLockfile = Join-Path $frontendDir "package-lock.json"
$frontendEnvShared = Join-Path $frontendDir ".env.shared"
$frontendEnvLocal = Join-Path $frontendDir ".env.local"

$backendRequirements = Join-Path $backendDir "requirements.txt"
$backendPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$backendAlembicConfig = Join-Path $backendDir "alembic.ini"
$backendSmokeScript = Join-Path $backendDir "scripts\smoke_backend_runtime.py"
$backendEnvShared = Join-Path $backendDir ".env.shared"
$backendEnv = Join-Path $backendDir ".env"

$checkFailures = @()
$checkWarnings = @()

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host $Title -ForegroundColor Cyan
}

function Write-CheckOk {
    param([string]$Message)
    Write-Host "[OK]   $Message" -ForegroundColor Green
}

function Write-CheckWarn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-CheckFail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    $script:checkFailures += $Message
}

function Assert-Path {
    param(
        [string]$Path,
        [string]$Label,
        [switch]$WarningOnly
    )

    if (Test-Path -LiteralPath $Path) {
        Write-CheckOk "$Label ($Path)"
        return
    }

    if ($WarningOnly) {
        $warningMessage = "$Label is missing: $Path"
        $script:checkWarnings += $warningMessage
        Write-CheckWarn $warningMessage
        return
    }

    Write-CheckFail "$Label is missing: $Path"
}

function Resolve-CommandPath {
    param(
        [string]$Name,
        [string]$Label
    )

    $resolved = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $resolved) {
        Write-CheckFail "$Label was not found on PATH."
        return $null
    }

    Write-CheckOk "$Label detected ($($resolved.Source))"
    return $resolved.Source
}

function Show-Version {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [string]$Label
    )

    if (-not $Command) {
        return
    }

    try {
        $output = (& $Command @Arguments 2>$null | Select-Object -First 1)
        if ($output) {
            Write-Host "      ${Label}: $output" -ForegroundColor DarkGray
        }
    } catch {
    }
}

function Invoke-CommandChecked {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [string]$Label
    )

    $joined = if ($Arguments.Count -gt 0) {
        "$Command " + ($Arguments -join " ")
    } else {
        $Command
    }

    if ($DryRun) {
        Write-Host "[dry-run] ($WorkingDirectory) $joined" -ForegroundColor DarkGray
        return
    }

    Push-Location $WorkingDirectory
    try {
        Write-Host "-> $Label" -ForegroundColor DarkCyan
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Label failed with exit code ${LASTEXITCODE}."
        }
    } finally {
        Pop-Location
    }
}

$needsFrontend = -not ($SkipFrontendCi -and $SkipFrontendSmoke)
$needsBackend = -not ($SkipBackendInstall -and $SkipBackendSmoke)

Write-Host "Ugnay preflight checklist + install + smoke" -ForegroundColor Green
Write-Host "Repo: $repoRoot"

Write-Section "Checklist"

$npmCmd = $null
$nodeCmd = $null

if ($needsFrontend) {
    Write-Host "Frontend checks:" -ForegroundColor Cyan
    Assert-Path -Path $frontendPackageJson -Label "frontend/package.json"
    Assert-Path -Path $frontendLockfile -Label "frontend/package-lock.json"
    Assert-Path -Path $frontendEnvShared -Label "frontend/.env.shared"
    Assert-Path -Path $frontendEnvLocal -Label "frontend/.env.local" -WarningOnly
    $npmCmd = Resolve-CommandPath -Name "npm.cmd" -Label "npm.cmd"
    $nodeCmd = Resolve-CommandPath -Name "node" -Label "node"
    Show-Version -Command $npmCmd -Arguments @("--version") -Label "npm"
    Show-Version -Command $nodeCmd -Arguments @("--version") -Label "node"
}

if ($needsBackend) {
    Write-Host "Backend checks:" -ForegroundColor Cyan
    Assert-Path -Path $backendPython -Label "backend/.venv/Scripts/python.exe"
    Assert-Path -Path $backendRequirements -Label "backend/requirements.txt"
    Assert-Path -Path $backendEnvShared -Label "backend/.env.shared"
    Assert-Path -Path $backendEnv -Label "backend/.env" -WarningOnly
    if (-not $SkipBackendSmoke) {
        Assert-Path -Path $backendAlembicConfig -Label "backend/alembic.ini"
        Assert-Path -Path $backendSmokeScript -Label "backend/scripts/smoke_backend_runtime.py"
    }
    Show-Version -Command $backendPython -Arguments @("--version") -Label "python"
}

if ($checkFailures.Count -gt 0) {
    Write-Host ""
    Write-Host "Checklist failed. Fix the items below before retrying:" -ForegroundColor Red
    foreach ($failure in $checkFailures) {
        Write-Host "- $failure" -ForegroundColor Red
    }
    exit 1
}

if ($checkWarnings.Count -gt 0) {
    Write-Host ""
    Write-Host "Checklist warnings (non-blocking):" -ForegroundColor Yellow
    foreach ($warning in $checkWarnings) {
        Write-Host "- $warning" -ForegroundColor Yellow
    }
}

Write-Section "Install"

if (-not $SkipFrontendCi) {
    Invoke-CommandChecked -Command $npmCmd -Arguments @("ci") -WorkingDirectory $frontendDir -Label "Frontend npm ci"
} else {
    Write-Host "Skipping frontend npm ci." -ForegroundColor Yellow
}

if (-not $SkipBackendInstall) {
    Invoke-CommandChecked -Command $backendPython -Arguments @("-m", "pip", "install", "--upgrade", "pip") -WorkingDirectory $backendDir -Label "Backend pip upgrade"
    Invoke-CommandChecked -Command $backendPython -Arguments @("-m", "pip", "install", "-r", "requirements.txt") -WorkingDirectory $backendDir -Label "Backend pip install -r requirements.txt"
} else {
    Write-Host "Skipping backend dependency install." -ForegroundColor Yellow
}

Write-Section "Smoke"

if (-not $SkipFrontendSmoke) {
    Invoke-CommandChecked -Command $npmCmd -Arguments @("run", "build") -WorkingDirectory $frontendDir -Label "Frontend smoke build"
} else {
    Write-Host "Skipping frontend smoke checks." -ForegroundColor Yellow
}

if (-not $SkipBackendSmoke) {
    Invoke-CommandChecked -Command $backendPython -Arguments @("-m", "alembic", "upgrade", "head") -WorkingDirectory $backendDir -Label "Backend migration smoke"
    Invoke-CommandChecked -Command $backendPython -Arguments @("scripts/smoke_backend_runtime.py") -WorkingDirectory $backendDir -Label "Backend runtime smoke (/api/health)"
} else {
    Write-Host "Skipping backend smoke checks." -ForegroundColor Yellow
}

Write-Host ""
if ($DryRun) {
    Write-Host "Dry run complete. No install or smoke commands were executed." -ForegroundColor Green
} else {
    Write-Host "Checklist, install, and smoke checks completed successfully." -ForegroundColor Green
}

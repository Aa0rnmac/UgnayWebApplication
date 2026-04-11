param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$ForceEnvCopy,
    [switch]$SkipInstalls,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if ($BackendOnly -and $FrontendOnly) {
    throw "Use either -BackendOnly or -FrontendOnly, not both."
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"

$backendTemplate = Join-Path $backendDir ".env.example"
$backendEnv = Join-Path $backendDir ".env"
$backendVenvDir = Join-Path $backendDir ".venv"
$backendVenvPython = Join-Path $backendVenvDir "Scripts\python.exe"
$backendRequirements = Join-Path $backendDir "requirements.txt"

$frontendTemplate = Join-Path $frontendDir ".env.local.example"
$frontendEnv = Join-Path $frontendDir ".env.local"

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Note {
    param([string]$Message)
    Write-Host "   $Message" -ForegroundColor Yellow
}

function Invoke-CommandChecked {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    $joined = if ($Arguments.Count -gt 0) { "$Command " + ($Arguments -join " ") } else { $Command }
    if ($DryRun) {
        Write-Host "[dry-run] $joined" -ForegroundColor DarkGray
        return
    }

    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $joined"
        }
    } finally {
        Pop-Location
    }
}

function Ensure-TemplateFile {
    param(
        [string]$TemplatePath,
        [string]$TargetPath,
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $TemplatePath)) {
        throw "Missing template for ${Label}: $TemplatePath"
    }

    if ((Test-Path -LiteralPath $TargetPath) -and -not $ForceEnvCopy) {
        Write-Note "$Label already exists: $TargetPath"
        return
    }

    if ($DryRun) {
        Write-Host "[dry-run] Copy $TemplatePath -> $TargetPath" -ForegroundColor DarkGray
        return
    }

    Copy-Item -LiteralPath $TemplatePath -Destination $TargetPath -Force
    Write-Host "Created $Label from template: $TargetPath" -ForegroundColor Green
}

function Resolve-PythonLauncher {
    $pyCommand = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCommand) {
        return @{
            Command = $pyCommand.Source
            PrefixArgs = @("-3.10")
            Display = "$($pyCommand.Source) -3.10"
        }
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        return @{
            Command = $pythonCommand.Source
            PrefixArgs = @()
            Display = $pythonCommand.Source
        }
    }

    throw "Could not find 'py' or 'python' on PATH. Install Python 3.10 first."
}

function Resolve-NpmCommand {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        throw "Could not find npm.cmd on PATH. Install Node.js first."
    }

    return $npmCommand.Source
}

$setupBackend = -not $FrontendOnly
$setupFrontend = -not $BackendOnly

Write-Host "Ugnay machine setup" -ForegroundColor Green
Write-Host "Repo: $repoRoot"

if ($setupBackend) {
    Write-Step "Preparing backend environment file"
    Ensure-TemplateFile -TemplatePath $backendTemplate -TargetPath $backendEnv -Label "backend/.env"

    Write-Step "Preparing backend virtual environment"
    if (Test-Path -LiteralPath $backendVenvPython) {
        Write-Note "Backend virtual environment already exists: $backendVenvPython"
    } else {
        $pythonLauncher = Resolve-PythonLauncher
        Write-Host "Using Python launcher: $($pythonLauncher.Display)" -ForegroundColor Yellow
        Invoke-CommandChecked -Command $pythonLauncher.Command -Arguments ($pythonLauncher.PrefixArgs + @("-m", "venv", ".venv")) -WorkingDirectory $backendDir
    }

    if (-not $SkipInstalls) {
        Write-Step "Installing backend requirements"
        Invoke-CommandChecked -Command $backendVenvPython -Arguments @("-m", "pip", "install", "--upgrade", "pip") -WorkingDirectory $backendDir
        Invoke-CommandChecked -Command $backendVenvPython -Arguments @("-m", "pip", "install", "-r", $backendRequirements) -WorkingDirectory $backendDir
    }
}

if ($setupFrontend) {
    Write-Step "Preparing frontend environment file"
    Ensure-TemplateFile -TemplatePath $frontendTemplate -TargetPath $frontendEnv -Label "frontend/.env.local"

    if (-not $SkipInstalls) {
        Write-Step "Installing frontend dependencies"
        $npmCmd = Resolve-NpmCommand
        Invoke-CommandChecked -Command $npmCmd -Arguments @("install") -WorkingDirectory $frontendDir
    }
}

Write-Host ""
Write-Host "Machine setup complete." -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Review backend/.env.shared and frontend/.env.shared (dummy team defaults only)."
Write-Host "2. Review backend/.env and fill in machine-specific paths and secrets."
Write-Host "3. Review frontend/.env.local if you need a fixed API base URL."
Write-Host "4. Run VS Code 'Run Full Stack' or use run-dev.cmd."

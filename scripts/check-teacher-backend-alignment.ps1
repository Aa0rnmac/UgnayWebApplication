param(
    [string]$BaselineRef = "upstream/main"
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
    Write-Host $Message -ForegroundColor Red
    exit 1
}

try {
    $null = git rev-parse --show-toplevel 2>$null
} catch {
    Fail "Git repository root could not be resolved."
}

try {
    $null = git rev-parse --verify $BaselineRef 2>$null
} catch {
    Fail "Git ref '$BaselineRef' was not found. Fetch or create that ref before running this check."
}

$repoRoot = git rev-parse --show-toplevel
Set-Location $repoRoot

$diffOutput = git diff --name-status $BaselineRef -- backend

if ([string]::IsNullOrWhiteSpace($diffOutput)) {
    Write-Host "Backend matches $BaselineRef." -ForegroundColor Green
    Write-Host "Safe state: teacher frontend work can stay on this branch without backend drift." -ForegroundColor Green
    exit 0
}

Write-Host "Backend drift detected against $BaselineRef." -ForegroundColor Yellow
Write-Host ""
Write-Host $diffOutput
Write-Host ""
Write-Host "Expected workflow:" -ForegroundColor Yellow
Write-Host "1. Keep teacher UI in mock mode on this branch."
Write-Host "2. Build real teacher backend support on a branch from $BaselineRef."
Write-Host "3. Merge that backend work into main."
Write-Host "4. Sync main back into this branch, then switch the provider from mock to real."
Write-Host ""
Write-Host "If this branch is only supposed to consume main-backed APIs, restore backend/ to $BaselineRef before review." -ForegroundColor Yellow
exit 1

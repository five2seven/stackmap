[CmdletBinding()]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$ProjectName = 'stackmap',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$ProductionBranch = 'main',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$OutputDirectory = 'dist-demo'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-RequiredEnvironmentVariable {
    param([Parameter(Mandatory)][string]$Name)

    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name, 'Process'))) {
        throw "Required environment variable '$Name' is not set."
    }
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)][string]$Description,
        [Parameter(Mandatory)][scriptblock]$Command
    )

    Write-Host $Description
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE."
    }
}

Assert-RequiredEnvironmentVariable -Name 'CLOUDFLARE_ACCOUNT_ID'
Assert-RequiredEnvironmentVariable -Name 'CLOUDFLARE_API_TOKEN'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $repositoryRoot

try {
    Invoke-CheckedCommand -Description 'Running lint checks...' -Command { npm run lint }
    Invoke-CheckedCommand -Description 'Running tests...' -Command { npm test }
    Invoke-CheckedCommand -Description 'Building the isolated public demo...' -Command { npm run build:demo }
    Invoke-CheckedCommand -Description 'Running public-demo end-to-end tests...' -Command { npm run test:e2e:demo }

    $resolvedOutputDirectory = Join-Path $repositoryRoot $OutputDirectory
    if (-not (Test-Path -LiteralPath $resolvedOutputDirectory -PathType Container)) {
        throw "Build output directory '$resolvedOutputDirectory' does not exist."
    }

    Write-Host "Checking for Cloudflare Pages project '$ProjectName'..."
    $projectListOutput = & npx wrangler pages project list --json
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to list Cloudflare Pages projects. Check authentication, account ID, and token permissions.'
    }

    try {
        $projects = @($projectListOutput | ConvertFrom-Json)
    }
    catch {
        throw 'Wrangler returned an unexpected response while listing Cloudflare Pages projects.'
    }

    $projectExists = @($projects | Where-Object {
            $_.'Project Name' -eq $ProjectName
        }).Count -gt 0
    if (-not $projectExists) {
        Invoke-CheckedCommand -Description "Creating Cloudflare Pages project '$ProjectName'..." -Command {
            npx wrangler pages project create $ProjectName --production-branch $ProductionBranch
        }
    }
    else {
        Write-Host "Cloudflare Pages project '$ProjectName' already exists."
    }

    Invoke-CheckedCommand -Description "Deploying '$OutputDirectory' to '$ProjectName'..." -Command {
        npx wrangler pages deploy $OutputDirectory --project-name $ProjectName --branch $ProductionBranch
    }
}
finally {
    Pop-Location
}

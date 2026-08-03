[CmdletBinding()]
param(
    [ValidateSet('Start', 'Stop')]
    [string]$Action = 'Start'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repositoryRoot
try {
    if ($Action -eq 'Stop') {
        docker compose down
        return
    }

    docker compose up --detach --build

    for ($attempt = 1; $attempt -le 30; $attempt++) {
        $health = docker inspect --format '{{.State.Health.Status}}' stackmap 2>$null
        if ($health -eq 'healthy') {
            $port = if ($env:STACKMAP_PORT) { $env:STACKMAP_PORT } else { '8088' }
            Write-Host "StackMap is healthy at http://localhost:$port"
            return
        }

        Start-Sleep -Seconds 2
    }

    docker compose logs --no-color
    throw 'StackMap did not become healthy within 60 seconds.'
}
finally {
    Pop-Location
}

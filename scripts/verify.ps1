$ErrorActionPreference = 'Stop'

Push-Location (Join-Path $PSScriptRoot '..\backend')
try {
    & .\mvnw.cmd -B test
} finally {
    Pop-Location
}

if (Get-Command npm -ErrorAction SilentlyContinue) {
    Push-Location (Join-Path $PSScriptRoot '..\frontend')
    try {
        & npm ci
        & npm run lint
        & npm run typecheck
        & npm test -- --run
        & npm run build
    } finally {
        Pop-Location
    }
} else {
    Write-Warning 'npm is not on PATH; run the frontend checks in the Node 24 container or install Node 24 LTS.'
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
    $composeFile = Join-Path $PSScriptRoot '..\docker-compose.yml'
    & docker compose -f $composeFile config --quiet
    & docker compose -f $composeFile build
} else {
    Write-Warning 'Docker is not on PATH; Compose validation was skipped.'
}

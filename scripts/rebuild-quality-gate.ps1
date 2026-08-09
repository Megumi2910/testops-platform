param([string]$EcommerceRepository = 'D:\Projects\ecommerce-web\webcky')

$ErrorActionPreference = 'Stop'
$testopsRepository = Split-Path -Parent $PSScriptRoot

function Get-Revision([string]$repository) {
    return (& git -C $repository rev-parse HEAD).Trim()
}

$testopsRevision = Get-Revision $testopsRepository
$ecommerceRevision = Get-Revision $EcommerceRepository

Push-Location $testopsRepository
try {
    & docker compose -f docker-compose.yml -f docker-compose.qa.yml build --build-arg "VCS_REF=$testopsRevision"
    if ($LASTEXITCODE -ne 0) { throw 'TestOps image build failed' }
    & docker compose -f docker-compose.yml -f docker-compose.qa.yml up -d
    if ($LASTEXITCODE -ne 0) { throw 'TestOps stack startup failed' }
} finally { Pop-Location }

Push-Location $EcommerceRepository
try {
    & docker compose build --build-arg "VCS_REF=$ecommerceRevision"
    if ($LASTEXITCODE -ne 0) { throw 'Ecommerce image build failed' }
    & docker compose up -d
    if ($LASTEXITCODE -ne 0) { throw 'Ecommerce stack startup failed' }
} finally { Pop-Location }

& (Join-Path $PSScriptRoot 'verify-running-revisions.ps1') -EcommerceRepository $EcommerceRepository

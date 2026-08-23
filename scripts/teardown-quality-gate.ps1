param(
    [string]$ProjectName = 'testops-quality-gate',
    [string[]]$ComposeFiles = @('docker-compose.yml', 'docker-compose.qa.yml'),
    [switch]$RemoveVolumes,
    [switch]$IncludeEcommerce,
    [string]$EcommerceRepository = 'D:\Projects\ecommerce-web\webcky',
    [string]$EcommerceProjectName = 'testops-quality-gate-ecommerce',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$testopsRepository = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')

function Stop-IsolatedProject {
    param(
        [string]$Repository,
        [string]$ComposeProject,
        [string[]]$Files
    )

    Assert-IsolatedComposeProjectName -ProjectName $ComposeProject -RepositoryRoot $Repository | Out-Null
    $downArguments = @('--remove-orphans')
    if ($RemoveVolumes) { $downArguments += '--volumes' }
    $arguments = New-ComposeArguments -ProjectName $ComposeProject -RepositoryRoot $Repository `
        -ComposeFiles $Files -Command 'down' -CommandArguments $downArguments
    Push-Location $Repository
    try {
        Invoke-CheckedNative -FilePath 'docker' -Arguments $arguments `
            -Activity "Tear down isolated Compose project $ComposeProject" -DryRun:$DryRun
    } finally {
        Pop-Location
    }
}

Stop-IsolatedProject -Repository $testopsRepository -ComposeProject $ProjectName -Files $ComposeFiles
if ($IncludeEcommerce) {
    if (-not (Test-Path -LiteralPath $EcommerceRepository)) {
        throw "Ecommerce repository was not found at $EcommerceRepository."
    }
    Stop-IsolatedProject -Repository $EcommerceRepository -ComposeProject $EcommerceProjectName `
        -Files @('docker-compose.yml')
}

Write-Host "Isolated runtime removed: project=$ProjectName volumes=$($RemoveVolumes.IsPresent)"

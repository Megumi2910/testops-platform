param(
    [string]$ProjectName = 'testops-quality-gate',
    [string[]]$ComposeFiles = @('docker-compose.yml', 'docker-compose.qa.yml'),
    [string]$Revision,
    [switch]$SkipEcommerce,
    [string]$EcommerceRepository = 'D:\Projects\ecommerce-web\webcky',
    [string]$EcommerceProjectName = 'testops-quality-gate-ecommerce',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$testopsRepository = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')

function Invoke-ComposeChecked {
    param(
        [string]$Repository,
        [string]$ComposeProject,
        [string[]]$Files,
        [string]$Command,
        [string[]]$CommandArguments,
        [string]$Activity
    )

    $arguments = New-ComposeArguments -ProjectName $ComposeProject -RepositoryRoot $Repository `
        -ComposeFiles $Files -Command $Command -CommandArguments $CommandArguments
    Push-Location $Repository
    try {
        Invoke-CheckedNative -FilePath 'docker' -Arguments $arguments -Activity $Activity -DryRun:$DryRun
    } finally {
        Pop-Location
    }
}

Assert-IsolatedComposeProjectName -ProjectName $ProjectName -RepositoryRoot $testopsRepository | Out-Null
if ([string]::IsNullOrWhiteSpace($Revision)) {
    $Revision = Get-GitRevision -RepositoryRoot $testopsRepository
} elseif ($Revision -notmatch '^[0-9a-fA-F]{40}$') {
    throw 'Revision must be a full 40-character Git commit.'
}
$Revision = $Revision.ToLowerInvariant()

Invoke-ComposeChecked -Repository $testopsRepository -ComposeProject $ProjectName -Files $ComposeFiles `
    -Command 'build' -CommandArguments @('--build-arg', "VCS_REF=$Revision") `
    -Activity "Build isolated TestOps project $ProjectName"
Invoke-ComposeChecked -Repository $testopsRepository -ComposeProject $ProjectName -Files $ComposeFiles `
    -Command 'up' -CommandArguments @('-d', '--wait', '--wait-timeout', '180') `
    -Activity "Start isolated TestOps project $ProjectName"

if (-not $SkipEcommerce) {
    if (-not (Test-Path -LiteralPath $EcommerceRepository)) {
        throw "Ecommerce repository was not found at $EcommerceRepository. Pass -SkipEcommerce for TestOps-only verification."
    }
    Assert-IsolatedComposeProjectName -ProjectName $EcommerceProjectName -RepositoryRoot $EcommerceRepository | Out-Null
    $ecommerceRevision = Get-GitRevision -RepositoryRoot $EcommerceRepository
    Invoke-ComposeChecked -Repository $EcommerceRepository -ComposeProject $EcommerceProjectName `
        -Files @('docker-compose.yml') -Command 'build' `
        -CommandArguments @('--build-arg', "VCS_REF=$ecommerceRevision") `
        -Activity "Build isolated ecommerce project $EcommerceProjectName"
    Invoke-ComposeChecked -Repository $EcommerceRepository -ComposeProject $EcommerceProjectName `
        -Files @('docker-compose.yml') -Command 'up' -CommandArguments @('-d', '--wait', '--wait-timeout', '180') `
        -Activity "Start isolated ecommerce project $EcommerceProjectName"
}

if (-not $DryRun) {
    $revisionArguments = @{
        ProjectName = $ProjectName
        ComposeFiles = $ComposeFiles
        ExpectedRevision = $Revision
    }
    if (-not $SkipEcommerce) {
        $revisionArguments['IncludeEcommerce'] = $true
        $revisionArguments['EcommerceRepository'] = $EcommerceRepository
        $revisionArguments['EcommerceProjectName'] = $EcommerceProjectName
    }
    & (Join-Path $PSScriptRoot 'verify-running-revisions.ps1') @revisionArguments
}

Write-Host "Isolated runtime started: project=$ProjectName revision=$Revision"

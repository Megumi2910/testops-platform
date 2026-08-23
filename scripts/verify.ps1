param(
    [string]$ProjectName = 'testops-local-verify',
    [switch]$NoBrowser,
    [switch]$CleanWorktree
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')

function Invoke-FromCleanCandidateWorktree {
    $sourcePaths = @(
        '.github/workflows/ci.yml',
        'backend',
        'frontend',
        'scripts',
        'docker-compose.yml',
        'docker-compose.qa.yml',
        'docker-compose.e2e.yml',
        'docker-compose.e2e-local-disabled.yml'
    )
    $status = Invoke-CheckedNative -FilePath 'git' `
        -Arguments (@('-C', $root, 'status', '--porcelain', '--untracked-files=all', '--') + $sourcePaths) `
        -Activity 'Inspect candidate source worktree' -CaptureOutput
    if ([string]::IsNullOrWhiteSpace($status)) { return $false }

    $revision = Get-GitRevision -RepositoryRoot $root
    $tempRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) `
        ("testops-verify-{0}" -f [Guid]::NewGuid().ToString('N'))))
    $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\testops-verify-'
    if (-not $tempRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to create a verification worktree outside the validated temp prefix: $tempRoot"
    }

    Write-Host "Candidate source is dirty; verifying clean revision $revision in $tempRoot"
    Invoke-CheckedNative -FilePath 'git' -Arguments @('-C', $root, 'worktree', 'add', '--detach', $tempRoot, $revision) `
        -Activity 'Create clean candidate verification worktree' | Out-Host
    try {
        $childArguments = @{
            ProjectName = $ProjectName
            CleanWorktree = $true
        }
        if ($NoBrowser) { $childArguments['NoBrowser'] = $true }
        & (Join-Path $tempRoot 'scripts\verify.ps1') @childArguments | Out-Host
    } finally {
        Invoke-CheckedNative -FilePath 'git' -Arguments @('-C', $root, 'worktree', 'remove', '--force', $tempRoot) `
            -Activity 'Remove clean candidate verification worktree' | Out-Host
    }
    return $true
}

if (-not $CleanWorktree -and (Invoke-FromCleanCandidateWorktree)) {
    return
}

function Invoke-GateStep {
    param([string]$Name, [scriptblock]$Action)
    Write-Host "`n=== $Name ==="
    & $Action
    Write-Host "PASS $Name"
}

function Invoke-NpmChecked {
    param([string[]]$Arguments, [string]$Activity)
    Push-Location $frontend
    try {
        Invoke-CheckedNative -FilePath 'npm' -Arguments $Arguments -Activity $Activity
    } finally {
        Pop-Location
    }
}

function New-NoPublishedPortsOverride {
    $path = Join-Path ([IO.Path]::GetTempPath()) ("testops-no-ports-{0}.yml" -f [Guid]::NewGuid().ToString('N'))
    $yaml = @'
services:
  postgres:
    ports: !override []
  backend:
    ports: !override []
  frontend:
    ports: !override []
  pgadmin4:
    ports: !override []
  mailpit:
    ports: !override []
'@
    [IO.File]::WriteAllText($path, $yaml, [Text.UTF8Encoding]::new($false))
    return $path
}

Assert-IsolatedComposeProjectName -ProjectName $ProjectName -RepositoryRoot $root | Out-Null
foreach ($command in @('docker', 'git', 'npm')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "$command is required by the aggregate verification harness."
    }
}

Invoke-GateStep 'Frontend dependency lock' {
    Invoke-NpmChecked -Arguments @('ci') -Activity 'Install locked frontend dependencies'
}
Invoke-GateStep 'Frontend lint' {
    Invoke-NpmChecked -Arguments @('run', 'lint') -Activity 'Run frontend lint'
}
Invoke-GateStep 'Frontend typecheck' {
    Invoke-NpmChecked -Arguments @('run', 'typecheck') -Activity 'Run frontend typecheck'
}
Invoke-GateStep 'Frontend unit tests' {
    Invoke-NpmChecked -Arguments @('test', '--', '--run') -Activity 'Run frontend unit tests'
}
Invoke-GateStep 'Frontend production build' {
    Invoke-NpmChecked -Arguments @('run', 'build') -Activity 'Build frontend production bundle'
}

Invoke-GateStep 'Backend verification' {
    Push-Location $backend
    try {
        Invoke-CheckedNative -FilePath (Join-Path $backend 'mvnw.cmd') -Arguments @('-B', 'verify') `
            -Activity 'Run backend unit and integration verification'
    } finally {
        Pop-Location
    }
}

Invoke-GateStep 'Prepare isolated runtime prerequisites' {
    & (Join-Path $PSScriptRoot 'setup-quality-gate.ps1') -SkipBuild
}
Invoke-GateStep 'Compose configuration matrix' {
    & (Join-Path $PSScriptRoot 'verify-compose-configs.ps1') -ProjectName "$ProjectName-config"
}
Invoke-GateStep 'Project-scope orchestration contract' {
    & (Join-Path $PSScriptRoot 'test-quality-gate-scripts.ps1')
}
Invoke-GateStep 'Revision and health contract' {
    & (Join-Path $PSScriptRoot 'test-revision-contract.ps1')
}
Invoke-GateStep 'Documentation links and manifest' {
    & (Join-Path $PSScriptRoot 'verify-doc-links.ps1')
}
Invoke-GateStep 'Secret and public-artifact policy' {
    & (Join-Path $PSScriptRoot 'verify-secret-safety.ps1') -IncludeGitDiff
}

$revision = Get-GitRevision -RepositoryRoot $root
$composeFiles = @('docker-compose.yml', 'docker-compose.qa.yml')
$temporaryOverride = $null
if ($NoBrowser) {
    $temporaryOverride = New-NoPublishedPortsOverride
    $composeFiles += $temporaryOverride
} else {
    $composeFiles = @('docker-compose.yml', 'docker-compose.e2e.yml')
}

$runtimeCleanupRequired = $true
try {
    Invoke-GateStep 'Revision-pinned isolated runtime rebuild' {
        & (Join-Path $PSScriptRoot 'rebuild-quality-gate.ps1') -ProjectName $ProjectName `
            -ComposeFiles $composeFiles -Revision $revision -SkipEcommerce
    }
    Invoke-GateStep 'Running revision and health provenance' {
        & (Join-Path $PSScriptRoot 'verify-running-revisions.ps1') -ProjectName $ProjectName `
            -ComposeFiles $composeFiles -ExpectedRevision $revision
    }

    if ($NoBrowser) {
        Write-Host "`nBrowser execution skipped by -NoBrowser; browser retention and publication policy was still verified."
    } else {
        Invoke-GateStep 'Complete Playwright browser matrix' {
            $bootstrapPasswordPath = Join-Path $backend '.secrets\bootstrap-admin-password'
            if (-not (Test-Path -LiteralPath $bootstrapPasswordPath)) {
                throw 'The isolated E2E bootstrap password was not generated.'
            }
            $previousBaseUrl = $env:E2E_BASE_URL
            $previousMailpitUrl = $env:MAILPIT_URL
            $previousAdminEmail = $env:E2E_ADMIN_EMAIL
            $previousAdminPassword = $env:E2E_ADMIN_PASSWORD
            try {
                $env:E2E_BASE_URL = 'http://localhost:3100'
                $env:MAILPIT_URL = 'http://127.0.0.1:8025'
                $env:E2E_ADMIN_EMAIL = 'qa.bootstrap-admin@testops.local'
                $env:E2E_ADMIN_PASSWORD = ([IO.File]::ReadAllText($bootstrapPasswordPath)).Trim()
                Invoke-NpmChecked -Arguments @('run', 'e2e') -Activity 'Run complete Playwright TestOps matrix'
            } finally {
                $env:E2E_BASE_URL = $previousBaseUrl
                $env:MAILPIT_URL = $previousMailpitUrl
                $env:E2E_ADMIN_EMAIL = $previousAdminEmail
                $env:E2E_ADMIN_PASSWORD = $previousAdminPassword
            }
        }
        Invoke-GateStep 'Post-browser secret and artifact policy' {
            & (Join-Path $PSScriptRoot 'verify-secret-safety.ps1') -IncludeGitDiff
        }
    }
} finally {
    try {
        if ($runtimeCleanupRequired) {
            & (Join-Path $PSScriptRoot 'teardown-quality-gate.ps1') -ProjectName $ProjectName `
                -ComposeFiles $composeFiles -RemoveVolumes
        }
    } finally {
        if ($temporaryOverride -and (Test-Path -LiteralPath $temporaryOverride -PathType Leaf)) {
            Remove-Item -LiteralPath $temporaryOverride -Force
        }
    }
}

Write-Host "`nAggregate verification PASS project=$ProjectName revision=$revision browser=$(-not $NoBrowser.IsPresent)"

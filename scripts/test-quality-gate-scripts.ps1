$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')

$assertions = 0
function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "Assertion failed: $Message" }
    $script:assertions++
}
function Assert-Throws {
    param([scriptblock]$Action, [string]$MessagePattern)
    try {
        & $Action
    } catch {
        if ($_.Exception.Message -notmatch $MessagePattern) {
            throw "Expected error matching '$MessagePattern', got '$($_.Exception.Message)'"
        }
        $script:assertions++
        return
    }
    throw "Expected an error matching '$MessagePattern'."
}

$project = 'testops-script-contract'
$defaultProject = Get-NormalizedComposeProjectName (Split-Path -Leaf $root)
Assert-Throws { Assert-IsolatedComposeProjectName -ProjectName $defaultProject -RepositoryRoot $root } 'default project'
Assert-Throws { Assert-IsolatedComposeProjectName -ProjectName 'UPPERCASE' -RepositoryRoot $root } 'lowercase'
Assert-Throws { Assert-IsolatedComposeProjectName -ProjectName 'bad project' -RepositoryRoot $root } 'lowercase'

if ($env:ComSpec) {
    $diagnosticOutput = Invoke-CheckedNative -FilePath $env:ComSpec `
        -Arguments @('/d', '/c', 'echo expected-diagnostic 1>&2 & exit /b 0') `
        -Activity 'Exercise successful native stderr' -CaptureOutput
    Assert-True ($diagnosticOutput -match 'expected-diagnostic') `
        'native stderr remains diagnostic when the process exits successfully'
    Assert-Throws {
        Invoke-CheckedNative -FilePath $env:ComSpec -Arguments @('/d', '/c', 'exit /b 7') `
            -Activity 'Exercise failing native exit code'
    } 'exit code 7'
}

foreach ($command in @('build', 'up', 'down')) {
    $arguments = New-ComposeArguments -ProjectName $project -RepositoryRoot $root `
        -ComposeFiles @('docker-compose.yml', 'docker-compose.qa.yml') -Command $command
    Assert-True ($arguments[0] -eq 'compose') "$command starts with docker compose arguments"
    Assert-True ($arguments[1] -eq '-p') "$command uses explicit -p before Compose files"
    Assert-True ($arguments[2] -eq $project) "$command selects the caller-supplied isolated project"
    Assert-True (($arguments | Select-Object -Last 1) -eq $command) "$command remains the requested Compose action"
}

$revision = '0123456789abcdef0123456789abcdef01234567'
$rebuildOutput = (& (Join-Path $PSScriptRoot 'rebuild-quality-gate.ps1') -ProjectName $project `
    -ComposeFiles @('docker-compose.yml', 'docker-compose.qa.yml') -Revision $revision -SkipEcommerce -DryRun 6>&1) | Out-String
Assert-True ($rebuildOutput -match 'docker compose -p testops-script-contract .* build') 'rebuild dry run is project-scoped'
Assert-True ($rebuildOutput -match 'docker compose -p testops-script-contract .* up') 'startup dry run is project-scoped'
Assert-True ($rebuildOutput -match [regex]::Escape("VCS_REF=$revision")) 'rebuild dry run pins the requested revision'

$teardownOutput = (& (Join-Path $PSScriptRoot 'teardown-quality-gate.ps1') -ProjectName $project `
    -ComposeFiles @('docker-compose.yml', 'docker-compose.qa.yml') -RemoveVolumes -DryRun 6>&1) | Out-String
Assert-True ($teardownOutput -match 'docker compose -p testops-script-contract .* down') 'teardown dry run is project-scoped'
Assert-True ($teardownOutput -match '--volumes') 'isolated teardown can remove only its own volumes'

$workflowPath = Join-Path $root '.github\workflows\ci.yml'
$composeWorkflowLines = @(Select-String -LiteralPath $workflowPath -Pattern 'docker compose\s')
Assert-True ($composeWorkflowLines.Count -gt 0) 'CI contains Compose gates to audit'
foreach ($match in $composeWorkflowLines) {
    Assert-True ($match.Line -match 'docker compose\s+-p\s+[a-z0-9][a-z0-9_-]*\s') `
        "CI Compose invocation at line $($match.LineNumber) is explicitly project-scoped"
}

Write-Host "Quality-gate script contract PASS assertions=$assertions"

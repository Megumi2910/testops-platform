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

$randomA = New-CryptographicRandomBytes -Length 32
$randomB = New-CryptographicRandomBytes -Length 32
Assert-True ($randomA.Length -eq 32 -and $randomB.Length -eq 32) `
    'portable cryptographic random generation returns the requested length'
Assert-True ([Convert]::ToBase64String($randomA) -ne [Convert]::ToBase64String($randomB)) `
    'independent cryptographic random values are not reused'

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

$rebuildSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'rebuild-quality-gate.ps1') -Raw
Assert-True ($rebuildSource -match "Command = 'ps'.*Arguments = @\('-a'\)") `
    'startup failure diagnostics inspect only the caller-supplied Compose project'
Assert-True ($rebuildSource -match "Command = 'logs'.*'--tail', '200'.*'backend'.*'frontend'.*'pgadmin4'.*'mailpit'") `
    'startup failure diagnostics retain bounded logs for every gated service'

$revisionVerifierSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'verify-running-revisions.ps1') -Raw
Assert-True ($revisionVerifierSource -match 'Get-DockerContainerContractState') `
    'running revision verification parses structured Docker inspection data'
Assert-True ($revisionVerifierSource -notmatch "'--format'") `
    'running revision verification avoids platform-sensitive Go-template quoting'

$playwrightConfig = Get-Content -LiteralPath (Join-Path $root 'frontend\playwright.config.ts') -Raw
Assert-True ($playwrightConfig -match "name:\s*'chromium'") `
    'Playwright exposes the named chromium project used by phase commands'
Assert-True ($playwrightConfig -match "use:\s*\{\s*\.\.\.devices\['Desktop Chrome'\]\s*\}") `
    'the named chromium project preserves the Desktop Chrome device defaults'

$retainedSpec = Get-Content -LiteralPath (Join-Path $root 'frontend\e2e\retained-swap.spec.ts') -Raw
Assert-True ($retainedSpec -match "locator\('\.primary-nav'\)\.getByRole\('link',\s*\{ name: 'Sign in', exact: true \}\)\.click\(\)") `
    'retained navigation uses the unambiguous visible client-side Sign in link in primary navigation'
Assert-True ($retainedSpec -notmatch "page\.goto\('/login") `
    'retained navigation does not replace the old document before the stale chunk request'
Assert-True ($retainedSpec -match 'documentReloads:\s*1, staleChunk404s:\s*1') `
    'retained browser proof requires exactly one document reload and one stale chunk 404'
Assert-True ($retainedSpec -match 'testops:lazy-route-recovery:\$\{revisionA\}:/login') `
    'retained browser proof checks the revision-A one-shot recovery marker'

$retainedDryRun = (& (Join-Path $PSScriptRoot 'verify-retained-swap.ps1') -ProjectName 'testops-retained-contract' -DryRun 6>&1) | Out-String
Assert-True ($retainedDryRun -match 'clean detached worktrees') `
    'retained harness dry run declares clean detached A/B worktrees'
Assert-True ($retainedDryRun -match 'one 404 and one reload') `
    'retained harness dry run declares the exact recovery cardinality'
Assert-True ($retainedDryRun -notmatch 'EVIDENCE_JSON:') `
    'retained harness never fabricates successful pipeline evidence during dry run'
$retainedSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'verify-retained-swap.ps1') -Raw
foreach ($contract in @('worktree.*--detach', 'merge-base.*--is-ancestor', 'VCS_REF=', 'Get-ImageRevision', `
    'Assert-FrontendHttpContract', 'stale_chunk_404s', 'document_reloads', 'query_backed', 'adapter_verified', `
    'artifacts/browser-evidence/P6\.json')) {
    Assert-True ($retainedSource -match $contract) "retained harness contains contract $contract"
}
foreach ($secretName in @('jwt-private.pem', 'jwt-public.pem', 'email-otp-pepper', 'project-variable-key', `
    'bootstrap-admin-password', 'qa-fixture-password')) {
    Assert-True ($retainedSource -match [regex]::Escape($secretName)) `
        "retained clean-worktree runtime provisions $secretName"
}
$lastDockerBuild = $retainedSource.LastIndexOf("Invoke-CheckedNative -FilePath 'docker' -Arguments @('build'", [StringComparison]::Ordinal)
$secretProvisioning = $retainedSource.IndexOf("`$secretDirectory = Join-Path `$worktreeB 'backend/.secrets'", [StringComparison]::Ordinal)
Assert-True ($lastDockerBuild -ge 0 -and $secretProvisioning -gt $lastDockerBuild) `
    'ephemeral backend secrets are provisioned only after clean Docker build contexts are consumed'
Assert-True ($retainedSource -match 'Replace\(''__FRONTEND_PORT__'', \$frontendPort\)') `
    'revision B reuses the exact published origin observed for the retained revision-A tab'

$pgadminEmail = 'admin@testops.example.com'
$pgadminExample = @(Get-Content -LiteralPath (Join-Path $root 'pgadmin4\.env.example'))
Assert-True ($pgadminExample -contains "PGADMIN_DEFAULT_EMAIL=$pgadminEmail") `
    'tracked PgAdmin defaults use an accepted non-reserved placeholder address'
foreach ($setupScript in @('setup-local.ps1', 'setup-local.sh')) {
    $setupSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot $setupScript) -Raw
    Assert-True ($setupSource -match [regex]::Escape($pgadminEmail)) `
        "$setupScript preserves the validator-compatible PgAdmin identity"
}

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

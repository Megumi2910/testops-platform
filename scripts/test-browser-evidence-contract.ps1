$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$validatorPath = Join-Path $PSScriptRoot 'assert-browser-evidence.ps1'
$powershellPath = (Get-Process -Id $PID).Path
$assertions = 0

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        throw "Assertion failed: $Message"
    }
    $script:assertions++
}

function Get-CaseMatrix {
    param([string]$Phase)
    $desktop = '1440x900'
    $tablet = '768x1024'
    $mobile = '320x800'
    switch ($Phase) {
        'P6' {
            return [ordered]@{
                'retained-revision-swap' = @($desktop)
                'account-shell-guest' = @($desktop, $tablet, $mobile)
                'account-shell-unverified' = @($desktop, $tablet, $mobile)
                'account-shell-verified' = @($desktop, $tablet, $mobile)
                'account-shell-administrator' = @($desktop, $tablet, $mobile)
                'account-shell-keyboard-navigation' = @($desktop, $tablet, $mobile)
                'account-shell-dismissal-and-sign-out' = @($desktop, $tablet, $mobile)
                'password-change-wrong-current' = @($desktop)
                'password-change-success-relogin' = @($desktop)
                'password-setup-google-only' = @($desktop)
                'password-setup-cooldown' = @($desktop)
                'password-setup-invalid-code' = @($desktop)
                'password-setup-success' = @($desktop)
                'provider-link-success' = @($desktop)
                'provider-unlink-blank-password' = @($desktop)
                'provider-unlink-wrong-password' = @($desktop)
                'provider-unlink-last-method' = @($desktop)
                'provider-unlink-success-revocation' = @($desktop)
            }
        }
        'P7' {
            return [ordered]@{
                'account-status-session-revocation' = @($desktop)
                'role-account-state-allowed' = @($desktop)
                'role-account-state-denied' = @($desktop)
                'tenant-isolation' = @($desktop)
                'variable-plain-lifecycle' = @($desktop)
                'variable-secret-masking' = @($desktop)
                'variable-stale-conflict' = @($desktop)
                'variable-reference-conflict' = @($desktop)
                'member-lifecycle' = @($desktop)
                'member-duplicate' = @($desktop)
                'member-stale-conflict' = @($desktop)
                'member-final-manager-conflict' = @($desktop)
                'terminal-refresh-json' = @($desktop)
                'terminal-refresh-blob' = @($desktop)
            }
        }
        'P8' {
            return [ordered]@{
                'builder-descriptor-parity' = @($desktop)
                'builder-lifecycle' = @($desktop)
                'builder-invalid-input' = @($desktop)
                'execution-idempotent-queue' = @($desktop)
                'execution-capacity-conflict' = @($desktop)
                'execution-cancel-requester' = @($desktop)
                'execution-cancel-manager' = @($desktop)
                'execution-cancellation-denied' = @($desktop)
                'execution-terminal-rerun' = @($desktop)
                'artifact-order-duration' = @($desktop)
                'artifact-suppressed' = @($desktop)
                'artifact-purged' = @($desktop)
                'dashboard-four-panels' = @($desktop)
                'navigation-click-blocked' = @($desktop)
                'navigation-form-blocked' = @($desktop)
                'navigation-redirect-blocked' = @($desktop)
                'navigation-script-blocked' = @($desktop)
                'navigation-popup-blocked' = @($desktop)
            }
        }
        'P9' {
            return [ordered]@{
                'critical-route-navigation' = @($desktop, $tablet, $mobile)
                'keyboard-focus' = @($desktop, $tablet, $mobile)
                'forms-and-errors' = @($desktop, $tablet, $mobile)
                'dialogs' = @($desktop, $tablet, $mobile)
                'automated-accessibility' = @($desktop, $tablet, $mobile)
                'performance-critical-routes' = @($desktop, $tablet, $mobile)
            }
        }
    }
}

function New-NegativeTuple {
    param(
        [string]$CaseId,
        [string]$Method,
        [string]$Path,
        [int]$Status,
        [string]$ProblemCode
    )
    return [ordered]@{
        case_id = $CaseId
        method = $Method
        path = $Path
        status = $Status
        problem_code = $ProblemCode
    }
}

function Get-NegativeAllowlist {
    param([string]$Phase)
    switch ($Phase) {
        'P6' {
            return @(
                (New-NegativeTuple 'retained-revision-swap' 'GET' '/assets/AccountPage-old-A1b2c3.js' 404 'stale_chunk_404'),
                (New-NegativeTuple 'password-change-wrong-current' 'PUT' '/api/v1/auth/me/password' 401 'password_invalid'),
                (New-NegativeTuple 'password-setup-invalid-code' 'POST' '/api/v1/auth/me/password/confirm' 400 'verification_invalid'),
                (New-NegativeTuple 'provider-unlink-blank-password' 'POST' '/api/v1/auth/me/login-methods/google/unlink' 400 'validation_failed'),
                (New-NegativeTuple 'provider-unlink-wrong-password' 'POST' '/api/v1/auth/me/login-methods/google/unlink' 401 'password_invalid'),
                (New-NegativeTuple 'provider-unlink-last-method' 'POST' '/api/v1/auth/me/login-methods/google/unlink' 409 'password_required')
            )
        }
        'P7' {
            return @(
                (New-NegativeTuple 'account-status-session-revocation' 'POST' '/api/v1/auth/refresh' 401 'refresh_invalid'),
                (New-NegativeTuple 'role-account-state-denied' 'PATCH' '/api/v1/admin/users/:id/status' 403 'access_denied'),
                (New-NegativeTuple 'tenant-isolation' 'GET' '/api/v1/projects/:projectId' 404 'project_not_found'),
                (New-NegativeTuple 'variable-stale-conflict' 'PATCH' '/api/v1/projects/:projectId/variables/:variableId' 409 'stale_version'),
                (New-NegativeTuple 'variable-reference-conflict' 'DELETE' '/api/v1/projects/:projectId/variables/:variableId' 409 'variable_in_use'),
                (New-NegativeTuple 'member-duplicate' 'POST' '/api/v1/projects/:projectId/members' 409 'member_exists'),
                (New-NegativeTuple 'member-stale-conflict' 'PATCH' '/api/v1/projects/:projectId/members/:memberId' 409 'stale_version'),
                (New-NegativeTuple 'member-final-manager-conflict' 'DELETE' '/api/v1/projects/:projectId/members/:memberId' 409 'final_manager'),
                (New-NegativeTuple 'terminal-refresh-json' 'POST' '/api/v1/auth/refresh' 401 'refresh_invalid'),
                (New-NegativeTuple 'terminal-refresh-blob' 'POST' '/api/v1/auth/refresh' 401 'refresh_invalid')
            )
        }
        'P8' {
            return @(
                (New-NegativeTuple 'builder-invalid-input' 'PUT' '/api/v1/projects/:projectId/suites/:suiteId/cases/:caseId' 400 'validation_failed'),
                (New-NegativeTuple 'execution-capacity-conflict' 'POST' '/api/v1/projects/:projectId/executions' 409 'queue_capacity'),
                (New-NegativeTuple 'execution-cancellation-denied' 'POST' '/api/v1/projects/:projectId/executions/:executionId/cancel' 403 'access_denied'),
                (New-NegativeTuple 'artifact-suppressed' 'GET' '/api/v1/projects/:projectId/executions/:executionId/artifacts/screenshot' 404 'artifact_suppressed')
            )
        }
        'P9' { return @() }
    }
}

function New-ValidManifest {
    param(
        [string]$Phase,
        [string]$RevisionA,
        [string]$RevisionB
    )

    $caseRecords = @()
    foreach ($entry in (Get-CaseMatrix $Phase).GetEnumerator()) {
        foreach ($viewport in @($entry.Value)) {
            $caseRecords += [ordered]@{
                id = [string]$entry.Key
                viewport = $viewport
                status = 'passed'
                assertions_total = 1
                assertions_failed = 0
            }
        }
    }
    $allowlist = @(Get-NegativeAllowlist $Phase)
    $observed = @($allowlist | ForEach-Object {
        [ordered]@{
            case_id = $_.case_id
            method = $_.method
            path = $_.path
            status = $_.status
            problem_code = $_.problem_code
            count = 1
        }
    })

    $manifest = [ordered]@{
        schema_version = 1
        phase = $Phase
        source_sha = $RevisionB
        generated_at_utc = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
        sanitized = $true
        tools = @(
            [ordered]@{ id = 'playwright-mcp'; run_id = "playwright-$Phase-contract"; revision = $RevisionB; capture_count = 1 },
            [ordered]@{ id = 'chrome-devtools-mcp'; run_id = "devtools-$Phase-contract"; revision = $RevisionB; capture_count = 1 }
        )
        assertions = [ordered]@{ total = $caseRecords.Count; failed = 0 }
        cases = $caseRecords
        network = [ordered]@{
            expected_negative_allowlist = $allowlist
            observed_negative_events = $observed
            unexpected_failures = 0
            unexpected_500s = 0
            cross_tenant_leaks = 0
            cross_origin_leaks = 0
        }
        console = [ordered]@{ console_errors = 0; uncaught_exceptions = 0; page_errors = 0 }
        security = [ordered]@{
            secrets_detected = 0
            sensitive_fields_detected = @()
            raw_artifacts_included = $false
            cross_tenant_leaks = 0
            cross_origin_leaks = 0
        }
    }
    if ($Phase -eq 'P6') {
        $manifest['retained_swap_run_id'] = 'retained-swap-contract'
        $manifest['swap'] = [ordered]@{
            revision_a = $RevisionA
            revision_b = $RevisionB
            adjacent = $true
            source_delta_path = 'docs/milestones/15-milestone-10a-testops-completion.md'
            marker_absent_in_a = $true
            marker_present_in_b = $true
            oci_revision_a = $RevisionA
            oci_revision_b = $RevisionB
            shell_header_a = $RevisionA
            final_header_b = $RevisionB
            static_asset_header_b = $RevisionB
            static_404_header_b = $RevisionB
            proxy_headers_absent = $true
            document_reloads = 1
            stale_chunk_404s = 1
            recovery_marker_a = $true
            final_marker_b = $true
            reload_loop = $false
            initial_asset_path = '/assets/index-revision-a.js'
            final_asset_path = '/assets/index-revision-b.js'
        }
    }
    return $manifest
}

function Copy-Manifest {
    param([object]$Manifest)
    return (($Manifest | ConvertTo-Json -Depth 12) | ConvertFrom-Json)
}

function Write-Fixture {
    param([object]$Manifest, [string]$Name, [string]$Directory)
    $path = Join-Path $Directory "$Name.json"
    $Manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Invoke-Validator {
    param([string]$Phase, [string]$Path)
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = (& $powershellPath -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
            -Phase $Phase -ManifestPath $Path 2>&1) | Out-String
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = $output }
}

function Assert-Passes {
    param([object]$Manifest, [string]$Phase, [string]$Name, [string]$Directory)
    $path = Write-Fixture -Manifest $Manifest -Name $Name -Directory $Directory
    $result = Invoke-Validator -Phase $Phase -Path $path
    Assert-True ($result.ExitCode -eq 0 -and $result.Output -match "Browser evidence PASS phase=$Phase") `
        "$Name should pass, output: $($result.Output)"
}

function Assert-Fails {
    param(
        [object]$Manifest,
        [string]$Phase,
        [string]$Name,
        [string]$Pattern,
        [string]$Directory
    )
    $path = Write-Fixture -Manifest $Manifest -Name $Name -Directory $Directory
    $result = Invoke-Validator -Phase $Phase -Path $path
    Assert-True ($result.ExitCode -ne 0 -and $result.Output -match $Pattern) `
        "$Name should fail with '$Pattern', output: $($result.Output)"
}

$revisionB = ((& git -C $repositoryRoot rev-parse HEAD) | Out-String).Trim()
$revisionA = ((& git -C $repositoryRoot rev-parse HEAD~1) | Out-String).Trim()
$revisionBeforeA = ((& git -C $repositoryRoot rev-parse HEAD~2) | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Browser evidence contract tests require at least three repository commits.'
}
$fixtureDirectory = Join-Path $repositoryRoot "artifacts\browser-evidence-contract-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $fixtureDirectory | Out-Null
$untrackedFixture = Join-Path $repositoryRoot "browser-evidence-contract-$([Guid]::NewGuid().ToString('N')).json"

try {
    $valid = @{}
    foreach ($phase in @('P6', 'P7', 'P8', 'P9')) {
        $valid[$phase] = New-ValidManifest -Phase $phase -RevisionA $revisionA -RevisionB $revisionB
        Assert-Passes -Manifest $valid[$phase] -Phase $phase -Name "valid-$phase" -Directory $fixtureDirectory
    }

    $bad = Copy-Manifest $valid.P6
    $bad.phase = 'P7'
    Assert-Fails $bad 'P6' 'phase-mismatch' 'must exactly match requested phase P6' $fixtureDirectory

    $bad = Copy-Manifest $valid.P7
    $bad.source_sha = '0123456'
    Assert-Fails $bad 'P7' 'short-revision' 'exact lowercase 40-character' $fixtureDirectory

    $bad = Copy-Manifest $valid.P7
    $bad.tools[0].revision = $revisionA
    Assert-Fails $bad 'P7' 'tool-revision-mismatch' 'must equal manifest.source_sha' $fixtureDirectory

    $bad = Copy-Manifest $valid.P6
    $bad.cases = @($bad.cases | Select-Object -Skip 1)
    $bad.assertions.total = $bad.cases.Count
    Assert-Fails $bad 'P6' 'missing-case-viewport' 'requires exactly .* case/viewport records' $fixtureDirectory

    $bad = Copy-Manifest $valid.P8
    $bad.cases[0].assertions_failed = 1
    Assert-Fails $bad 'P8' 'failed-case-assertion' 'assertions_failed must be between 0 and 0' $fixtureDirectory

    $bad = Copy-Manifest $valid.P7
    $bad.network.observed_negative_events[0].problem_code = 'different_code'
    Assert-Fails $bad 'P7' 'unallowlisted-negative' 'not allowlisted by exact tuple' $fixtureDirectory

    $bad = Copy-Manifest $valid.P7
    $bad.network.expected_negative_allowlist = @($bad.network.expected_negative_allowlist | Where-Object {
        $_.case_id -cne 'tenant-isolation'
    })
    $bad.network.observed_negative_events = @($bad.network.observed_negative_events | Where-Object {
        $_.case_id -cne 'tenant-isolation'
    })
    Assert-Fails $bad 'P7' 'required-negative-case' 'required negative case.*tenant-isolation' $fixtureDirectory

    $bad = Copy-Manifest $valid.P8
    $bad.network.unexpected_500s = 1
    Assert-Fails $bad 'P8' 'unexpected-500' 'unexpected_500s must be between 0 and 0' $fixtureDirectory

    $bad = Copy-Manifest $valid.P8
    $bad.network.unexpected_failures = 1
    Assert-Fails $bad 'P8' 'unexpected-network-failure' 'unexpected_failures must be between 0 and 0' $fixtureDirectory

    $bad = Copy-Manifest $valid.P9
    $bad.console.console_errors = 1
    Assert-Fails $bad 'P9' 'console-error' 'console_errors must be between 0 and 0' $fixtureDirectory

    $bad = Copy-Manifest $valid.P9
    $bad.console.page_errors = 1
    Assert-Fails $bad 'P9' 'page-error' 'page_errors must be between 0 and 0' $fixtureDirectory

    $bad = Copy-Manifest $valid.P9
    $bad.console.uncaught_exceptions = 1
    Assert-Fails $bad 'P9' 'uncaught-exception' 'uncaught_exceptions must be between 0 and 0' $fixtureDirectory

    $bad = Copy-Manifest $valid.P7
    $bad.security.cross_tenant_leaks = 1
    Assert-Fails $bad 'P7' 'cross-tenant-leak' 'cross_tenant_leaks must be between 0 and 0' $fixtureDirectory

    $bad = Copy-Manifest $valid.P8
    $bad.network.cross_origin_leaks = 1
    Assert-Fails $bad 'P8' 'cross-origin-leak' 'cross_origin_leaks must be between 0 and 0' $fixtureDirectory

    $bad = Copy-Manifest $valid.P6
    $bad | Add-Member -NotePropertyName request_body -NotePropertyValue 'forbidden'
    Assert-Fails $bad 'P6' 'raw-request-body' 'forbidden raw sensitive field' $fixtureDirectory

    foreach ($field in @('cookie', 'access_token', 'password', 'otp')) {
        $bad = Copy-Manifest $valid.P6
        $bad | Add-Member -NotePropertyName $field -NotePropertyValue 'forbidden'
        Assert-Fails $bad 'P6' "raw-$($field.Replace('_', '-'))" 'forbidden raw sensitive field' $fixtureDirectory
    }

    $bad = Copy-Manifest $valid.P6
    $bad | Add-Member -NotePropertyName raw_value -NotePropertyValue 'Bearer eyJraw.token.value'
    Assert-Fails $bad 'P6' 'raw-bearer' 'secret-shaped raw evidence' $fixtureDirectory

    $bad = Copy-Manifest $valid.P6
    $bad.swap.document_reloads = 2
    Assert-Fails $bad 'P6' 'reload-loop-count' 'document_reloads must be between 1 and 1' $fixtureDirectory

    $bad = Copy-Manifest $valid.P6
    $bad.swap.reload_loop = $true
    Assert-Fails $bad 'P6' 'reload-loop-flag' 'reload_loop must be false' $fixtureDirectory

    $bad = Copy-Manifest $valid.P6
    $bad.swap.stale_chunk_404s = 2
    Assert-Fails $bad 'P6' 'stale-chunk-count' 'stale_chunk_404s must be between 1 and 1' $fixtureDirectory

    $bad = Copy-Manifest $valid.P6
    $oldChunk = @($bad.network.observed_negative_events | Where-Object {
        $_.problem_code -ceq 'stale_chunk_404'
    })[0]
    $oldChunk.count = 2
    Assert-Fails $bad 'P6' 'old-chunk-observation-count' 'exactly one observed allowlisted old-chunk 404' $fixtureDirectory

    $bad = Copy-Manifest $valid.P6
    $bad.swap.revision_a = $revisionBeforeA
    $bad.swap.oci_revision_a = $revisionBeforeA
    $bad.swap.shell_header_a = $revisionBeforeA
    Assert-Fails $bad 'P6' 'non-adjacent-revisions' 'revisions A and B must be adjacent commits' $fixtureDirectory

    $bad = Copy-Manifest $valid.P7
    $bad.network.expected_negative_allowlist[0].path = '/api/v1/auth/refresh?raw=forbidden'
    Assert-Fails $bad 'P7' 'unsafe-query-path' 'sanitized origin-relative path' $fixtureDirectory

    $bad = Copy-Manifest $valid.P9
    $bad | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $untrackedFixture -Encoding UTF8
    $result = Invoke-Validator -Phase 'P9' -Path $untrackedFixture
    Assert-True ($result.ExitCode -ne 0 -and $result.Output -match 'committed.*or stored under a gitignored evidence path') `
        "untracked-unignored manifest must fail, output: $($result.Output)"
} finally {
    if (Test-Path -LiteralPath $fixtureDirectory) {
        Remove-Item -LiteralPath $fixtureDirectory -Recurse -Force
    }
    if (Test-Path -LiteralPath $untrackedFixture) {
        Remove-Item -LiteralPath $untrackedFixture -Force
    }
}

Write-Host "Browser evidence contract PASS assertions=$assertions"

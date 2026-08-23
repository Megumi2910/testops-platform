[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('P6', 'P7', 'P8', 'P9')]
    [string]$Phase,

    [string]$ManifestPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

trap {
    Write-Host $_.Exception.Message
    exit 1
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$shaPattern = '^[0-9a-f]{40}$'

function Fail-EvidenceValidation {
    param([string]$Message)
    throw "Browser evidence validation failed: $Message"
}

function Assert-Properties {
    param(
        [object]$Object,
        [string[]]$Allowed,
        [string[]]$Required,
        [string]$Context
    )

    if ($null -eq $Object) {
        Fail-EvidenceValidation "$Context must be an object"
    }

    $actual = @($Object.PSObject.Properties.Name)
    foreach ($name in $Required) {
        if (-not ($actual -ccontains $name)) {
            Fail-EvidenceValidation "$Context is missing required property '$name'"
        }
    }
    foreach ($name in $actual) {
        if (-not ($Allowed -ccontains $name)) {
            Fail-EvidenceValidation "$Context contains unsupported property '$name'"
        }
    }
}

function Assert-Boolean {
    param([object]$Value, [bool]$Expected, [string]$Context)
    if (-not ($Value -is [bool]) -or $Value -ne $Expected) {
        Fail-EvidenceValidation "$Context must be $($Expected.ToString().ToLowerInvariant())"
    }
}

function Assert-Integer {
    param(
        [object]$Value,
        [long]$Minimum,
        [long]$Maximum,
        [string]$Context
    )

    $isInteger = $Value -is [byte] -or $Value -is [sbyte] -or $Value -is [int16] -or
        $Value -is [uint16] -or $Value -is [int32] -or $Value -is [uint32] -or
        $Value -is [int64] -or $Value -is [uint64]
    if (-not $isInteger) {
        Fail-EvidenceValidation "$Context must be an integer"
    }
    $number = [long]$Value
    if ($number -lt $Minimum -or $number -gt $Maximum) {
        Fail-EvidenceValidation "$Context must be between $Minimum and $Maximum"
    }
}

function Assert-Zero {
    param([object]$Value, [string]$Context)
    Assert-Integer -Value $Value -Minimum 0 -Maximum 0 -Context $Context
}

function Assert-FullRevision {
    param([object]$Value, [string]$Context)
    if (-not ($Value -is [string]) -or $Value -cnotmatch $shaPattern) {
        Fail-EvidenceValidation "$Context must be an exact lowercase 40-character Git revision"
    }
}

function Assert-SafeIdentifier {
    param([object]$Value, [string]$Context)
    if (-not ($Value -is [string]) -or $Value -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$') {
        Fail-EvidenceValidation "$Context must be a sanitized identifier"
    }
}

function Assert-SafePath {
    param([object]$Value, [string]$Context)
    if (-not ($Value -is [string]) -or $Value -cnotmatch '^/[A-Za-z0-9._~:/{}-]+$') {
        Fail-EvidenceValidation "$Context must be a sanitized origin-relative path without query or fragment data"
    }
    if ($Value.Contains('?') -or $Value.Contains('#') -or $Value.Contains('..') -or $Value.Contains('@')) {
        Fail-EvidenceValidation "$Context contains unsafe path data"
    }
}

function Assert-ProblemCode {
    param([object]$Value, [string]$Context)
    if (-not ($Value -is [string]) -or $Value -cnotmatch '^[a-z][a-z0-9._-]{1,95}$') {
        Fail-EvidenceValidation "$Context must be a sanitized problem code"
    }
}

function Invoke-GitText {
    param([string[]]$Arguments, [string]$Activity)
    $output = & git -C $repositoryRoot @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        Fail-EvidenceValidation "$Activity failed"
    }
    return (($output | Out-String).Trim())
}

function Assert-KnownRevision {
    param([string]$Revision, [string]$Context)
    & git -C $repositoryRoot cat-file -e "$Revision`^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Fail-EvidenceValidation "$Context does not identify a commit in this repository"
    }
}

function Get-RequiredCaseMatrix {
    param([string]$RequestedPhase)

    $desktop = '1440x900'
    $tablet = '768x1024'
    $mobile = '320x800'
    switch ($RequestedPhase) {
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

function Get-RequiredNegativeCases {
    param([string]$RequestedPhase)
    switch ($RequestedPhase) {
        'P6' {
            return @(
                'retained-revision-swap',
                'password-change-wrong-current',
                'password-setup-invalid-code',
                'provider-unlink-blank-password',
                'provider-unlink-wrong-password',
                'provider-unlink-last-method'
            )
        }
        'P7' {
            return @(
                'account-status-session-revocation',
                'role-account-state-denied',
                'tenant-isolation',
                'variable-stale-conflict',
                'variable-reference-conflict',
                'member-duplicate',
                'member-stale-conflict',
                'member-final-manager-conflict',
                'terminal-refresh-json',
                'terminal-refresh-blob'
            )
        }
        'P8' {
            return @(
                'builder-invalid-input',
                'execution-capacity-conflict',
                'execution-cancellation-denied',
                'artifact-suppressed'
            )
        }
        'P9' { return @() }
    }
}

if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $defaultCandidates = @(
        (Join-Path $repositoryRoot "artifacts\browser-evidence\$Phase.json"),
        (Join-Path $repositoryRoot "docs\testing\browser-evidence\$Phase.json")
    )
    $existingCandidates = @($defaultCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
    if ($existingCandidates.Count -eq 0) {
        Fail-EvidenceValidation "no canonical $Phase manifest exists; expected artifacts/browser-evidence/$Phase.json or docs/testing/browser-evidence/$Phase.json"
    }
    if ($existingCandidates.Count -gt 1) {
        Fail-EvidenceValidation "multiple canonical $Phase manifests exist; select one with -ManifestPath"
    }
    $ManifestPath = $existingCandidates[0]
} elseif (-not [IO.Path]::IsPathRooted($ManifestPath)) {
    $ManifestPath = Join-Path $repositoryRoot $ManifestPath
}

$fullManifestPath = [IO.Path]::GetFullPath($ManifestPath)
$rootPrefix = $repositoryRoot.TrimEnd([char[]]@('\', '/')) + [IO.Path]::DirectorySeparatorChar
if (-not $fullManifestPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Fail-EvidenceValidation 'manifest must remain inside the repository'
}
if ([IO.Path]::GetExtension($fullManifestPath) -cne '.json') {
    Fail-EvidenceValidation 'manifest must use the .json extension'
}
if (-not (Test-Path -LiteralPath $fullManifestPath -PathType Leaf)) {
    Fail-EvidenceValidation "manifest does not exist: $fullManifestPath"
}
$manifestItem = Get-Item -LiteralPath $fullManifestPath
if (($manifestItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    Fail-EvidenceValidation 'manifest must not be a symbolic link or reparse point'
}
if ($manifestItem.Length -gt 1MB) {
    Fail-EvidenceValidation 'manifest exceeds the 1 MiB sanitized-evidence limit'
}

$relativeManifestPath = $fullManifestPath.Substring($rootPrefix.Length).Replace('\', '/')
$trackedOutput = @(& git -C $repositoryRoot ls-files -- $relativeManifestPath 2>$null)
$isTracked = $trackedOutput -ccontains $relativeManifestPath
$ignoredOutput = @(& git -C $repositoryRoot ls-files --others --ignored --exclude-standard -- $relativeManifestPath 2>$null)
$isIgnored = $ignoredOutput -ccontains $relativeManifestPath
if (-not $isTracked -and -not $isIgnored) {
    Fail-EvidenceValidation 'manifest must be committed (or staged for commit) or stored under a gitignored evidence path'
}

$rawJson = Get-Content -LiteralPath $fullManifestPath -Raw
if ([string]::IsNullOrWhiteSpace($rawJson)) {
    Fail-EvidenceValidation 'manifest is empty'
}
$sensitiveKeyPattern = '(?i)"(?:[^"]*(?:authorization|cookie|password|otp|access[_-]?token|refresh[_-]?token|request[_-]?body|response[_-]?body|storage[_-]?state|client[_-]?secret)[^"]*|headers?|request[_-]?headers?|response[_-]?headers?)"\s*:'
if ($rawJson -match $sensitiveKeyPattern) {
    Fail-EvidenceValidation 'manifest contains a forbidden raw sensitive field'
}
foreach ($pattern in @(
    '(?i)\bBearer\s+[A-Za-z0-9._~+/-]+=*',
    '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b',
    '(?i)-----BEGIN [A-Z ]*PRIVATE KEY-----',
    '(?i)\b(?:set-cookie|authorization)\s*:'
)) {
    if ($rawJson -match $pattern) {
        Fail-EvidenceValidation 'manifest contains secret-shaped raw evidence'
    }
}

try {
    $manifest = $rawJson | ConvertFrom-Json
} catch {
    Fail-EvidenceValidation "manifest is not valid JSON: $($_.Exception.Message)"
}

$rootAllowed = @(
    'schema_version', 'phase', 'source_sha', 'generated_at_utc', 'sanitized', 'tools',
    'assertions', 'cases', 'network', 'console', 'security'
)
$rootRequired = @($rootAllowed)
if ($Phase -eq 'P6') {
    $rootAllowed += @('retained_swap_run_id', 'swap')
    $rootRequired += @('retained_swap_run_id', 'swap')
}
Assert-Properties -Object $manifest -Allowed $rootAllowed -Required $rootRequired -Context 'manifest'
Assert-Integer -Value $manifest.schema_version -Minimum 1 -Maximum 1 -Context 'manifest.schema_version'
if (-not ($manifest.phase -is [string]) -or $manifest.phase -cne $Phase) {
    Fail-EvidenceValidation "manifest.phase must exactly match requested phase $Phase"
}
Assert-FullRevision -Value $manifest.source_sha -Context 'manifest.source_sha'
Assert-KnownRevision -Revision $manifest.source_sha -Context 'manifest.source_sha'
& git -C $repositoryRoot merge-base --is-ancestor $manifest.source_sha HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
    Fail-EvidenceValidation 'manifest.source_sha must be the current commit or one of its ancestors'
}
Assert-Boolean -Value $manifest.sanitized -Expected $true -Context 'manifest.sanitized'
if (-not ($manifest.generated_at_utc -is [string]) -or $manifest.generated_at_utc -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$') {
    Fail-EvidenceValidation 'manifest.generated_at_utc must be an ISO-8601 UTC timestamp ending in Z'
}
$generatedAt = [DateTimeOffset]::MinValue
if (-not [DateTimeOffset]::TryParse($manifest.generated_at_utc, [ref]$generatedAt)) {
    Fail-EvidenceValidation 'manifest.generated_at_utc is not a valid timestamp'
}
if ($generatedAt -gt [DateTimeOffset]::UtcNow.AddMinutes(5)) {
    Fail-EvidenceValidation 'manifest.generated_at_utc cannot be in the future'
}

$requiredToolIds = @('playwright-mcp', 'chrome-devtools-mcp')
$tools = @($manifest.tools)
if ($tools.Count -ne $requiredToolIds.Count) {
    Fail-EvidenceValidation 'manifest.tools must contain exactly Playwright MCP and Chrome DevTools MCP records'
}
$seenToolIds = @{}
foreach ($tool in $tools) {
    Assert-Properties -Object $tool -Allowed @('id', 'run_id', 'revision', 'capture_count') `
        -Required @('id', 'run_id', 'revision', 'capture_count') -Context 'manifest.tools[]'
    if (-not ($tool.id -is [string]) -or -not ($requiredToolIds -ccontains $tool.id)) {
        Fail-EvidenceValidation "unsupported browser evidence tool id '$($tool.id)'"
    }
    if ($seenToolIds.ContainsKey($tool.id)) {
        Fail-EvidenceValidation "duplicate browser evidence tool id '$($tool.id)'"
    }
    $seenToolIds[$tool.id] = $true
    Assert-SafeIdentifier -Value $tool.run_id -Context "manifest.tools[$($tool.id)].run_id"
    Assert-FullRevision -Value $tool.revision -Context "manifest.tools[$($tool.id)].revision"
    if ($tool.revision -cne $manifest.source_sha) {
        Fail-EvidenceValidation "manifest.tools[$($tool.id)].revision must equal manifest.source_sha"
    }
    Assert-Integer -Value $tool.capture_count -Minimum 1 -Maximum 1000000 `
        -Context "manifest.tools[$($tool.id)].capture_count"
}

Assert-Properties -Object $manifest.assertions -Allowed @('total', 'failed') -Required @('total', 'failed') `
    -Context 'manifest.assertions'
Assert-Integer -Value $manifest.assertions.total -Minimum 1 -Maximum 10000000 -Context 'manifest.assertions.total'
Assert-Zero -Value $manifest.assertions.failed -Context 'manifest.assertions.failed'

$caseMatrix = Get-RequiredCaseMatrix -RequestedPhase $Phase
$expectedCaseKeys = @{}
foreach ($entry in $caseMatrix.GetEnumerator()) {
    foreach ($viewport in @($entry.Value)) {
        $expectedCaseKeys["$($entry.Key)|$viewport"] = $true
    }
}
$caseRecords = @($manifest.cases)
if ($caseRecords.Count -ne $expectedCaseKeys.Count) {
    Fail-EvidenceValidation "$Phase requires exactly $($expectedCaseKeys.Count) case/viewport records; found $($caseRecords.Count)"
}
$seenCaseKeys = @{}
[long]$caseAssertionTotal = 0
foreach ($case in $caseRecords) {
    Assert-Properties -Object $case -Allowed @('id', 'viewport', 'status', 'assertions_total', 'assertions_failed') `
        -Required @('id', 'viewport', 'status', 'assertions_total', 'assertions_failed') -Context 'manifest.cases[]'
    if (-not ($case.id -is [string]) -or $case.id -cnotmatch '^[a-z][a-z0-9-]{2,95}$') {
        Fail-EvidenceValidation 'manifest.cases[].id must be a sanitized case id'
    }
    if (-not ($case.viewport -is [string]) -or $case.viewport -cnotmatch '^[1-9][0-9]{2,3}x[1-9][0-9]{2,3}$') {
        Fail-EvidenceValidation "case '$($case.id)' has an invalid viewport"
    }
    $caseKey = "$($case.id)|$($case.viewport)"
    if (-not $expectedCaseKeys.ContainsKey($caseKey)) {
        Fail-EvidenceValidation "$Phase does not allow case/viewport record '$caseKey'"
    }
    if ($seenCaseKeys.ContainsKey($caseKey)) {
        Fail-EvidenceValidation "duplicate case/viewport record '$caseKey'"
    }
    $seenCaseKeys[$caseKey] = $true
    if (-not ($case.status -is [string]) -or $case.status -cne 'passed') {
        Fail-EvidenceValidation "case '$caseKey' must have status passed"
    }
    Assert-Integer -Value $case.assertions_total -Minimum 1 -Maximum 1000000 `
        -Context "case '$caseKey'.assertions_total"
    Assert-Zero -Value $case.assertions_failed -Context "case '$caseKey'.assertions_failed"
    $caseAssertionTotal += [long]$case.assertions_total
}
if ([long]$manifest.assertions.total -ne $caseAssertionTotal) {
    Fail-EvidenceValidation "manifest.assertions.total must equal the case assertion sum $caseAssertionTotal"
}

Assert-Properties -Object $manifest.network `
    -Allowed @('expected_negative_allowlist', 'observed_negative_events', 'unexpected_failures', 'unexpected_500s', 'cross_tenant_leaks', 'cross_origin_leaks') `
    -Required @('expected_negative_allowlist', 'observed_negative_events', 'unexpected_failures', 'unexpected_500s', 'cross_tenant_leaks', 'cross_origin_leaks') `
    -Context 'manifest.network'
foreach ($counter in @('unexpected_failures', 'unexpected_500s', 'cross_tenant_leaks', 'cross_origin_leaks')) {
    Assert-Zero -Value $manifest.network.$counter -Context "manifest.network.$counter"
}

$allowlist = @($manifest.network.expected_negative_allowlist)
$observedNegatives = @($manifest.network.observed_negative_events)
$allowlistKeys = @{}
foreach ($entry in $allowlist) {
    Assert-Properties -Object $entry -Allowed @('case_id', 'method', 'path', 'status', 'problem_code') `
        -Required @('case_id', 'method', 'path', 'status', 'problem_code') -Context 'manifest.network.expected_negative_allowlist[]'
    if (-not ($caseMatrix.Contains($entry.case_id))) {
        Fail-EvidenceValidation "negative allowlist references unknown case '$($entry.case_id)'"
    }
    if (-not ($entry.method -is [string]) -or -not (@('GET', 'POST', 'PUT', 'PATCH', 'DELETE') -ccontains $entry.method)) {
        Fail-EvidenceValidation 'negative allowlist method must be an uppercase supported HTTP method'
    }
    Assert-SafePath -Value $entry.path -Context 'negative allowlist path'
    Assert-Integer -Value $entry.status -Minimum 400 -Maximum 499 -Context 'negative allowlist status'
    Assert-ProblemCode -Value $entry.problem_code -Context 'negative allowlist problem_code'
    $key = "$($entry.case_id)|$($entry.method)|$($entry.path)|$($entry.status)|$($entry.problem_code)"
    if ($allowlistKeys.ContainsKey($key)) {
        Fail-EvidenceValidation "duplicate expected-negative allowlist tuple '$key'"
    }
    $allowlistKeys[$key] = $true
}

$observedKeys = @{}
foreach ($entry in $observedNegatives) {
    Assert-Properties -Object $entry -Allowed @('case_id', 'method', 'path', 'status', 'problem_code', 'count') `
        -Required @('case_id', 'method', 'path', 'status', 'problem_code', 'count') -Context 'manifest.network.observed_negative_events[]'
    if (-not ($caseMatrix.Contains($entry.case_id))) {
        Fail-EvidenceValidation "observed negative references unknown case '$($entry.case_id)'"
    }
    if (-not ($entry.method -is [string]) -or -not (@('GET', 'POST', 'PUT', 'PATCH', 'DELETE') -ccontains $entry.method)) {
        Fail-EvidenceValidation 'observed negative method must be an uppercase supported HTTP method'
    }
    Assert-SafePath -Value $entry.path -Context 'observed negative path'
    Assert-Integer -Value $entry.status -Minimum 400 -Maximum 499 -Context 'observed negative status'
    Assert-ProblemCode -Value $entry.problem_code -Context 'observed negative problem_code'
    Assert-Integer -Value $entry.count -Minimum 1 -Maximum 1000000 -Context 'observed negative count'
    $key = "$($entry.case_id)|$($entry.method)|$($entry.path)|$($entry.status)|$($entry.problem_code)"
    if (-not $allowlistKeys.ContainsKey($key)) {
        Fail-EvidenceValidation "observed negative is not allowlisted by exact tuple '$key'"
    }
    if ($observedKeys.ContainsKey($key)) {
        Fail-EvidenceValidation "duplicate observed-negative tuple '$key'"
    }
    $observedKeys[$key] = [long]$entry.count
}
foreach ($key in $allowlistKeys.Keys) {
    if (-not $observedKeys.ContainsKey($key)) {
        Fail-EvidenceValidation "allowlisted negative was not observed '$key'"
    }
}
foreach ($requiredCase in @(Get-RequiredNegativeCases -RequestedPhase $Phase)) {
    $hasNegative = @($allowlist | Where-Object { $_.case_id -ceq $requiredCase }).Count -gt 0
    if (-not $hasNegative) {
        Fail-EvidenceValidation "required negative case '$requiredCase' has no exact allowlisted observation"
    }
}

Assert-Properties -Object $manifest.console -Allowed @('console_errors', 'uncaught_exceptions', 'page_errors') `
    -Required @('console_errors', 'uncaught_exceptions', 'page_errors') -Context 'manifest.console'
foreach ($counter in @('console_errors', 'uncaught_exceptions', 'page_errors')) {
    Assert-Zero -Value $manifest.console.$counter -Context "manifest.console.$counter"
}

Assert-Properties -Object $manifest.security `
    -Allowed @('secrets_detected', 'sensitive_fields_detected', 'raw_artifacts_included', 'cross_tenant_leaks', 'cross_origin_leaks') `
    -Required @('secrets_detected', 'sensitive_fields_detected', 'raw_artifacts_included', 'cross_tenant_leaks', 'cross_origin_leaks') `
    -Context 'manifest.security'
Assert-Zero -Value $manifest.security.secrets_detected -Context 'manifest.security.secrets_detected'
Assert-Zero -Value $manifest.security.cross_tenant_leaks -Context 'manifest.security.cross_tenant_leaks'
Assert-Zero -Value $manifest.security.cross_origin_leaks -Context 'manifest.security.cross_origin_leaks'
Assert-Boolean -Value $manifest.security.raw_artifacts_included -Expected $false `
    -Context 'manifest.security.raw_artifacts_included'
if (@($manifest.security.sensitive_fields_detected).Count -ne 0) {
    Fail-EvidenceValidation 'manifest.security.sensitive_fields_detected must be empty'
}

if ($Phase -eq 'P6') {
    Assert-SafeIdentifier -Value $manifest.retained_swap_run_id -Context 'manifest.retained_swap_run_id'
    $swapFields = @(
        'revision_a', 'revision_b', 'adjacent', 'source_delta_path', 'marker_absent_in_a',
        'marker_present_in_b', 'oci_revision_a', 'oci_revision_b', 'shell_header_a',
        'final_header_b', 'static_asset_header_b', 'static_404_header_b', 'proxy_headers_absent',
        'document_reloads', 'stale_chunk_404s', 'recovery_marker_a', 'final_marker_b', 'reload_loop',
        'initial_asset_path', 'final_asset_path'
    )
    Assert-Properties -Object $manifest.swap -Allowed $swapFields -Required $swapFields -Context 'manifest.swap'
    foreach ($name in @('revision_a', 'revision_b', 'oci_revision_a', 'oci_revision_b', 'shell_header_a',
            'final_header_b', 'static_asset_header_b', 'static_404_header_b')) {
        Assert-FullRevision -Value $manifest.swap.$name -Context "manifest.swap.$name"
    }
    if ($manifest.swap.revision_b -cne $manifest.source_sha) {
        Fail-EvidenceValidation 'manifest.swap.revision_b must equal manifest.source_sha'
    }
    foreach ($name in @('oci_revision_a', 'shell_header_a')) {
        if ($manifest.swap.$name -cne $manifest.swap.revision_a) {
            Fail-EvidenceValidation "manifest.swap.$name must exactly equal manifest.swap.revision_a"
        }
    }
    foreach ($name in @('oci_revision_b', 'final_header_b', 'static_asset_header_b', 'static_404_header_b')) {
        if ($manifest.swap.$name -cne $manifest.swap.revision_b) {
            Fail-EvidenceValidation "manifest.swap.$name must exactly equal manifest.swap.revision_b"
        }
    }
    if ($manifest.swap.revision_a -ceq $manifest.swap.revision_b) {
        Fail-EvidenceValidation 'manifest.swap revisions A and B must be distinct'
    }
    Assert-KnownRevision -Revision $manifest.swap.revision_a -Context 'manifest.swap.revision_a'
    Assert-KnownRevision -Revision $manifest.swap.revision_b -Context 'manifest.swap.revision_b'
    & git -C $repositoryRoot merge-base --is-ancestor $manifest.swap.revision_a $manifest.swap.revision_b 2>$null
    if ($LASTEXITCODE -ne 0) {
        Fail-EvidenceValidation 'manifest.swap revision A must be an ancestor of revision B'
    }
    $adjacentCount = Invoke-GitText -Arguments @('rev-list', '--count', "$($manifest.swap.revision_a)..$($manifest.swap.revision_b)") `
        -Activity 'revision adjacency check'
    if ($adjacentCount -cne '1') {
        Fail-EvidenceValidation 'manifest.swap revisions A and B must be adjacent commits'
    }
    Assert-Boolean -Value $manifest.swap.adjacent -Expected $true -Context 'manifest.swap.adjacent'
    if (-not ($manifest.swap.source_delta_path -is [string]) -or
        $manifest.swap.source_delta_path -cnotmatch '^[A-Za-z0-9._/-]+$' -or
        $manifest.swap.source_delta_path.StartsWith('/') -or
        $manifest.swap.source_delta_path.Contains('..') -or
        $manifest.swap.source_delta_path.Contains('//')) {
        Fail-EvidenceValidation 'manifest.swap.source_delta_path must be one sanitized repository-relative path'
    }
    $changedDelta = Invoke-GitText -Arguments @(
        'diff', '--name-only', $manifest.swap.revision_a, $manifest.swap.revision_b, '--', $manifest.swap.source_delta_path
    ) -Activity 'revision source-delta check'
    if ($changedDelta.Replace('\', '/') -cne $manifest.swap.source_delta_path) {
        Fail-EvidenceValidation 'manifest.swap.source_delta_path must be the exact adjacent revision-B source delta'
    }
    Assert-Boolean -Value $manifest.swap.marker_absent_in_a -Expected $true -Context 'manifest.swap.marker_absent_in_a'
    Assert-Boolean -Value $manifest.swap.marker_present_in_b -Expected $true -Context 'manifest.swap.marker_present_in_b'
    Assert-Boolean -Value $manifest.swap.proxy_headers_absent -Expected $true -Context 'manifest.swap.proxy_headers_absent'
    Assert-Integer -Value $manifest.swap.document_reloads -Minimum 1 -Maximum 1 -Context 'manifest.swap.document_reloads'
    Assert-Integer -Value $manifest.swap.stale_chunk_404s -Minimum 1 -Maximum 1 -Context 'manifest.swap.stale_chunk_404s'
    Assert-Boolean -Value $manifest.swap.recovery_marker_a -Expected $true -Context 'manifest.swap.recovery_marker_a'
    Assert-Boolean -Value $manifest.swap.final_marker_b -Expected $true -Context 'manifest.swap.final_marker_b'
    Assert-Boolean -Value $manifest.swap.reload_loop -Expected $false -Context 'manifest.swap.reload_loop'
    foreach ($name in @('initial_asset_path', 'final_asset_path')) {
        Assert-SafePath -Value $manifest.swap.$name -Context "manifest.swap.$name"
        if ($manifest.swap.$name -cnotmatch '^/assets/[A-Za-z0-9._-]+\.js$') {
            Fail-EvidenceValidation "manifest.swap.$name must identify one sanitized JavaScript asset"
        }
    }
    if ($manifest.swap.initial_asset_path -ceq $manifest.swap.final_asset_path) {
        Fail-EvidenceValidation 'manifest.swap initial and final asset paths must be distinct'
    }

    $oldChunkAllowlist = @($allowlist | Where-Object {
        $_.case_id -ceq 'retained-revision-swap' -and $_.method -ceq 'GET' -and
        [long]$_.status -eq 404 -and $_.problem_code -ceq 'stale_chunk_404'
    })
    if ($oldChunkAllowlist.Count -ne 1) {
        Fail-EvidenceValidation 'P6 requires exactly one retained-swap old-chunk 404 allowlist tuple'
    }
    $oldChunkKey = "retained-revision-swap|GET|$($oldChunkAllowlist[0].path)|404|stale_chunk_404"
    if (-not $observedKeys.ContainsKey($oldChunkKey) -or $observedKeys[$oldChunkKey] -ne 1) {
        Fail-EvidenceValidation 'P6 requires exactly one observed allowlisted old-chunk 404'
    }
    if ($oldChunkAllowlist[0].path -cnotmatch '^/assets/[A-Za-z0-9._-]+\.js$') {
        Fail-EvidenceValidation 'P6 old-chunk path must identify one sanitized JavaScript asset'
    }
}

Write-Host "Browser evidence PASS phase=$Phase manifest=$relativeManifestPath cases=$($caseRecords.Count) assertions=$caseAssertionTotal expected_negatives=$($allowlist.Count) source_sha=$($manifest.source_sha)"

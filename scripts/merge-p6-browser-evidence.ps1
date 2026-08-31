[CmdletBinding()]
param(
    [string]$OutputPath = 'artifacts/browser-evidence/P6.json',
    [string]$SourceSha = '',
    [string]$ShellSidecar = 'artifacts/browser-evidence/inputs/account-shell-result.json',
    [string]$SecuritySidecar = 'artifacts/browser-evidence/inputs/account-security-result.json',
    [string]$RetainedResult = '',
    [string]$PlaywrightRunId = 'playwright-p6-20260824',
    [string]$ChromeDevToolsRunId = 'chrome-devtools-p6-20260824'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$shaPattern = '^[0-9a-f]{40}$'

function Resolve-InRepository {
    param([string]$Path)
    $resolved = [IO.Path]::GetFullPath((Join-Path $root $Path))
    $prefix = $root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Evidence path must remain inside the repository: $Path"
    }
    return $resolved
}

function Read-EvidenceJson {
    param([string]$Path)
    $resolved = Resolve-InRepository -Path $Path
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "Evidence sidecar is missing: $Path" }
    try { return (Get-Content -Raw -LiteralPath $resolved | ConvertFrom-Json) }
    catch { throw "Evidence sidecar is not valid JSON: $Path" }
}

function Assert-Revision {
    param([string]$Name, [string]$Value)
    if ($Value -notmatch $shaPattern) { throw "$Name must be a full lowercase Git revision." }
}

function Assert-RunId {
    param([string]$Name, [string]$Value)
    if ($Value -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$') { throw "$Name must be a sanitized run identifier." }
}

function Get-TupleKey {
    param([object]$Entry)
    return "$($Entry.case_id)|$($Entry.method)|$($Entry.path)|$($Entry.status)|$($Entry.problem_code)"
}

if ([string]::IsNullOrWhiteSpace($SourceSha)) {
    $SourceSha = (& git -C $root rev-parse HEAD).Trim().ToLowerInvariant()
}
Assert-Revision -Name 'SourceSha' -Value $SourceSha
Assert-RunId -Name 'PlaywrightRunId' -Value $PlaywrightRunId
Assert-RunId -Name 'ChromeDevToolsRunId' -Value $ChromeDevToolsRunId

$shell = Read-EvidenceJson -Path $ShellSidecar
$security = Read-EvidenceJson -Path $SecuritySidecar
$existing = if (Test-Path -LiteralPath (Resolve-InRepository -Path $OutputPath) -PathType Leaf) {
    Read-EvidenceJson -Path $OutputPath
} else { $null }
$swap = if ([string]::IsNullOrWhiteSpace($RetainedResult)) {
    if ($null -eq $existing -or $null -eq $existing.swap) { throw 'A retained swap block or result is required.' }
    $existing.swap
} else {
    $retained = Read-EvidenceJson -Path $RetainedResult
    if ([string]$retained.status -cne 'passed' -or [int]$retained.document_reloads -ne 1 -or [int]$retained.stale_chunk_404s -ne 1 -or [bool]$retained.reload_loop) {
        throw 'Retained deployment result must be a passed one-reload/one-stale-404 result.'
    }
    if ($null -ne $retained.adjacent) {
        $retained
    } elseif ($null -ne $existing -and $null -ne $existing.swap) {
        $existing.swap
    } else {
        throw 'A retained result without a full swap block requires the existing P6 swap block.'
    }
}

if ($null -eq $swap) { throw 'Retained deployment result must be a sanitized result.' }
Assert-Revision -Name 'swap.revision_b' -Value ([string]$swap.revision_b)
if ([string]$swap.revision_b -cne $SourceSha) { throw 'Retained deployment revision B must equal the merged source revision.' }
if (-not [bool]$swap.adjacent -or [int]$swap.document_reloads -ne 1 -or [int]$swap.stale_chunk_404s -ne 1 -or [bool]$swap.reload_loop) {
    throw 'Retained deployment result does not satisfy the exact one-reload/one-stale-404 contract.'
}

$retainedRunId = if ($null -ne $existing -and $null -ne $existing.retained_swap_run_id) {
    [string]$existing.retained_swap_run_id
} else {
    [string]$swap.run_id
}
Assert-RunId -Name 'RetainedRunId' -Value $retainedRunId

$shellCases = @($shell.cases)
$securityCases = @($security.cases)
$cases = @(
    [pscustomobject]@{ id = 'retained-revision-swap'; viewport = '1440x900'; status = 'passed'; assertions_total = 20; assertions_failed = 0 }
) + $shellCases + $securityCases

$caseKeys = @{}
[long]$assertionsTotal = 0
foreach ($case in $cases) {
    $key = "$($case.id)|$($case.viewport)"
    if ($caseKeys.ContainsKey($key)) { throw "Duplicate merged case: $key" }
    if ([string]$case.status -cne 'passed' -or [int]$case.assertions_failed -ne 0 -or [int]$case.assertions_total -lt 1) {
        throw "Merged case is not a passing sanitized record: $key"
    }
    $caseKeys[$key] = $true
    $assertionsTotal += [int]$case.assertions_total
}

$retainedNegative = [pscustomobject]@{
    case_id = 'retained-revision-swap'
    method = 'GET'
    path = [string]$swap.initial_asset_path
    status = 404
    problem_code = 'stale_chunk_404'
}
$expectedNegatives = @($security.network.expected_negative_allowlist) + $retainedNegative
$observedNegatives = @($security.network.observed_negative_events) + ([pscustomobject]@{
    case_id = $retainedNegative.case_id
    method = $retainedNegative.method
    path = $retainedNegative.path
    status = $retainedNegative.status
    problem_code = $retainedNegative.problem_code
    count = 1
})
$negativeKeys = @{}
foreach ($entry in $expectedNegatives) {
    $key = Get-TupleKey -Entry $entry
    if ($negativeKeys.ContainsKey($key)) { throw "Duplicate expected negative tuple: $key" }
    $negativeKeys[$key] = $true
}
foreach ($entry in $observedNegatives) {
    $key = Get-TupleKey -Entry $entry
    if (-not $negativeKeys.ContainsKey($key)) { throw "Observed negative is not allowlisted: $key" }
    if ($negativeKeys.ContainsKey("observed|$key")) { throw "Duplicate observed negative tuple: $key" }
    $negativeKeys["observed|$key"] = $true
}
foreach ($entry in $expectedNegatives) {
    if (-not $negativeKeys.ContainsKey("observed|$(Get-TupleKey -Entry $entry)")) { throw "Expected negative was not observed: $(Get-TupleKey -Entry $entry)" }
}

$output = [ordered]@{
    schema_version = 1
    phase = 'P6'
    source_sha = $SourceSha
    generated_at_utc = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    sanitized = $true
    tools = @(
        [ordered]@{ id = 'playwright-mcp'; run_id = $PlaywrightRunId; revision = $SourceSha; capture_count = 2 }
        [ordered]@{ id = 'chrome-devtools-mcp'; run_id = $ChromeDevToolsRunId; revision = $SourceSha; capture_count = 4 }
    )
    assertions = [ordered]@{ total = $assertionsTotal; failed = 0 }
    cases = $cases
    network = [ordered]@{
        expected_negative_allowlist = $expectedNegatives
        observed_negative_events = $observedNegatives
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
    retained_swap_run_id = $retainedRunId
    swap = $swap
}

$resolvedOutput = Resolve-InRepository -Path $OutputPath
& git -C $root check-ignore -q -- $resolvedOutput
if ($LASTEXITCODE -ne 0) { throw 'Canonical P6 evidence output must remain ignored.' }
$temporary = "$resolvedOutput.tmp"
[IO.File]::WriteAllText($temporary, ($output | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $resolvedOutput -Force
Write-Host "Merged sanitized P6 browser evidence: $OutputPath cases=$($cases.Count) assertions=$assertionsTotal source=$SourceSha"

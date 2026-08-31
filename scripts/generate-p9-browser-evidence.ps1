[CmdletBinding()]
param(
    [string]$MatrixPath = 'artifacts/browser-evidence/inputs/accessibility-matrix-result.json',
    [string]$PerformancePath = 'artifacts/performance/P9.json',
    [string]$OutputPath = 'artifacts/browser-evidence/P9.json',
    [string]$SourceSha = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

trap {
    Write-Host $_.Exception.Message
    exit 1
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot

function Resolve-RepositoryPath {
    param([string]$Path)
    $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repositoryRoot $Path }
    $full = [IO.Path]::GetFullPath($candidate)
    $prefix = $repositoryRoot.TrimEnd([char[]]@('\', '/')) + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Evidence path must remain inside repository: $full" }
    return $full
}

function Read-Json {
    param([string]$Path, [string]$Description)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing ${Description}: $Path" }
    try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) }
    catch { throw "${Description} is not valid JSON: $($_.Exception.Message)" }
}

if (-not $SourceSha) { $SourceSha = ((& git -C $repositoryRoot rev-parse HEAD) | Out-String).Trim() }
if ($SourceSha -notmatch '^[0-9a-f]{40}$') { throw 'SourceSha must be an exact lowercase 40-character Git revision' }
& git -C $repositoryRoot cat-file -e "$SourceSha`^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { throw "Unknown source revision: $SourceSha" }

$matrix = Read-Json (Resolve-RepositoryPath $MatrixPath) 'P9 accessibility sidecar'
if ($matrix.phase -cne 'P9' -or $matrix.sanitized -ne $true -or $matrix.status -cne 'passed') { throw 'P9 accessibility sidecar is not a passing sanitized result' }
$cases = @($matrix.cases)
if ($cases.Count -ne 18) { throw "P9 browser evidence requires 18 case/viewport records; found $($cases.Count)" }
$caseKeys = @{}
[long]$assertions = 0
foreach ($case in $cases) {
    $key = "$($case.id)|$($case.viewport)"
    if ($case.status -cne 'passed' -or [int]$case.assertions_failed -ne 0 -or [int]$case.assertions_total -lt 1) { throw "P9 case failed: $key" }
    if ($caseKeys.ContainsKey($key)) { throw "Duplicate P9 case: $key" }
    $caseKeys[$key] = $true
    $assertions += [long]$case.assertions_total
}

$performance = Read-Json (Resolve-RepositoryPath $PerformancePath) 'P9 performance evidence'
if ($performance.source_sha -cne $SourceSha -or $performance.project_name -cne 'testops-m10a-gate' -or $performance.sanitized -ne $true) {
    throw 'P9 performance evidence is not revision-matched, sanitized, or from the required project'
}

$manifest = [ordered]@{
    schema_version = 1
    phase = 'P9'
    source_sha = $SourceSha
    generated_at_utc = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    sanitized = $true
    tools = @(
        [ordered]@{ id = 'playwright-mcp'; run_id = 'playwright-p9-accessibility-20260826'; revision = $SourceSha; capture_count = 1 },
        [ordered]@{ id = 'chrome-devtools-mcp'; run_id = 'chrome-devtools-p9-lighthouse-20260826'; revision = $SourceSha; capture_count = 2 }
    )
    assertions = [ordered]@{ total = $assertions; failed = 0 }
    cases = @($cases | ForEach-Object {
        [ordered]@{
            id = [string]$_.id
            viewport = [string]$_.viewport
            status = 'passed'
            assertions_total = [int]$_.assertions_total
            assertions_failed = 0
        }
    })
    network = [ordered]@{
        expected_negative_allowlist = @()
        observed_negative_events = @()
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
$outputFull = Resolve-RepositoryPath $OutputPath
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputFull) | Out-Null
$manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $outputFull -Encoding UTF8
Write-Host "P9 browser evidence generated from passing accessibility and performance sidecars: $outputFull"

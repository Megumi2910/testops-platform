[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProjectName,
    [string]$SourceSha = '',
    [string]$MatrixPath = 'artifacts/browser-evidence/inputs/accessibility-matrix-result.json',
    [string]$ChromePath = 'artifacts/performance/chrome-lighthouse.json',
    [string]$OutputPath = 'artifacts/performance/P9.json'
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
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path must remain inside repository: $full" }
    return $full
}

function Require-Json {
    param([string]$Path, [string]$Description)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing ${Description}: $Path" }
    try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) }
    catch { throw "${Description} is not valid JSON: $($_.Exception.Message)" }
}

if (-not $SourceSha) { $SourceSha = ((& git -C $repositoryRoot rev-parse HEAD) | Out-String).Trim() }
if ($SourceSha -notmatch '^[0-9a-f]{40}$') { throw 'SourceSha must be an exact lowercase 40-character Git revision' }
& git -C $repositoryRoot cat-file -e "$SourceSha`^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { throw "Unknown source revision: $SourceSha" }

$matrix = Require-Json (Resolve-RepositoryPath $MatrixPath) 'P9 matrix sidecar'
if ($matrix.phase -cne 'P9' -or $matrix.sanitized -ne $true -or $matrix.status -cne 'passed') { throw 'P9 matrix sidecar is not a passing sanitized result' }
$matrixPerformance = @($matrix.performance)
if ($matrixPerformance.Count -ne 12) { throw "P9 matrix must provide exactly 12 route/viewport performance records; found $($matrixPerformance.Count)" }

$expectedRoutes = @('readiness', 'projects', 'dashboard', 'account')
$expectedViewports = @('1440x900', '768x1024', '320x800')
$seen = @{}
foreach ($record in $matrixPerformance) {
    if ($record.route -notin $expectedRoutes -or $record.viewport -notin $expectedViewports) { throw 'P9 matrix contains an unexpected route or viewport' }
    $key = "$($record.route)|$($record.viewport)"
    if ($seen.ContainsKey($key)) { throw "Duplicate P9 performance record: $key" }
    $seen[$key] = $true
    if ([int]$record.accessibility_score -lt 95 -or [double]$record.lcp_ms -gt 2500 -or [double]$record.cls -gt 0.1) {
        throw "P9 matrix threshold failed for $key"
    }
}

$chrome = Require-Json (Resolve-RepositoryPath $ChromePath) 'Chrome Lighthouse sidecar'
if ($chrome.tool -cne 'chrome-devtools-mcp' -or $chrome.sanitized -ne $true) { throw 'Chrome sidecar must identify chrome-devtools-mcp and be sanitized' }
$chromeCaptures = @($chrome.captures)
if ($chromeCaptures.Count -lt 2) { throw 'Chrome sidecar must contain desktop and mobile captures' }
foreach ($capture in $chromeCaptures) {
    if ($capture.route -ne 'readiness' -or $capture.viewport -notin $expectedViewports -or
        [int]$capture.accessibility_score -lt 95 -or [double]$capture.lcp_ms -gt 2500 -or [double]$capture.cls -gt 0.1) {
        throw 'Chrome Lighthouse capture failed route, viewport, or release thresholds'
    }
}

$output = [ordered]@{
    schema_version = 1
    project_name = $ProjectName
    source_sha = $SourceSha
    generated_at_utc = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    sanitized = $true
    thresholds = [ordered]@{ accessibility_min = 95; lcp_max_ms = 2500; cls_max = 0.1 }
    lighthouse = [ordered]@{ tool = 'chrome-devtools-mcp'; captures = $chromeCaptures }
    routes = @($matrixPerformance | ForEach-Object {
        [ordered]@{
            route = [string]$_.route
            viewport = [string]$_.viewport
            accessibility_score = [int]$_.accessibility_score
            lcp_ms = [double]$_.lcp_ms
            cls = [double]$_.cls
            source = 'playwright-chromium-performance-observer'
        }
    })
}
$outputFull = Resolve-RepositoryPath $OutputPath
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputFull) | Out-Null
$output | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $outputFull -Encoding UTF8
Write-Host "P9 performance evidence recorded: $outputFull"

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProjectName,
    [string]$EvidencePath = 'artifacts/performance/P9.json'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

trap {
    Write-Host $_.Exception.Message
    exit 1
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$path = if ([IO.Path]::IsPathRooted($EvidencePath)) { $EvidencePath } else { Join-Path $repositoryRoot $EvidencePath }
if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing performance evidence: $path" }
$raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
if ($raw -match '(?i)authorization|cookie|password|otp|access[_-]?token|refresh[_-]?token|request[_-]?body|response[_-]?body') {
    throw 'Performance evidence contains forbidden sensitive fields'
}
$evidence = $raw | ConvertFrom-Json
if ($evidence.project_name -cne $ProjectName -or $evidence.schema_version -ne 1 -or $evidence.sanitized -ne $true) {
    throw 'Performance evidence project/schema/sanitized fields do not match'
}
$sourceSha = ((& git -C $repositoryRoot rev-parse HEAD) | Out-String).Trim()
if ($evidence.source_sha -cne $sourceSha) { throw "Performance evidence revision $($evidence.source_sha) does not match HEAD $sourceSha" }
& git -C $repositoryRoot cat-file -e "$($evidence.source_sha)`^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Performance evidence source revision is not a repository commit' }

$thresholds = $evidence.thresholds
if ([int]$thresholds.accessibility_min -ne 95 -or [int]$thresholds.lcp_max_ms -ne 2500 -or [double]$thresholds.cls_max -ne 0.1) {
    throw 'Performance evidence thresholds must match the P9 release contract'
}
$routes = @($evidence.routes)
if ($routes.Count -ne 12) { throw "Performance evidence requires 12 route/viewport records; found $($routes.Count)" }
$expectedRoutes = @('readiness', 'projects', 'dashboard', 'account')
$expectedViewports = @('1440x900', '768x1024', '320x800')
$keys = @{}
foreach ($route in $routes) {
    if ($route.route -notin $expectedRoutes -or $route.viewport -notin $expectedViewports) { throw 'Performance evidence contains an unexpected route or viewport' }
    $key = "$($route.route)|$($route.viewport)"
    if ($keys.ContainsKey($key)) { throw "Duplicate performance record: $key" }
    $keys[$key] = $true
    if ([int]$route.accessibility_score -lt 95 -or [double]$route.lcp_ms -gt 2500 -or [double]$route.cls -gt 0.1) {
        throw "Performance threshold failed for $key"
    }
}
$lighthouse = $evidence.lighthouse
if ($lighthouse.tool -cne 'chrome-devtools-mcp') { throw 'Lighthouse evidence must identify Chrome DevTools MCP' }
$captures = @($lighthouse.captures)
if ($captures.Count -lt 2) { throw 'Lighthouse evidence must include desktop and mobile captures' }
$captureViewports = @{}
foreach ($capture in $captures) {
    if ($capture.route -ne 'readiness' -or $capture.viewport -notin $expectedViewports) { throw 'Invalid Lighthouse capture identity' }
    $captureViewports[$capture.viewport] = $true
    if ([int]$capture.accessibility_score -lt 95 -or [double]$capture.lcp_ms -gt 2500 -or [double]$capture.cls -gt 0.1) { throw 'Lighthouse threshold failed' }
}
if (-not $captureViewports.ContainsKey('1440x900') -or -not $captureViewports.ContainsKey('320x800')) { throw 'Lighthouse desktop and mobile captures are required' }
Write-Host "Performance evidence PASS project=$ProjectName routes=$($routes.Count) lighthouse_captures=$($captures.Count) source_sha=$sourceSha"

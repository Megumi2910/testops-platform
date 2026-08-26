[CmdletBinding()]
param(
    [string]$MilestonePath = '',
    [string]$ManifestPath = '',
    [string]$P9EvidencePath = '',
    [string]$P8EvidencePath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($MilestonePath)) { $MilestonePath = Join-Path $repositoryRoot 'docs/milestones/15-milestone-10a-testops-completion.md' }
if ([string]::IsNullOrWhiteSpace($ManifestPath)) { $ManifestPath = Join-Path $repositoryRoot 'DOCUMENTATION-MANIFEST.json' }
if ([string]::IsNullOrWhiteSpace($P9EvidencePath)) { $P9EvidencePath = Join-Path $repositoryRoot 'artifacts/browser-evidence/P9.json' }
if ([string]::IsNullOrWhiteSpace($P8EvidencePath)) { $P8EvidencePath = Join-Path $repositoryRoot 'artifacts/browser-evidence/P8.json' }

function Fail-Milestone {
    param([string]$Message)
    throw "Milestone ledger validation failed: $Message"
}

foreach ($path in @($MilestonePath, $ManifestPath, $P9EvidencePath, $P8EvidencePath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Fail-Milestone "missing required evidence/document '$path'" }
}

$milestone = Get-Content -LiteralPath $MilestonePath -Raw
if ($milestone -notmatch '(?ms)^##\s+Phase 8 completion.*?\*\*Status:\s*PASS\b') {
    Fail-Milestone 'Phase 8 completion is not marked PASS'
}
if ($milestone -notmatch '(?ms)^##\s+Phase 9 completion.*?\*\*Status:\s*PASS\b') {
    Fail-Milestone 'Phase 9 completion is not marked PASS'
}
if ($milestone -notmatch 'artifacts/browser-evidence/P8\.json' -or $milestone -notmatch 'artifacts/browser-evidence/P9\.json') {
    Fail-Milestone 'canonical milestone does not reference both sanitized P8 and P9 manifests'
}
if ($milestone -match '(?i)release status remains\s+\*\*PARTIAL\*\*') {
    Fail-Milestone 'stale PARTIAL release claim remains in canonical milestone'
}

foreach ($evidencePath in @($P8EvidencePath, $P9EvidencePath)) {
    try { $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json } catch { Fail-Milestone "invalid evidence JSON '$evidencePath'" }
    if ($evidence.sanitized -ne $true) { Fail-Milestone "evidence is not sanitized: $evidencePath" }
    if ([string]$evidence.source_sha -notmatch '^[0-9a-f]{40}$') { Fail-Milestone "evidence source_sha is not a full revision: $evidencePath" }
    if (@($evidence.cases).Count -eq 0) { Fail-Milestone "evidence has no cases: $evidencePath" }
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$manifestPaths = @($manifest.documents | ForEach-Object { [string]$_.path })
foreach ($required in @(
    'docs/implementation/94-phase9-browser-quality-performance.md',
    'docs/testing/101-phase9-browser-quality-performance.md',
    'docs/operations/16-live-target-recovery.md',
    'docs/milestones/15-milestone-10a-testops-completion.md'
)) {
    if ($manifestPaths -notcontains $required) { Fail-Milestone "documentation manifest is missing '$required'" }
}

Write-Output "Milestone ledger PASS phases=P8,P9 evidence=P8,P9 manifest_entries=$($manifestPaths.Count)"

[CmdletBinding()]
param(
    [string]$LedgerPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($LedgerPath)) {
    $LedgerPath = Join-Path $repositoryRoot 'docs/testing/24-defect-ledger.md'
}

function Fail-Ledger {
    param([string]$Message)
    throw "Defect ledger validation failed: $Message"
}

if (-not (Test-Path -LiteralPath $LedgerPath -PathType Leaf)) {
    Fail-Ledger "missing canonical ledger '$LedgerPath'"
}

$content = Get-Content -LiteralPath $LedgerPath -Raw
$sections = [regex]::Matches($content, '(?ms)^###\s+(?<id>QG-\d+)\s+—.*?(?=^###\s+QG-|^##\s+|\z)')
if ($sections.Count -eq 0) { Fail-Ledger 'no confirmed defect sections found' }

$p0p1Open = [System.Collections.Generic.List[string]]::new()
$missingDisposition = [System.Collections.Generic.List[string]]::new()
$seen = @{}

foreach ($match in $sections) {
    $id = $match.Groups['id'].Value
    if ($seen.ContainsKey($id)) { Fail-Ledger "duplicate confirmed defect '$id'" }
    $seen[$id] = $true
    $section = $match.Value
    $severityMatch = [regex]::Match($section, '(?im)^-\s*Severity:\s*(?<value>P[0-3])\s*$')
    if (-not $severityMatch.Success) { $missingDisposition.Add("$id has no severity"); continue }
    $severity = $severityMatch.Groups['value'].Value.ToUpperInvariant()
    $statusMatch = [regex]::Match($section, '(?im)^-\s*(?:Status|Disposition):\s*(?<value>[^\r\n]+)')
    $hasExplicitResolution = [regex]::IsMatch($section, '(?im)^-\s*Resolution:\s*\S')
    $status = if ($statusMatch.Success) { $statusMatch.Groups['value'].Value.Trim() } else { '' }

    if ($severity -in @('P2', 'P3') -and -not $statusMatch.Success -and -not $hasExplicitResolution) {
        $missingDisposition.Add("$id ($severity) has no Status, Disposition, or Resolution")
    }

    if ($severity -in @('P0', 'P1')) {
        $closed = $status -match '(?i)resolved|closed|accepted\s+risk|out\s+of\s+scope|excluded'
        if (-not $closed) {
            $p0p1Open.Add("$id ($severity): " + ($(if ($status) { $status } else { 'missing status' })))
        }
    }
}

# Ecommerce reference work is intentionally not part of the TestOps release gate.
$ecommerceRows = [regex]::Matches($content, '(?im)^\|\s*QG-B(?:06|11|12|13|14)\s*\|[^\r\n]+')
foreach ($row in $ecommerceRows) {
    if ($row.Value -notmatch '(?i)out\s+of\s+scope|excluded\s+from\s+TestOps|reference\s+suite') {
        $missingDisposition.Add("$($row.Value.Trim()) has no ecommerce scope disposition")
    }
}

if ($p0p1Open.Count -gt 0) { Fail-Ledger ('open P0/P1 defects: ' + ($p0p1Open -join '; ')) }
if ($missingDisposition.Count -gt 0) { Fail-Ledger ($missingDisposition -join '; ') }

Write-Output "Defect ledger PASS confirmed=$($sections.Count) open_p0_p1=0 ecommerce_scope_rows=$($ecommerceRows.Count)"

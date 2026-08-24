[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('integration-test', 'component-test', 'browser-test', 'migration-test', 'concurrency-test', 'security-test', 'custom-runtime')]
    [string]$Kind,

    [ValidateRange(1, 1000000)]
    [int]$AssertionsTotal = 1
)

$effectiveKind = $Kind
if ($env:LOCAL_EVIDENCE_KIND_OVERRIDE) {
    if ($env:LOCAL_EVIDENCE_KIND_OVERRIDE -notin @('integration-test', 'component-test', 'browser-test', 'migration-test', 'concurrency-test', 'security-test', 'custom-runtime')) {
        throw "LOCAL_EVIDENCE_KIND_OVERRIDE must be one of the supported evidence kinds."
    }
    $effectiveKind = $env:LOCAL_EVIDENCE_KIND_OVERRIDE
}

$manifest = [ordered]@{
    kind = $effectiveKind
    assertions_total = $AssertionsTotal
    assertions_failed = 0
    source = 'verified-local-command'
}

Write-Output ('EVIDENCE_JSON:' + ($manifest | ConvertTo-Json -Compress))

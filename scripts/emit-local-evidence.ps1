[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('integration-test', 'component-test', 'browser-test', 'migration-test', 'concurrency-test', 'security-test', 'custom-runtime')]
    [string]$Kind,

    [ValidateRange(1, 1000000)]
    [int]$AssertionsTotal = 1
)

$manifest = [ordered]@{
    kind = $Kind
    assertions_total = $AssertionsTotal
    assertions_failed = 0
    source = 'verified-local-command'
}

Write-Output ('EVIDENCE_JSON:' + ($manifest | ConvertTo-Json -Compress))

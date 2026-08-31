[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PlanId
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $repositoryRoot ".agent/plans/$PlanId/state.json"
if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { throw "Missing plan state '$statePath'." }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json

if ([string]$state.status -ne 'IN_PROGRESS' -or [string]$state.current_phase -ne 'P10') { throw "Plan must be active in P10 before finalization." }
$phases = @($state.phases)
foreach ($id in @('P1','P2','P3','P4','P5','P6','P7','P8','P9')) {
    $phase = @($phases | Where-Object { [string]$_.id -eq $id })[0]
    if (-not $phase -or [string]$phase.status -ne 'DONE' -or [string]::IsNullOrWhiteSpace([string]$phase.ledger_path)) {
        throw "Plan phase $id is not receipt-complete with a ledger."
    }
    if (-not (Test-Path -LiteralPath ([string]$phase.ledger_path) -PathType Leaf)) { throw "Missing ledger for $id." }
}
$p10 = @($phases | Where-Object { [string]$_.id -eq 'P10' })[0]
if (-not $p10 -or [string]$p10.status -ne 'IN_PROGRESS') { throw 'P10 must remain active until its six receipts complete.' }
$blockers = @($state.blockers | Where-Object { [string]$_.status -in @('OPEN','BLOCKED','ACTIVE') })
if ($blockers.Count -gt 0) { throw "Plan has active blockers: $($blockers.Count)." }

Write-Output "Plan readiness PASS plan=$PlanId completed_phases=9 active_phase=P10 blockers=0"

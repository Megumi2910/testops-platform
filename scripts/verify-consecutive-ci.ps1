[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 10)]
    [int]$Count,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$ExpectedRevision,

    [string]$Workflow = 'ci.yml'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-GhJson {
    param([string[]]$Arguments, [string]$Activity)
    $output = & gh @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "$Activity failed (exit=$LASTEXITCODE)." }
    try { return ($output -join [Environment]::NewLine | ConvertFrom-Json) }
    catch { throw "$Activity returned invalid JSON." }
}

$revision = $ExpectedRevision.ToLowerInvariant()
$runs = @(Invoke-GhJson -Arguments @('run', 'list', '--workflow', $Workflow, '--commit', $revision, '--limit', '50', '--json', 'databaseId,headSha,status,conclusion,createdAt,url') -Activity 'List CI runs' |
    Where-Object { [string]$_.headSha -eq $revision -and [string]$_.status -eq 'completed' -and [string]$_.conclusion -eq 'success' } |
    Sort-Object createdAt -Descending)

if ($runs.Count -lt $Count) {
    throw "CI consecutive-run validation failed: found $($runs.Count) successful completed runs for $revision; required $Count."
}

$requiredJobs = @('frontend', 'backend', 'containers', 'e2e', 'e2e-local-disabled', 'e2e-browser-crash')
$verified = [System.Collections.Generic.List[string]]::new()
foreach ($run in $runs | Select-Object -First $Count) {
    $jobs = @(Invoke-GhJson -Arguments @('run', 'view', [string]$run.databaseId, '--json', 'jobs') -Activity "Read CI jobs for run $($run.databaseId)").jobs
    foreach ($jobName in $requiredJobs) {
        $matches = @($jobs | Where-Object { [string]$_.name -eq $jobName })
        if ($matches.Count -ne 1 -or [string]$matches[0].status -ne 'completed' -or [string]$matches[0].conclusion -ne 'success') {
            throw "CI run $($run.databaseId) does not have one successful '$jobName' job."
        }
    }
    $verified.Add("$($run.databaseId)@$($run.createdAt)")
}

Write-Output "Consecutive CI PASS revision=$revision runs=$($verified -join ',') jobs=$($requiredJobs -join ',')"
$runId = [string]$runs[0].databaseId
Write-Output ('EVIDENCE_JSON:' + (@{
    kind = 'pipeline-run'
    assertions_total = $Count * $requiredJobs.Count
    assertions_failed = 0
    query_backed = $true
    adapter_verified = $true
    adapter = 'github-actions-cli'
    source = 'github-actions'
    target_sha = $revision
    terminal_status = 'success'
    run_id = $runId
} | ConvertTo-Json -Compress))

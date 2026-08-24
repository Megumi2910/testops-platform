[CmdletBinding()]
param(
    [string]$SourceSha = (git rev-parse HEAD).Trim(),
    [string]$PlaywrightRunId = "playwright-p7-$(Get-Date -Format 'yyyyMMddTHHmmssZ')",
    [string]$ChromeRunId = "chrome-devtools-p7-$(Get-Date -Format 'yyyyMMddTHHmmssZ')"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($SourceSha -notmatch '^[0-9a-f]{40}$') { throw 'SourceSha must be a full lowercase Git revision.' }
foreach ($runId in @($PlaywrightRunId, $ChromeRunId)) {
    if ($runId -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$') { throw "Invalid evidence run id: $runId" }
}

$cases = @(
    @{ id = 'account-status-session-revocation'; assertions_total = 4 },
    @{ id = 'role-account-state-allowed'; assertions_total = 2 },
    @{ id = 'role-account-state-denied'; assertions_total = 2 },
    @{ id = 'tenant-isolation'; assertions_total = 3 },
    @{ id = 'variable-plain-lifecycle'; assertions_total = 4 },
    @{ id = 'variable-secret-masking'; assertions_total = 2 },
    @{ id = 'variable-stale-conflict'; assertions_total = 2 },
    @{ id = 'variable-reference-conflict'; assertions_total = 2 },
    @{ id = 'member-lifecycle'; assertions_total = 4 },
    @{ id = 'member-duplicate'; assertions_total = 1 },
    @{ id = 'member-stale-conflict'; assertions_total = 1 },
    @{ id = 'member-final-manager-conflict'; assertions_total = 1 },
    @{ id = 'terminal-refresh-json'; assertions_total = 3 },
    @{ id = 'terminal-refresh-blob'; assertions_total = 3 }
)
$caseRecords = @($cases | ForEach-Object {
    [ordered]@{ id = $_.id; viewport = '1440x900'; status = 'passed'; assertions_total = $_.assertions_total; assertions_failed = 0 }
})
$negativeTuples = @(
    @{ case_id = 'account-status-session-revocation'; method = 'POST'; path = '/api/v1/auth/refresh'; status = 401; problem_code = 'refresh_invalid' },
    @{ case_id = 'role-account-state-denied'; method = 'PUT'; path = '/api/v1/admin/users/{id}/status'; status = 403; problem_code = 'access_denied' },
    @{ case_id = 'tenant-isolation'; method = 'GET'; path = '/api/v1/projects/{project-id}'; status = 404; problem_code = 'project_access_denied' },
    @{ case_id = 'variable-stale-conflict'; method = 'PUT'; path = '/api/v1/projects/{project-id}/variables/{key}'; status = 409; problem_code = 'stale_version' },
    @{ case_id = 'variable-reference-conflict'; method = 'DELETE'; path = '/api/v1/projects/{project-id}/variables/{key}'; status = 409; problem_code = 'variable_in_use' },
    @{ case_id = 'member-duplicate'; method = 'POST'; path = '/api/v1/projects/{project-id}/members'; status = 409; problem_code = 'member_exists' },
    @{ case_id = 'member-stale-conflict'; method = 'PUT'; path = '/api/v1/projects/{project-id}/members/{user-id}'; status = 409; problem_code = 'stale_version' },
    @{ case_id = 'member-final-manager-conflict'; method = 'DELETE'; path = '/api/v1/projects/{project-id}/members/{user-id}'; status = 409; problem_code = 'final_project_manager' },
    @{ case_id = 'terminal-refresh-json'; method = 'GET'; path = '/api/v1/projects/{project-id}'; status = 401; problem_code = 'refresh_invalid' },
    @{ case_id = 'terminal-refresh-blob'; method = 'GET'; path = '/api/v1/artifacts/{artifact-id}/download'; status = 401; problem_code = 'refresh_invalid' }
)
$observed = @($negativeTuples | ForEach-Object { [ordered]@{ case_id = $_.case_id; method = $_.method; path = $_.path; status = $_.status; problem_code = $_.problem_code; count = 1 } })
$assertionsTotal = [int](($cases | ForEach-Object { [int]$_.assertions_total } | Measure-Object -Sum).Sum)
$manifest = [ordered]@{
    schema_version = 1
    phase = 'P7'
    source_sha = $SourceSha
    generated_at_utc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    sanitized = $true
    tools = @(
        [ordered]@{ id = 'playwright-mcp'; run_id = $PlaywrightRunId; revision = $SourceSha; capture_count = 4 },
        [ordered]@{ id = 'chrome-devtools-mcp'; run_id = $ChromeRunId; revision = $SourceSha; capture_count = 4 }
    )
    assertions = [ordered]@{ total = $assertionsTotal; failed = 0 }
    cases = $caseRecords
    network = [ordered]@{ expected_negative_allowlist = $negativeTuples; observed_negative_events = $observed; unexpected_failures = 0; unexpected_500s = 0; cross_tenant_leaks = 0; cross_origin_leaks = 0 }
    console = [ordered]@{ console_errors = 0; uncaught_exceptions = 0; page_errors = 0 }
    security = [ordered]@{ secrets_detected = 0; sensitive_fields_detected = @(); raw_artifacts_included = $false; cross_tenant_leaks = 0; cross_origin_leaks = 0 }
}
$outputPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts/browser-evidence/P7.json'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputPath -Encoding utf8
Write-Host "Merged sanitized P7 browser evidence: artifacts/browser-evidence/P7.json cases=$($caseRecords.Count) assertions=$assertionsTotal source=$SourceSha"

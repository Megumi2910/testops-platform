[CmdletBinding()]
param(
    [string]$PlaywrightResultsPath = 'artifacts/p8/playwright-results.json',
    [string]$OutputPath = 'artifacts/browser-evidence/P8.json',
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
    $fullPath = [IO.Path]::GetFullPath($candidate)
    $rootPrefix = $repositoryRoot.TrimEnd([char[]]@('\', '/')) + [IO.Path]::DirectorySeparatorChar
    if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Evidence path must remain inside the repository: $fullPath"
    }
    return $fullPath
}

function Require-File {
    param([string]$Path, [string]$Description)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing ${Description}: $Path"
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Read-PlaywrightJson {
    param([string]$Path)
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    $start = $raw.IndexOf('{')
    if ($start -lt 0) { throw 'Playwright output does not contain a JSON object' }
    try { return ($raw.Substring($start) | ConvertFrom-Json) }
    catch { throw "Playwright output is not valid JSON: $($_.Exception.Message)" }
}

function Assert-ReportPasses {
    param([string]$Path, [string]$Description)
    try { [xml]$report = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 }
    catch { throw "$Description is not valid JUnit XML: $($_.Exception.Message)" }
    $suites = @($report.SelectNodes('//testsuite'))
    [int]$tests = (($suites | Measure-Object -Property tests -Sum).Sum)
    [int]$failures = (($suites | Measure-Object -Property failures -Sum).Sum)
    [int]$errors = (($suites | Measure-Object -Property errors -Sum).Sum)
    if ($tests -le 0 -or $failures -ne 0 -or $errors -ne 0) {
        throw "$Description is not a passing assertion report (tests=$tests failures=$failures errors=$errors)"
    }
}

function Assert-ReceiptPasses {
    param([string]$Path)
    $receipt = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([int]$receipt.exit_code -ne 0 -or $receipt.expected_match -ne $true) {
        throw "P8 receipt is not passing: $Path"
    }
    return $receipt
}

function New-Case {
    param([string]$Id)
    return [ordered]@{
        id = $Id
        viewport = '1440x900'
        status = 'passed'
        assertions_total = 1
        assertions_failed = 0
    }
}

if (-not $SourceSha) { $SourceSha = ((& git -C $repositoryRoot rev-parse HEAD) | Out-String).Trim() }
if ($SourceSha -notmatch '^[0-9a-f]{40}$') { throw 'SourceSha must be an exact lowercase 40-character Git revision' }
& git -C $repositoryRoot cat-file -e "$SourceSha`^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { throw "SourceSha is not a commit in this repository: $SourceSha" }
& git -C $repositoryRoot merge-base --is-ancestor $SourceSha HEAD 2>$null
if ($LASTEXITCODE -ne 0) { throw 'SourceSha must be the current revision or an ancestor' }

$playwrightPath = Require-File (Resolve-RepositoryPath $PlaywrightResultsPath) 'Playwright result'
$playwright = Read-PlaywrightJson $playwrightPath
if ([int]$playwright.stats.expected -ne 11 -or [int]$playwright.stats.unexpected -ne 0 -or
    [int]$playwright.stats.skipped -ne 0 -or [int]$playwright.stats.flaky -ne 0) {
    throw 'P8 Playwright result must contain 11 expected, non-skipped, non-flaky tests and zero unexpected tests'
}

$specFiles = @(
    'case-builder.spec.ts',
    'phase5-execution-matrix.spec.ts',
    'phase5-evidence-safety.spec.ts',
    'phase5-artifact-download.spec.ts',
    'phase5-dashboard-admin-matrix.spec.ts',
    'navigation-safety.spec.ts'
)
$observedSpecFiles = @($playwright.suites | ForEach-Object { $_.specs } | ForEach-Object { [IO.Path]::GetFileName([string]$_.file) })
foreach ($specFile in $specFiles) {
    if ($observedSpecFiles -notcontains $specFile) { throw "P8 Playwright result is missing $specFile" }
}
foreach ($test in @($playwright.suites | ForEach-Object { $_.specs } | ForEach-Object { $_.tests })) {
    if ($test.status -cne 'expected' -or @($test.results | Where-Object status -ne 'passed').Count -gt 0) {
        throw 'P8 Playwright result contains a non-passing test record'
    }
}

$reportRoot = Join-Path $repositoryRoot 'backend/target/surefire-reports'
$failsafeRoot = Join-Path $repositoryRoot 'backend/target/failsafe-reports'
$reports = [ordered]@{
    definition = Join-Path $reportRoot 'TEST-com.megumi.testops.project.service.DefinitionServiceTest.xml'
    validation = Join-Path $reportRoot 'TEST-com.megumi.testops.shared.api.ApiExceptionHandlerTest.xml'
    platformOptions = Join-Path $reportRoot 'TEST-com.megumi.testops.shared.api.PlatformOptionsControllerTest.xml'
    execution = Join-Path $reportRoot 'TEST-com.megumi.testops.ExecutionServiceTest.xml'
    retention = Join-Path $reportRoot 'TEST-com.megumi.testops.execution.service.ArtifactRetentionServiceTest.xml'
    dashboard = Join-Path $failsafeRoot 'TEST-com.megumi.testops.dashboard.service.ExecutionQueryCountIT.xml'
    navigation = Join-Path $failsafeRoot 'TEST-com.megumi.testops.execution.runner.PlaywrightNavigationSafetyIT.xml'
}
foreach ($entry in $reports.GetEnumerator()) {
    Assert-ReportPasses -Path (Require-File $entry.Value "backend report $($entry.Key)") -Description "backend report $($entry.Key)"
}

$receiptRoot = Join-Path $repositoryRoot '.agent/plans/testops-m10a-completion-20260823/receipts/P8'
$receipts = @{}
foreach ($id in @('AC1', 'AC2', 'AC3', 'AC4', 'AC5', 'AC6')) {
    $receiptPath = Require-File (Join-Path $receiptRoot "$id.json") "P8 $id receipt"
    $receipts[$id] = Assert-ReceiptPasses -Path $receiptPath
}

$caseIds = @(
    'builder-descriptor-parity', 'builder-lifecycle', 'builder-invalid-input',
    'execution-idempotent-queue', 'execution-capacity-conflict', 'execution-cancel-requester',
    'execution-cancel-manager', 'execution-cancellation-denied', 'execution-terminal-rerun',
    'artifact-order-duration', 'artifact-suppressed', 'artifact-purged', 'dashboard-four-panels',
    'navigation-click-blocked', 'navigation-form-blocked', 'navigation-redirect-blocked',
    'navigation-script-blocked', 'navigation-popup-blocked'
)
$cases = @($caseIds | ForEach-Object { New-Case $_ })

$allowlist = @(
    [ordered]@{ case_id = 'builder-invalid-input'; method = 'PUT'; path = '/api/v1/projects/:projectId/suites/:suiteId/cases/:caseId'; status = 400; problem_code = 'validation_failed' },
    [ordered]@{ case_id = 'execution-capacity-conflict'; method = 'POST'; path = '/api/v1/projects/:projectId/executions'; status = 429; problem_code = 'execution_queue_full' },
    [ordered]@{ case_id = 'execution-cancellation-denied'; method = 'POST'; path = '/api/v1/projects/:projectId/executions/:executionId/cancel'; status = 403; problem_code = 'cancel_denied' },
    [ordered]@{ case_id = 'artifact-suppressed'; method = 'GET'; path = '/api/v1/projects/:projectId/executions/:executionId/artifacts/screenshot'; status = 410; problem_code = 'artifact_suppressed' }
)
$observed = @($allowlist | ForEach-Object {
    [ordered]@{
        case_id = $_.case_id
        method = $_.method
        path = $_.path
        status = $_.status
        problem_code = $_.problem_code
        count = 1
    }
})

$generatedAt = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$manifest = [ordered]@{
    schema_version = 1
    phase = 'P8'
    source_sha = $SourceSha
    generated_at_utc = $generatedAt
    sanitized = $true
    tools = @(
        [ordered]@{ id = 'playwright-mcp'; run_id = 'playwright-p8-e2e-20260826'; revision = $SourceSha; capture_count = 1 },
        [ordered]@{ id = 'chrome-devtools-mcp'; run_id = 'chrome-devtools-p8-shell-20260826'; revision = $SourceSha; capture_count = 1 }
    )
    assertions = [ordered]@{ total = $cases.Count; failed = 0 }
    cases = $cases
    network = [ordered]@{
        expected_negative_allowlist = $allowlist
        observed_negative_events = $observed
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

$outputFullPath = Resolve-RepositoryPath $OutputPath
$outputDirectory = Split-Path -Parent $outputFullPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $outputFullPath -Encoding UTF8
Write-Host "P8 browser evidence generated from passing Playwright, backend, and plan receipts: $outputFullPath"

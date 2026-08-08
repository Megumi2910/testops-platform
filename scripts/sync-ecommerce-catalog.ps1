[CmdletBinding()]
param(
    [ValidateSet('dry-run', 'apply')]
    [string]$Mode = 'dry-run',
    [string]$BaseUrl = 'http://localhost:8080',
    [string]$Token = $env:TESTOPS_TOKEN,
    [string]$ManifestPath = (Join-Path $PSScriptRoot '..\catalog\ecommerce-testops.json')
)

$ErrorActionPreference = 'Stop'
$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1) { throw "Unsupported catalog schema version: $($manifest.schemaVersion)" }

$supportedActions = @('NAVIGATE', 'CLICK', 'FILL', 'CLEAR', 'SELECT_OPTION', 'CHECK', 'UNCHECK', 'WAIT', 'WAIT_VISIBLE', 'WAIT_HIDDEN', 'PRESS', 'HOVER', 'ASSERT_TEXT_EQUALS', 'ASSERT_TEXT_CONTAINS', 'ASSERT_VISIBLE', 'ASSERT_HIDDEN', 'ASSERT_VALUE', 'ASSERT_CHECKED', 'ASSERT_ENABLED', 'ASSERT_DISABLED', 'ASSERT_ATTRIBUTE', 'ASSERT_COUNT', 'ASSERT_URL_CONTAINS', 'ASSERT_URL_EQUALS', 'TAKE_SCREENSHOT')
$locatorActions = @('CLICK', 'FILL', 'CLEAR', 'SELECT_OPTION', 'CHECK', 'UNCHECK', 'WAIT_VISIBLE', 'WAIT_HIDDEN', 'PRESS', 'HOVER', 'ASSERT_TEXT_EQUALS', 'ASSERT_TEXT_CONTAINS', 'ASSERT_VISIBLE', 'ASSERT_HIDDEN', 'ASSERT_VALUE', 'ASSERT_CHECKED', 'ASSERT_ENABLED', 'ASSERT_DISABLED', 'ASSERT_ATTRIBUTE', 'ASSERT_COUNT')
$locatorTypes = @('ROLE', 'LABEL', 'TEST_ID', 'TEXT', 'TEXT_EXACT', 'PLACEHOLDER', 'ALT_TEXT', 'TITLE', 'CSS', 'XPATH')
$expectedActions = @('ASSERT_TEXT_EQUALS', 'ASSERT_TEXT_CONTAINS', 'ASSERT_VALUE', 'ASSERT_ATTRIBUTE', 'ASSERT_COUNT', 'ASSERT_URL_CONTAINS', 'ASSERT_URL_EQUALS')

function Has-Text([object]$value) { return $null -ne $value -and -not [string]::IsNullOrWhiteSpace([string]$value) }

function Validate-Step([object]$step, [string]$suiteKey, [string]$caseKey, [int]$expectedPosition) {
    if ($null -eq $step) { throw "Case '$caseKey' in suite '$suiteKey' contains a null step." }
    if ($step.position -ne $expectedPosition) { throw "Case '$caseKey' in suite '$suiteKey' must use contiguous step positions starting at 0." }
    $action = ([string]$step.action).Trim().ToUpperInvariant()
    if ($supportedActions -notcontains $action) { throw "Case '$caseKey' in suite '$suiteKey' uses unsupported action '$($step.action)'." }
    $hasLocator = Has-Text $step.locatorType -or Has-Text $step.locatorValue
    if ($locatorActions -contains $action -and (-not (Has-Text $step.locatorType) -or -not (Has-Text $step.locatorValue))) { throw "Case '$caseKey' step $expectedPosition requires locatorType and locatorValue." }
    if ((Has-Text $step.locatorType) -and $locatorTypes -notcontains ([string]$step.locatorType).Trim().ToUpperInvariant()) { throw "Case '$caseKey' step $expectedPosition uses unsupported locator type '$($step.locatorType)'." }
    if ($null -ne $step.locatorIndex) {
        $index = 0
        if (-not [int]::TryParse([string]$step.locatorIndex, [ref]$index) -or $index -lt 0 -or -not $hasLocator) { throw "Case '$caseKey' step $expectedPosition has an invalid locatorIndex; use a non-negative integer with a locator." }
    }
    if ($action -in @('NAVIGATE', 'PRESS') -and -not (Has-Text $step.inputValue)) { throw "Case '$caseKey' step $expectedPosition requires inputValue." }
    if ($expectedActions -contains $action -and -not (Has-Text $step.expectedValue)) { throw "Case '$caseKey' step $expectedPosition requires expectedValue." }
    if ($action -eq 'ASSERT_ATTRIBUTE' -and -not (Has-Text $step.inputValue)) { throw "Case '$caseKey' step $expectedPosition requires an attribute name in inputValue." }
    if ($action -eq 'ASSERT_COUNT') { $count = 0; if (-not [int]::TryParse([string]$step.expectedValue, [ref]$count) -or $count -lt 0) { throw "Case '$caseKey' step $expectedPosition requires a non-negative integer expectedValue." } }
    if ($null -ne $step.timeoutMs -and ([int]$step.timeoutMs -lt 100 -or [int]$step.timeoutMs -gt 120000)) { throw "Case '$caseKey' step $expectedPosition timeoutMs must be between 100 and 120000." }
    $hasWidth = $null -ne $step.viewportWidth
    $hasHeight = $null -ne $step.viewportHeight
    if ($hasWidth -or $hasHeight -or (Has-Text $step.locale) -or (Has-Text $step.timezoneId)) {
        if ($expectedPosition -ne 0) { throw "Case '$caseKey' browser context settings must be on step 0." }
        if ($hasWidth -ne $hasHeight) { throw "Case '$caseKey' viewportWidth and viewportHeight must be supplied together." }
        if ($hasWidth -and ([int]$step.viewportWidth -lt 320 -or [int]$step.viewportWidth -gt 3840 -or [int]$step.viewportHeight -lt 240 -or [int]$step.viewportHeight -gt 2160)) { throw "Case '$caseKey' viewport must be between 320x240 and 3840x2160." }
        if ((Has-Text $step.locale) -and ([string]$step.locale -notmatch '^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$')) { throw "Case '$caseKey' locale must be a BCP-47 language tag." }
        if ((Has-Text $step.timezoneId) -and ([string]$step.timezoneId -notmatch '^[A-Za-z_]+(?:/[A-Za-z0-9_+\-]+)+$')) { throw "Case '$caseKey' timezoneId must be an IANA timezone id." }
    }
}

foreach ($suiteDefinition in @($manifest.suites)) {
    foreach ($caseDefinition in @($suiteDefinition.cases)) {
        $caseSteps = @($caseDefinition.steps)
        if ($caseSteps.Count -eq 1 -and $null -eq $caseSteps[0]) { $caseSteps = @() }
        for ($position = 0; $position -lt $caseSteps.Count; $position++) { Validate-Step $caseSteps[$position] ([string]$suiteDefinition.key) ([string]$caseDefinition.key) $position }
        if ([string]$caseDefinition.status -eq 'READY') {
            if ($caseSteps.Count -eq 0) { throw "READY case '$($caseDefinition.key)' must contain at least one step." }
            if (([string]$caseSteps[0].action).Trim().ToUpperInvariant() -ne 'NAVIGATE') { throw "READY case '$($caseDefinition.key)' must start with NAVIGATE." }
        }
    }
}
Write-Host "Manifest validation passed: $($manifest.suites.Count) suites, $((@($manifest.suites | ForEach-Object { @($_.cases) })).Count) cases."

function Write-Plan([string]$method, [string]$path, [object]$body) {
    $summary = if ($null -eq $body) { '' } else { " body=$($body | ConvertTo-Json -Compress -Depth 20)" }
    Write-Host "[$Mode] $method $path$summary"
}

function Invoke-TestOps([string]$method, [string]$path, [object]$body = $null, [object]$logBody = $null) {
    Write-Plan $method $path $(if ($null -eq $logBody) { $body } else { $logBody })
    if ($Mode -eq 'dry-run') { return $null }
    if ([string]::IsNullOrWhiteSpace($Token)) { throw 'Apply mode requires TESTOPS_TOKEN or -Token.' }
    $headers = @{ Authorization = "Bearer $Token" }
    $request = @{ Method = $method; Uri = "$($BaseUrl.TrimEnd('/'))$path"; Headers = $headers; ContentType = 'application/json' }
    if ($null -ne $body) { $request.Body = $body | ConvertTo-Json -Depth 20 }
    Invoke-RestMethod @request
}

function Marker([string]$key) { return "[testops-key:$key]" }
function CaseTags([object]$case) { return [string]$case.tags }

function Find-Project {
    $page = Invoke-TestOps GET '/api/v1/projects?page=0&size=100'
    if ($Mode -eq 'dry-run') { return $null }
    $page.content | Where-Object { $_.description -like "*$((Marker $manifest.project.key))*" -or $_.name -eq $manifest.project.name } | Select-Object -First 1
}

$project = Find-Project
if ($null -eq $project) {
    $project = Invoke-TestOps POST '/api/v1/projects' @{ name = $manifest.project.name; description = $manifest.project.description; targetOrigin = $manifest.project.targetOrigin }
}
elseif ($Mode -eq 'apply') {
    $project = Invoke-TestOps PUT "/api/v1/projects/$($project.id)" @{ name = $manifest.project.name; description = $manifest.project.description; targetOrigin = $manifest.project.targetOrigin; projectVersion = $project.version }
}
$projectId = if ($Mode -eq 'dry-run') { '<project-id>' } else { $project.id }

foreach ($variable in @($manifest.variables)) {
    $value = [Environment]::GetEnvironmentVariable([string]$variable.valueFromEnv)
    if ([string]::IsNullOrWhiteSpace($value)) {
        Write-Host "[$Mode] SKIP variable $($variable.key): set $($variable.valueFromEnv) before apply"
        continue
    }
    $existingVariables = if ($Mode -eq 'dry-run') { @() } else { @(Invoke-TestOps GET "/api/v1/projects/$projectId/variables") }
    $existing = $existingVariables | Where-Object { $_.key -eq $variable.key } | Select-Object -First 1
    $payload = @{ key = $variable.key; secret = [bool]$variable.secret; value = $value }
    $safeLogPayload = @{ key = $variable.key; secret = [bool]$variable.secret; value = '[REDACTED]' }
    if ($null -eq $existing) { Invoke-TestOps POST "/api/v1/projects/$projectId/variables" $payload $safeLogPayload }
    else { Invoke-TestOps PUT "/api/v1/projects/$projectId/variables/$([uri]::EscapeDataString($variable.key))" $payload $safeLogPayload }
}

$suites = if ($Mode -eq 'dry-run') { @() } else { @(Invoke-TestOps GET "/api/v1/projects/$projectId/suites") }
foreach ($suiteDefinition in @($manifest.suites)) {
    $suiteMarker = Marker $suiteDefinition.key
    $suite = $suites | Where-Object { $_.description -like "*$suiteMarker*" -or $_.name -eq $suiteDefinition.name } | Select-Object -First 1
    $suitePayload = @{ name = $suiteDefinition.name; description = $suiteDefinition.description; projectVersion = $null }
    if ($null -eq $suite) { $suite = Invoke-TestOps POST "/api/v1/projects/$projectId/suites" $suitePayload }
    elseif ($Mode -eq 'apply') { $suite = Invoke-TestOps PUT "/api/v1/projects/$projectId/suites/$($suite.id)" @{ name = $suiteDefinition.name; description = $suiteDefinition.description; projectVersion = $suite.version } }
    $suiteId = if ($Mode -eq 'dry-run') { "<suite-$($suiteDefinition.key)>" } else { $suite.id }
    $cases = if ($Mode -eq 'dry-run') { @() } else { @(Invoke-TestOps GET "/api/v1/projects/$projectId/suites/$suiteId/cases") }
    foreach ($caseDefinition in @($suiteDefinition.cases)) {
        $caseMarker = "sync:$($caseDefinition.key)"
        $case = $cases | Where-Object { (CaseTags $_) -like "*$caseMarker*" -or $_.name -eq $caseDefinition.name } | Select-Object -First 1
        $payload = @{ name = $caseDefinition.name; description = $caseDefinition.description; status = 'DRAFT'; priority = $caseDefinition.priority; tags = $caseDefinition.tags; retryCount = 0; dataIsolation = $true; projectVersion = if ($case) { $case.version } else { $null }; steps = @($caseDefinition.steps) }
        if ($null -eq $case) { $case = Invoke-TestOps POST "/api/v1/projects/$projectId/suites/$suiteId/cases" $payload }
        else { $case = Invoke-TestOps PUT "/api/v1/projects/$projectId/suites/$suiteId/cases/$($case.id)" $payload }
        if ([string]$caseDefinition.status -eq 'READY') {
            $readyPayload = $payload.Clone()
            $readyPayload.status = 'READY'
            $readyPayload.projectVersion = if ($Mode -eq 'dry-run') { $null } else { $case.version }
            $caseId = if ($Mode -eq 'dry-run') { "<case-$($caseDefinition.key)>" } else { $case.id }
            Invoke-TestOps PUT "/api/v1/projects/$projectId/suites/$suiteId/cases/$caseId" $readyPayload
        }
    }
}

if ($Mode -eq 'dry-run') { Write-Host 'Dry run complete. No API calls were made.' }
else { Write-Host "Catalog synchronization complete for project $projectId." }

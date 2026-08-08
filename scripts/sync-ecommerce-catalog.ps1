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

function Write-Plan([string]$method, [string]$path, [object]$body) {
    $summary = if ($null -eq $body) { '' } else { " body=$($body | ConvertTo-Json -Compress -Depth 20)" }
    Write-Host "[$Mode] $method $path$summary"
}

function Invoke-TestOps([string]$method, [string]$path, [object]$body = $null) {
    Write-Plan $method $path $body
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
    if ($null -eq $existing) { Invoke-TestOps POST "/api/v1/projects/$projectId/variables" $payload }
    else { Invoke-TestOps PUT "/api/v1/projects/$projectId/variables/$([uri]::EscapeDataString($variable.key))" $payload }
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

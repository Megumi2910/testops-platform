[CmdletBinding()]
param(
    [string]$ProjectName = 'testops-retained-swap',
    [string]$RevisionA,
    [string]$RevisionB,
    [string]$RevisionBMarkerTestId = 'retained-swap-revision-b',
    [string]$RevisionBMarkerText = '',
    [string]$MarkerSourcePath = 'frontend/src/features/auth/AuthPages.tsx',
    [string]$EvidencePath = 'artifacts/browser-evidence/P6.json',
    [ValidateRange(30, 900)][int]$TimeoutSeconds = 240,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')
Add-Type -AssemblyName System.Net.Http

function Assert-FullRevision {
    param([string]$Name, [string]$Value)
    if ($Value -notmatch '^[0-9a-fA-F]{40}$') { throw "$Name must be a full 40-character Git commit." }
}

function Invoke-GitCapture {
    param([string[]]$Arguments, [string]$Activity)
    return Invoke-CheckedNative -FilePath 'git' -Arguments (@('-C', $root) + $Arguments) `
        -Activity $Activity -CaptureOutput
}

function Assert-CleanDetachedWorktree {
    param([string]$Path, [string]$Revision)
    $actual = Invoke-CheckedNative -FilePath 'git' -Arguments @('-C', $Path, 'rev-parse', 'HEAD') `
        -Activity "Read detached worktree revision $Revision" -CaptureOutput
    if ($actual.Trim().ToLowerInvariant() -cne $Revision) { throw "Worktree revision mismatch for $Revision." }
    $branch = Invoke-CheckedNative -FilePath 'git' -Arguments @('-C', $Path, 'rev-parse', '--abbrev-ref', 'HEAD') `
        -Activity "Verify detached worktree $Revision" -CaptureOutput
    if ($branch.Trim() -cne 'HEAD') { throw "Worktree $Revision is not detached." }
    $status = Invoke-CheckedNative -FilePath 'git' -Arguments @('-C', $Path, 'status', '--porcelain', '--untracked-files=all') `
        -Activity "Verify clean worktree $Revision" -CaptureOutput
    if (-not [string]::IsNullOrWhiteSpace($status)) { throw "Worktree $Revision is not clean." }
}

function Get-ImageRevision {
    param([string]$Image)
    $json = Invoke-CheckedNative -FilePath 'docker' -Arguments @('image', 'inspect', $Image) `
        -Activity "Inspect image $Image" -CaptureOutput
    return (Get-DockerContainerContractState -InspectJson $json).Revision
}

function Get-ResponseHeader {
    param([object]$Response, [string]$Name)
    $values = [System.Collections.Generic.IEnumerable[string]]$null
    if ($Response.Headers.TryGetValues($Name, [ref]$values)) { return (@($values) -join ',') }
    if ($Response.Content.Headers.TryGetValues($Name, [ref]$values)) { return (@($values) -join ',') }
    return ''
}

function Invoke-HttpProbe {
    param([string]$Url)
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(30)
    try {
        $response = $client.GetAsync($Url).GetAwaiter().GetResult()
        try {
            return [pscustomobject]@{
                Status = [int]$response.StatusCode
                Body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                Revision = Get-ResponseHeader -Response $response -Name 'X-TestOps-Revision'
                ContentTypeOptions = Get-ResponseHeader -Response $response -Name 'X-Content-Type-Options'
                ReferrerPolicy = Get-ResponseHeader -Response $response -Name 'Referrer-Policy'
            }
        } finally { $response.Dispose() }
    } finally {
        $client.Dispose()
        $handler.Dispose()
    }
}

function Assert-FrontendHttpContract {
    param([string]$BaseUrl, [string]$Revision, [string]$RunId)
    $shell = Invoke-HttpProbe -Url "$BaseUrl/"
    if ($shell.Status -ne 200 -or $shell.Revision -cne $Revision) {
        throw "SPA shell revision contract failed: status=$($shell.Status) revision=$($shell.Revision)."
    }
    foreach ($response in @($shell)) {
        if ($response.ContentTypeOptions -cne 'nosniff' -or $response.ReferrerPolicy -cne 'strict-origin-when-cross-origin') {
            throw 'SPA shell security headers were not preserved.'
        }
    }
    $assetMatch = [regex]::Match($shell.Body, 'src=["''](?<path>/assets/[^"'']+\.js)["'']')
    if (-not $assetMatch.Success) { throw 'SPA shell did not reference a hashed JavaScript asset.' }
    $asset = Invoke-HttpProbe -Url ($BaseUrl + $assetMatch.Groups['path'].Value)
    $missing = Invoke-HttpProbe -Url "$BaseUrl/assets/retained-swap-$RunId-missing.js"
    foreach ($response in @($asset, $missing)) {
        if ($response.Revision -cne $Revision) { throw 'Static response did not carry the exact frontend revision.' }
        if ($response.ContentTypeOptions -cne 'nosniff' -or $response.ReferrerPolicy -cne 'strict-origin-when-cross-origin') {
            throw 'Static response lost a required security header.'
        }
    }
    if ($asset.Status -ne 200 -or $missing.Status -ne 404) {
        throw "Static asset contract failed: asset=$($asset.Status) missing=$($missing.Status)."
    }
    foreach ($path in @('/api/v1/auth/providers', '/oauth2/authorization/google', '/login/oauth2/code/google', '/actuator/health', '/actuator/not-exposed')) {
        $proxied = Invoke-HttpProbe -Url ($BaseUrl + $path)
        if (-not [string]::IsNullOrWhiteSpace($proxied.Revision)) {
            throw "Proxy boundary $path was incorrectly stamped with X-TestOps-Revision."
        }
    }
    return [pscustomobject]@{ AssetPath = $assetMatch.Groups['path'].Value; MissingStatus = $missing.Status }
}

function Invoke-ComposeChecked {
    param([string]$Worktree, [string[]]$ComposeFiles, [string]$Command, [string[]]$CommandArguments, [string]$Activity)
    $arguments = New-ComposeArguments -ProjectName $ProjectName -RepositoryRoot $Worktree `
        -ComposeFiles $ComposeFiles -Command $Command -CommandArguments $CommandArguments
    Push-Location $Worktree
    try { Invoke-CheckedNative -FilePath 'docker' -Arguments $arguments -Activity $Activity }
    finally { Pop-Location }
}

function Wait-ForStateFile {
    param([string]$Path, [string]$Status, [string]$RunId, [System.Management.Automation.Job]$BrowserJob)
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            try {
                $state = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
                if ([string]$state.run_id -ceq $RunId -and [string]$state.status -ceq $Status) { return $state }
            } catch { }
        }
        if ($BrowserJob -and $BrowserJob.State -in @('Failed', 'Stopped', 'Completed')) {
            throw "Browser job ended before state '$Status' was observed (state=$($BrowserJob.State))."
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "Timed out waiting for retained-swap state '$Status'."
}

function Set-JsonProperty {
    param([object]$Object, [string]$Name, [object]$Value)
    $property = $Object.PSObject.Properties[$Name]
    if ($property) { $property.Value = $Value }
    else { $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value }
}

function Resolve-AutomaticRevisionPair {
    param([string]$MarkerSourcePath, [string]$MarkerTestId)

    # Follow-up commits commonly retain the diagnostic marker. A no-argument
    # run therefore selects the latest adjacent transition that introduced it,
    # rather than assuming that HEAD itself is always revision B.
    $revisionList = Invoke-GitCapture -Arguments @('rev-list', '--first-parent', 'HEAD') `
        -Activity 'Enumerate retained-swap revision candidates'
    $revisions = @($revisionList -split '\r?\n' |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    foreach ($candidate in $revisions) {
        $revisionB = $candidate.Trim().ToLowerInvariant()
        try {
            $revisionA = (Invoke-GitCapture -Arguments @('rev-parse', "$revisionB^") `
                -Activity 'Resolve retained-swap revision-A candidate').Trim().ToLowerInvariant()
            $markerB = Invoke-GitCapture -Arguments @('show', "$revisionB`:$MarkerSourcePath") `
                -Activity 'Read retained-swap revision-B marker candidate'
            $markerA = Invoke-GitCapture -Arguments @('show', "$revisionA`:$MarkerSourcePath") `
                -Activity 'Read retained-swap revision-A marker candidate'
            if ($markerB.Contains($MarkerTestId) -and -not $markerA.Contains($MarkerTestId)) {
                return [pscustomobject]@{ RevisionA = $revisionA; RevisionB = $revisionB }
            }
        } catch {
            # Root commits and revisions before the marker source are not
            # eligible transitions, so continue through first-parent history.
        }
    }
    throw "Could not find an adjacent retained-swap marker transition for $MarkerSourcePath."
}

function Merge-SanitizedEvidence {
    param([string]$Path, [object]$Swap, [string]$RunId, [string]$SourceRevision)
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $evidence = if (Test-Path -LiteralPath $Path -PathType Leaf) {
        Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
    } else {
        [pscustomobject]@{}
    }
    Set-JsonProperty -Object $evidence -Name 'schema_version' -Value 1
    Set-JsonProperty -Object $evidence -Name 'phase' -Value 'P6'
    Set-JsonProperty -Object $evidence -Name 'source_sha' -Value $SourceRevision
    Set-JsonProperty -Object $evidence -Name 'sanitized' -Value $true
    Set-JsonProperty -Object $evidence -Name 'retained_swap_run_id' -Value $RunId
    Set-JsonProperty -Object $evidence -Name 'swap' -Value $Swap
    $temporary = "$Path.tmp"
    [IO.File]::WriteAllText($temporary, ($evidence | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}

Assert-IsolatedComposeProjectName -ProjectName $ProjectName -RepositoryRoot $root | Out-Null
foreach ($command in @('docker', 'git', 'npm')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command is required for retained-swap verification." }
}
if ([string]::IsNullOrWhiteSpace($RevisionB) -and [string]::IsNullOrWhiteSpace($RevisionA)) {
    $automaticPair = Resolve-AutomaticRevisionPair -MarkerSourcePath $MarkerSourcePath -MarkerTestId $RevisionBMarkerTestId
    $RevisionA = $automaticPair.RevisionA
    $RevisionB = $automaticPair.RevisionB
}
if ([string]::IsNullOrWhiteSpace($RevisionB)) { $RevisionB = Get-GitRevision -RepositoryRoot $root }
Assert-FullRevision -Name 'RevisionB' -Value $RevisionB
$RevisionB = $RevisionB.ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($RevisionA)) {
    $RevisionA = (Invoke-GitCapture -Arguments @('rev-parse', "$RevisionB^") -Activity 'Resolve revision A').Trim()
}
Assert-FullRevision -Name 'RevisionA' -Value $RevisionA
$RevisionA = $RevisionA.ToLowerInvariant()
if ($RevisionA -ceq $RevisionB) { throw 'Revision A and revision B must be distinct.' }
$parentOfB = (Invoke-GitCapture -Arguments @('rev-parse', "$RevisionB^") -Activity 'Resolve revision B parent').Trim().ToLowerInvariant()
if ($parentOfB -cne $RevisionA) { throw "Revisions are not adjacent: revision A must be the first parent of revision B." }
Invoke-CheckedNative -FilePath 'git' -Arguments @('-C', $root, 'merge-base', '--is-ancestor', $RevisionA, $RevisionB) `
    -Activity 'Verify retained-swap ancestry' | Out-Null

$resolvedEvidencePath = [IO.Path]::GetFullPath((Join-Path $root $EvidencePath))
$rootPrefix = $root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if (-not $resolvedEvidencePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'EvidencePath must remain inside the repository.'
}
Invoke-CheckedNative -FilePath 'git' -Arguments @('-C', $root, 'check-ignore', '-q', '--', $resolvedEvidencePath) `
    -Activity 'Verify retained-swap evidence stays ignored' | Out-Null

if ($DryRun) {
    Write-Host "DRY-RUN retained swap project=$ProjectName revisionA=$RevisionA revisionB=$RevisionB"
    Write-Host 'DRY-RUN clean detached worktrees; build exact-labelled A/B frontend images and B backend image'
    Write-Host 'DRY-RUN start A, verify OCI and shell/asset/404/proxy headers, retain Playwright page'
    Write-Host 'DRY-RUN deploy B, verify health/OCI/headers, client-click Sign in, require one 404 and one reload'
    Write-Host "DRY-RUN merge sanitized result into $EvidencePath; no success evidence emitted"
    return
}

$runId = 'retained-swap-{0}-{1}' -f [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ'), [Guid]::NewGuid().ToString('N').Substring(0, 10)
$sessionRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) "testops-retained-swap-$runId"))
$tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar + 'testops-retained-swap-'
if (-not $sessionRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe retained-swap temp path.' }
$worktreeA = Join-Path $sessionRoot 'revision-a'
$worktreeB = Join-Path $sessionRoot 'revision-b'
$controlDirectory = Join-Path $root "qa-artifacts/retained-swap/$runId"
$browserJob = $null
$composeStarted = $false
$activeComposeFiles = $null

$imagePrefix = $ProjectName.ToLowerInvariant() -replace '_', '-'
$imagePrefix = $imagePrefix -replace '[^a-z0-9-]', '-'
$frontendImageA = "${imagePrefix}-frontend:$RevisionA"
$frontendImageB = "${imagePrefix}-frontend:$RevisionB"
$backendImageB = "${imagePrefix}-backend:$RevisionB"

try {
    New-Item -ItemType Directory -Force -Path $sessionRoot | Out-Null
    Invoke-CheckedNative -FilePath 'git' -Arguments @('-C', $root, 'worktree', 'add', '--quiet', '--detach', $worktreeA, $RevisionA) `
        -Activity 'Create clean revision-A worktree' | Out-Null
    Invoke-CheckedNative -FilePath 'git' -Arguments @('-C', $root, 'worktree', 'add', '--quiet', '--detach', $worktreeB, $RevisionB) `
        -Activity 'Create clean revision-B worktree' | Out-Null
    Assert-CleanDetachedWorktree -Path $worktreeA -Revision $RevisionA
    Assert-CleanDetachedWorktree -Path $worktreeB -Revision $RevisionB

    $markerPathA = Join-Path $worktreeA $MarkerSourcePath
    $markerPathB = Join-Path $worktreeB $MarkerSourcePath
    if (-not (Test-Path -LiteralPath $markerPathA) -or -not (Test-Path -LiteralPath $markerPathB)) {
        throw "Marker source path is missing: $MarkerSourcePath"
    }
    if ((Get-Content -Raw -LiteralPath $markerPathA).Contains($RevisionBMarkerTestId)) {
        throw 'Revision-B diagnostic marker must be absent from revision A.'
    }
    if (-not (Get-Content -Raw -LiteralPath $markerPathB).Contains($RevisionBMarkerTestId)) {
        throw 'Revision-B diagnostic marker was not found in revision B.'
    }
    $changedMarkerPath = Invoke-GitCapture -Arguments @('diff', '--name-only', $RevisionA, $RevisionB, '--', $MarkerSourcePath) `
        -Activity 'Verify legitimate revision-B source delta'
    if ($changedMarkerPath.Trim() -cne $MarkerSourcePath.Replace('\', '/')) { throw 'Revision-B marker is not an adjacent source delta.' }

    foreach ($build in @(
        @{ Image = $frontendImageA; Revision = $RevisionA; Context = (Join-Path $worktreeA 'frontend'); Name = 'revision-A frontend' },
        @{ Image = $frontendImageB; Revision = $RevisionB; Context = (Join-Path $worktreeB 'frontend'); Name = 'revision-B frontend' },
        @{ Image = $backendImageB; Revision = $RevisionB; Context = (Join-Path $worktreeB 'backend'); Name = 'revision-B backend' }
    )) {
        Invoke-CheckedNative -FilePath 'docker' -Arguments @('build', '--build-arg', "VCS_REF=$($build.Revision)", '--tag', $build.Image, $build.Context) `
            -Activity "Build $($build.Name) from clean context"
        $actualImageRevision = Get-ImageRevision -Image $build.Image
        if ($actualImageRevision -cne $build.Revision) { throw "$($build.Name) OCI revision mismatch." }
    }

    foreach ($relative in @('backend/.env', 'frontend/.env', 'postgres_db/.env', 'pgadmin4/.env')) {
        $example = Join-Path $worktreeB ($relative + '.example')
        $target = Join-Path $worktreeB $relative
        [IO.File]::Copy($example, $target, $true)
    }
    # Provision runtime-only secrets after every Docker build. This keeps the
    # detached build contexts clean and prevents ephemeral key material from
    # entering a layer while making the mounted backend/.secrets contract
    # self-contained for either the default or QA profile.
    $secretDirectory = Join-Path $worktreeB 'backend/.secrets'
    New-Item -ItemType Directory -Force -Path $secretDirectory | Out-Null
    New-RsaPemKeyPair -PrivateKeyPath (Join-Path $secretDirectory 'jwt-private.pem') `
        -PublicKeyPath (Join-Path $secretDirectory 'jwt-public.pem')
    foreach ($secretName in @('email-otp-pepper', 'project-variable-key', 'bootstrap-admin-password', 'qa-fixture-password')) {
        $secretValue = [Convert]::ToBase64String((New-CryptographicRandomBytes -Length 48))
        [IO.File]::WriteAllText((Join-Path $secretDirectory $secretName), $secretValue, [Text.UTF8Encoding]::new($false))
    }

    $overrideA = Join-Path $sessionRoot 'frontend-a.yml'
    $overrideB = Join-Path $sessionRoot 'frontend-b.yml'
    $overrideTemplate = @'
services:
  postgres:
    ports: !override []
  backend:
    image: __BACKEND_IMAGE__
    ports: !override []
  frontend:
    image: __FRONTEND_IMAGE__
    ports: !override
      - "127.0.0.1:__FRONTEND_PORT__:8080"
  pgadmin4:
    ports: !override []
'@
    $overrideAContent = $overrideTemplate.Replace('__BACKEND_IMAGE__', $backendImageB).Replace('__FRONTEND_IMAGE__', $frontendImageA).Replace('__FRONTEND_PORT__', '')
    [IO.File]::WriteAllText($overrideA, $overrideAContent, [Text.UTF8Encoding]::new($false))
    $composeBase = Join-Path $worktreeB 'docker-compose.yml'
    $composeFilesA = @($composeBase, $overrideA)
    $composeFilesB = @($composeBase, $overrideB)
    $activeComposeFiles = $composeFilesA
    Invoke-ComposeChecked -Worktree $worktreeB -ComposeFiles $composeFilesA -Command 'up' `
        -CommandArguments @('-d', '--no-build', '--wait', '--wait-timeout', [string]$TimeoutSeconds, 'postgres', 'backend', 'frontend') `
        -Activity 'Start isolated revision-A retained runtime'
    $composeStarted = $true
    & (Join-Path $worktreeB 'scripts/verify-running-revisions.ps1') -ProjectName $ProjectName `
        -ComposeFiles $composeFilesA -ExpectedRevision $RevisionA -Services @('frontend') -TimeoutSeconds $TimeoutSeconds
    $portOutput = Invoke-CheckedNative -FilePath 'docker' -Arguments (New-ComposeArguments -ProjectName $ProjectName `
        -RepositoryRoot $worktreeB -ComposeFiles $composeFilesA -Command 'port' -CommandArguments @('frontend', '8080')) `
        -Activity 'Resolve isolated retained frontend port' -CaptureOutput
    if ($portOutput -notmatch ':(?<port>\d+)\s*$') { throw "Could not parse retained frontend port: $portOutput" }
    $frontendPort = [string]$Matches['port']
    $baseUrl = "http://127.0.0.1:$frontendPort"
    # Pin revision B to A's already-observed origin. An anonymous published
    # port in both overlays could be reallocated during --force-recreate,
    # turning the intended B-served chunk 404 into a connection failure.
    $overrideBContent = $overrideTemplate.Replace('__BACKEND_IMAGE__', $backendImageB).Replace('__FRONTEND_IMAGE__', $frontendImageB).Replace('__FRONTEND_PORT__', $frontendPort)
    [IO.File]::WriteAllText($overrideB, $overrideBContent, [Text.UTF8Encoding]::new($false))
    $headerA = Assert-FrontendHttpContract -BaseUrl $baseUrl -Revision $RevisionA -RunId $runId

    Push-Location (Join-Path $worktreeB 'frontend')
    try { Invoke-CheckedNative -FilePath 'npm' -Arguments @('ci') -Activity 'Install retained-swap Playwright dependencies' }
    finally { Pop-Location }
    New-Item -ItemType Directory -Force -Path $controlDirectory | Out-Null
    $browserJob = Start-Job -ScriptBlock {
        param($FrontendPath, $BaseUrl, $ControlDirectory, $RunId, $RevisionA, $RevisionB, $MarkerId, $MarkerText, $TimeoutMilliseconds)
        $env:E2E_BASE_URL = $BaseUrl
        $env:RETAINED_SWAP_CONTROL_DIR = $ControlDirectory
        $env:RETAINED_SWAP_RUN_ID = $RunId
        $env:RETAINED_SWAP_REVISION_A = $RevisionA
        $env:RETAINED_SWAP_REVISION_B = $RevisionB
        $env:RETAINED_SWAP_FINAL_MARKER_TEST_ID = $MarkerId
        $env:RETAINED_SWAP_FINAL_MARKER_TEXT = $MarkerText
        $env:RETAINED_SWAP_COORDINATION_TIMEOUT_MS = [string]$TimeoutMilliseconds
        Set-Location $FrontendPath
        & npm run e2e -- e2e/retained-swap.spec.ts --project=chromium
        if ($LASTEXITCODE -ne 0) { throw "Retained-swap Playwright exited with code $LASTEXITCODE." }
    } -ArgumentList (Join-Path $worktreeB 'frontend'), $baseUrl, $controlDirectory, $runId, $RevisionA, $RevisionB, `
        $RevisionBMarkerTestId, $RevisionBMarkerText, ($TimeoutSeconds * 1000)

    Wait-ForStateFile -Path (Join-Path $controlDirectory 'retained-a-ready.json') -Status 'retained-a-ready' `
        -RunId $runId -BrowserJob $browserJob | Out-Null
    $activeComposeFiles = $composeFilesB
    Invoke-ComposeChecked -Worktree $worktreeB -ComposeFiles $composeFilesB -Command 'up' `
        -CommandArguments @('-d', '--no-deps', '--no-build', '--force-recreate', '--wait', '--wait-timeout', [string]$TimeoutSeconds, 'frontend') `
        -Activity 'Deploy isolated revision-B frontend'
    & (Join-Path $worktreeB 'scripts/verify-running-revisions.ps1') -ProjectName $ProjectName `
        -ComposeFiles $composeFilesB -ExpectedRevision $RevisionB -Services @('frontend') -TimeoutSeconds $TimeoutSeconds
    $headerB = Assert-FrontendHttpContract -BaseUrl $baseUrl -Revision $RevisionB -RunId $runId
    [IO.File]::WriteAllText((Join-Path $controlDirectory 'revision-b-ready.json'), (@{
        schema_version = 1; phase = 'P6'; run_id = $runId; revision_b = $RevisionB; sanitized = $true; status = 'revision-b-ready'
    } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))

    if (-not (Wait-Job -Job $browserJob -Timeout $TimeoutSeconds)) { throw 'Retained-swap Playwright did not finish.' }
    $browserOutputPreference = $ErrorActionPreference
    try {
        # PowerShell 5.1 promotes stderr from the child Node process into
        # ErrorRecord instances. A non-fatal Node warning must not abort
        # evidence collection before the job state is inspected.
        $ErrorActionPreference = 'Continue'
        $browserOutput = (Receive-Job -Job $browserJob 2>&1 | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
    } finally {
        $ErrorActionPreference = $browserOutputPreference
    }
    if ($browserOutput) { Write-Host $browserOutput }
    if ($browserJob.State -ne 'Completed') {
        $jobErrors = @($browserJob.ChildJobs | ForEach-Object { $_.Error | ForEach-Object { $_.ToString() } }) -join [Environment]::NewLine
        $reason = @($browserJob.ChildJobs | ForEach-Object { $_.JobStateInfo.Reason | ForEach-Object { $_.ToString() } }) -join [Environment]::NewLine
        throw "Retained-swap Playwright failed (state=$($browserJob.State)). errors=$jobErrors reason=$reason"
    }
    $resultPath = Join-Path $controlDirectory 'retained-swap-result.json'
    $result = Wait-ForStateFile -Path $resultPath -Status 'passed' -RunId $runId -BrowserJob $null
    if ([int]$result.document_reloads -ne 1 -or [int]$result.stale_chunk_404s -ne 1 -or `
        [string]$result.final_document_revision -cne $RevisionB -or -not [bool]$result.recovery_marker_a -or `
        -not [bool]$result.final_marker_b -or [bool]$result.reload_loop) {
        throw 'Browser result did not satisfy the exact retained-swap contract.'
    }

    $swap = [ordered]@{
        revision_a = $RevisionA; revision_b = $RevisionB; adjacent = $true
        source_delta_path = $MarkerSourcePath; marker_absent_in_a = $true; marker_present_in_b = $true
        oci_revision_a = $RevisionA; oci_revision_b = $RevisionB
        shell_header_a = $RevisionA; final_header_b = $RevisionB
        static_asset_header_b = $RevisionB; static_404_header_b = $RevisionB; proxy_headers_absent = $true
        document_reloads = 1; stale_chunk_404s = 1; recovery_marker_a = $true; final_marker_b = $true; reload_loop = $false
        initial_asset_path = $headerA.AssetPath; final_asset_path = $headerB.AssetPath
    }
    Merge-SanitizedEvidence -Path $resolvedEvidencePath -Swap ([pscustomobject]$swap) -RunId $runId -SourceRevision $RevisionB

    $manifest = [ordered]@{
        kind = 'pipeline-run'; assertions_total = 20; assertions_failed = 0
        query_backed = $true; adapter_verified = $true; adapter = 'testops-retained-swap-v1'
        source = 'docker-engine-and-playwright'; target_sha = $RevisionB; terminal_status = 'success'; run_id = $runId
    }
    Write-Output ('EVIDENCE_JSON:' + ($manifest | ConvertTo-Json -Compress))
    Write-Host "Retained swap PASS run=$runId revisionA=$RevisionA revisionB=$RevisionB"
} finally {
    if ($browserJob) {
        if ($browserJob.State -notin @('Completed', 'Failed', 'Stopped')) { Stop-Job -Job $browserJob -ErrorAction SilentlyContinue }
        Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue
    }
    if ($composeStarted -and $activeComposeFiles) {
        try {
            Invoke-ComposeChecked -Worktree $worktreeB -ComposeFiles $activeComposeFiles -Command 'down' `
                -CommandArguments @('--volumes', '--remove-orphans') -Activity 'Remove isolated retained-swap runtime'
        } catch { Write-Warning "Retained-swap teardown failed: $($_.Exception.Message)" }
    }
    foreach ($worktree in @($worktreeA, $worktreeB)) {
        if (Test-Path -LiteralPath $worktree) {
            try {
                Invoke-CheckedNative -FilePath 'git' -Arguments @('-C', $root, 'worktree', 'remove', '--force', $worktree) `
                    -Activity "Remove retained-swap worktree $worktree" | Out-Null
            } catch { Write-Warning "Worktree cleanup failed for ${worktree}: $($_.Exception.Message)" }
        }
    }
}

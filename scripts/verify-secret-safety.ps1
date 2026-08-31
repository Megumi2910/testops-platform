param([switch]$IncludeGitDiff)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'quality-gate-common.ps1')

$findings = New-Object System.Collections.Generic.List[string]
function Add-Finding {
    param([string]$Category, [string]$Location)
    $findings.Add("$Category at $Location")
}

function Get-RepositoryCandidates {
    $output = Invoke-CheckedNative -FilePath 'git' `
        -Arguments @('-C', $root, 'ls-files', '--cached', '--others', '--exclude-standard') `
        -Activity 'List repository files for the secret audit' -CaptureOutput
    if ([string]::IsNullOrWhiteSpace($output)) { return @() }
    return @($output -split '[\r\n]+' | Where-Object { $_ })
}

$highConfidencePatterns = @(
    [pscustomobject]@{ Name = 'private-key material'; Pattern = ('-----BEGIN ' + '(?:RSA |EC |OPENSSH )?PRIVATE KEY-----') },
    [pscustomobject]@{ Name = 'GitHub token'; Pattern = 'gh[pousr]_[A-Za-z0-9]{20,}' },
    [pscustomobject]@{ Name = 'GitHub fine-grained token'; Pattern = 'github_pat_[A-Za-z0-9_]{40,}' },
    [pscustomobject]@{ Name = 'AWS access key'; Pattern = 'AKIA[0-9A-Z]{16}' },
    [pscustomobject]@{ Name = 'Google API key'; Pattern = 'AIza[0-9A-Za-z_-]{30,}' },
    [pscustomobject]@{ Name = 'Slack token'; Pattern = 'xox[baprs]-[0-9A-Za-z-]{20,}' },
    [pscustomobject]@{ Name = 'live Stripe key'; Pattern = '(?:sk|rk)_live_[0-9A-Za-z]{16,}' },
    [pscustomobject]@{ Name = 'JWT bearer token'; Pattern = 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' },
    # Synthetic user:pass and user:secret URLs are intentionally present in
    # target-policy tests. Exclude only those exact fixture passwords.
    [pscustomobject]@{ Name = 'credential-bearing URL'; Pattern = 'https?://[^/\s:@]+:(?!(?:pass|secret)@)[^@\s/]+@' }
)

$textExtensions = @(
    '.cs', '.css', '.csv', '.env', '.example', '.html', '.java', '.js', '.json',
    '.jsx', '.md', '.mjs', '.properties', '.ps1', '.sh', '.sql', '.svg', '.toml',
    '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml'
)
$riskyRuntimePath = '^(?:backend/\.secrets/(?!\.gitkeep$)|frontend/(?:playwright-report|test-results)/|qa-artifacts/|artifacts/(?!\.gitkeep$))'
$riskyExtension = '\.(?:pem|key|p12|pfx|jks|keystore|sqlite3?|db|trace|har|webm)$'

$candidates = @(Get-RepositoryCandidates)
foreach ($relativePath in $candidates) {
    $portablePath = $relativePath -replace '\\', '/'
    if ($portablePath -match $riskyRuntimePath -or $portablePath -match $riskyExtension -or
        ($portablePath -match '(^|/)\.env(?:\..+)?$' -and $portablePath -notmatch '\.env\.example$')) {
        Add-Finding -Category 'tracked or publication-eligible runtime/secret file' -Location $portablePath
        continue
    }

    $fullPath = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { continue }
    $item = Get-Item -LiteralPath $fullPath
    if ($item.Length -gt 5MB) { continue }
    $extension = [IO.Path]::GetExtension($fullPath).ToLowerInvariant()
    if ($textExtensions -notcontains $extension -and $item.Name -notin @('Dockerfile', 'Makefile')) { continue }

    try {
        $content = [IO.File]::ReadAllText($fullPath)
    } catch {
        continue
    }
    foreach ($pattern in $highConfidencePatterns) {
        if ($content -match $pattern.Pattern) {
            Add-Finding -Category $pattern.Name -Location $portablePath
        }
    }
}

# Compare publication-eligible source against locally generated secrets without
# ever printing secret values. A match reports only the source secret filename
# and the candidate repository path.
$localSecretDirectory = Join-Path $root 'backend\.secrets'
if (Test-Path -LiteralPath $localSecretDirectory) {
    $localSecrets = @()
    foreach ($secretFile in Get-ChildItem -LiteralPath $localSecretDirectory -File) {
        try {
            $secretValue = ([IO.File]::ReadAllText($secretFile.FullName)).Trim()
            if ($secretValue.Length -ge 8 -and $secretFile.Name -ne 'jwt-public.pem') {
                $localSecrets += [pscustomobject]@{ Name = $secretFile.Name; Value = $secretValue }
            }
        } catch {
            # Non-text local secret files are still protected by ignore policy.
        }
    }
    foreach ($relativePath in $candidates) {
        $fullPath = Join-Path $root $relativePath
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { continue }
        $item = Get-Item -LiteralPath $fullPath
        if ($item.Length -gt 5MB) { continue }
        $extension = [IO.Path]::GetExtension($fullPath).ToLowerInvariant()
        if ($textExtensions -notcontains $extension -and $item.Name -notin @('Dockerfile', 'Makefile')) { continue }
        try { $content = [IO.File]::ReadAllText($fullPath) } catch { continue }
        foreach ($secret in $localSecrets) {
            if ($content.Contains($secret.Value)) {
                Add-Finding -Category "literal local secret '$($secret.Name)'" -Location ($relativePath -replace '\\', '/')
            }
        }
    }
}

$workflowPath = Join-Path $root '.github\workflows\ci.yml'
if (-not (Test-Path -LiteralPath $workflowPath)) {
    Add-Finding -Category 'missing CI workflow policy' -Location '.github/workflows/ci.yml'
} else {
    $workflow = [IO.File]::ReadAllText($workflowPath)
    if ($workflow -match 'actions/upload-artifact') {
        Add-Finding -Category 'unsanitized public artifact publisher' -Location '.github/workflows/ci.yml'
    }
    if ($workflow -notmatch '(?m)^permissions:\s*\r?\n\s+contents:\s*read\s*$') {
        Add-Finding -Category 'missing least-privilege contents: read policy' -Location '.github/workflows/ci.yml'
    }
}

$playwrightConfigPath = Join-Path $root 'frontend\playwright.config.ts'
if (-not (Test-Path -LiteralPath $playwrightConfigPath)) {
    Add-Finding -Category 'missing local artifact retention policy' -Location 'frontend/playwright.config.ts'
} else {
    $playwrightConfig = [IO.File]::ReadAllText($playwrightConfigPath)
    foreach ($requiredPolicy in @(
        "trace:\s*'retain-on-failure'",
        "screenshot:\s*'only-on-failure'",
        "video:\s*'retain-on-failure'"
    )) {
        if ($playwrightConfig -notmatch $requiredPolicy) {
            Add-Finding -Category 'unsafe Playwright retention policy' -Location 'frontend/playwright.config.ts'
        }
    }
}

foreach ($artifactRoot in @('frontend/playwright-report', 'frontend/test-results', 'qa-artifacts', 'artifacts')) {
    $checkPath = Join-Path $root (Join-Path $artifactRoot '.secret-audit-probe')
    & git -C $root check-ignore --quiet -- $checkPath
    if ($LASTEXITCODE -ne 0) {
        Add-Finding -Category 'local artifact directory is not ignored' -Location $artifactRoot
    }
}

if ($IncludeGitDiff) {
    $diffs = @(
        (Invoke-CheckedNative -FilePath 'git' -Arguments @('-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-C', $root, 'diff', '--no-ext-diff', '--text') `
            -Activity 'Read unstaged diff for secret audit' -CaptureOutput),
        (Invoke-CheckedNative -FilePath 'git' -Arguments @('-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-C', $root, 'diff', '--cached', '--no-ext-diff', '--text') `
            -Activity 'Read staged diff for secret audit' -CaptureOutput)
    ) -join [Environment]::NewLine
    foreach ($pattern in $highConfidencePatterns) {
        if ($diffs -match $pattern.Pattern) {
            Add-Finding -Category "$($pattern.Name) in Git diff" -Location 'working tree diff'
        }
    }
}

if ($findings.Count -gt 0) {
    $safeDetails = $findings | Sort-Object -Unique
    throw "Secret-safety audit failed:`n - $($safeDetails -join "`n - ")"
}

Write-Host "Secret-safety audit PASS files=$($candidates.Count) publicArtifactPublishers=0 localArtifactRootsIgnored=4"

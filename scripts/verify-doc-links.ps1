[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$documentationFiles = Get-ChildItem -LiteralPath (Join-Path $repositoryRoot 'docs') -Recurse -File |
    Where-Object { $_.Extension -in @('.md', '.html') }
$documentationFiles += Get-Item -LiteralPath (Join-Path $repositoryRoot 'README.md')
$failures = [System.Collections.Generic.List[string]]::new()
$manifestPath = Join-Path $repositoryRoot 'DOCUMENTATION-MANIFEST.json'

foreach ($file in $documentationFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $matches = [System.Collections.Generic.List[object]]::new()
    foreach ($match in [regex]::Matches($content, '(?<!\!)\[[^\]]+\]\((?<target>[^)]+)\)')) { $matches.Add($match) }
    foreach ($match in [regex]::Matches($content, '(?:href|src)=["''](?<target>[^"'']+)["'']')) { $matches.Add($match) }
    foreach ($match in $matches) {
        $target = $match.Groups['target'].Value.Trim()
        if ($target -match '^(?:https?://|mailto:|tel:|javascript:|data:|#)' -or $target -eq '') {
            continue
        }

        $pathWithoutFragment = ($target -split '#', 2)[0]
        $decodedPath = ([Uri]::UnescapeDataString($pathWithoutFragment).Trim('<', '>') -replace '\s+', '')
        if ($decodedPath -eq '') { continue }
        $candidate = Join-Path $file.DirectoryName $decodedPath
        if ($decodedPath.StartsWith('../')) {
            $repositoryCandidate = Join-Path $repositoryRoot $decodedPath.Substring(3)
            if (Test-Path -LiteralPath $repositoryCandidate) { $candidate = $repositoryCandidate }
        }
        if (-not (Test-Path -LiteralPath $candidate) -and $decodedPath -notmatch '[\\/]') {
            $sameName = @(Get-ChildItem -LiteralPath (Join-Path $repositoryRoot 'docs') -Recurse -File -Filter $decodedPath)
            if ($sameName.Count -eq 1) { $candidate = $sameName[0].FullName }
        }
        if (-not (Test-Path -LiteralPath $candidate)) {
            $relativeFile = $file.FullName.Substring($repositoryRoot.Length).TrimStart('\', '/')
            $failures.Add("$relativeFile -> $target")
        }
    }
}

try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace([string]$manifest.classification)) {
        $failures.Add('DOCUMENTATION-MANIFEST.json -> classification is required')
    }
    if ([string]$manifest.verified_revision -notmatch '^[0-9a-f]{40}$') {
        $failures.Add('DOCUMENTATION-MANIFEST.json -> verified_revision must be a full lowercase Git revision')
    }
    $verifiedAt = [DateTime]::MinValue
    if (-not [DateTime]::TryParseExact([string]$manifest.verified_at, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture,
            [Globalization.DateTimeStyles]::None, [ref]$verifiedAt)) {
        $failures.Add('DOCUMENTATION-MANIFEST.json -> verified_at must use yyyy-MM-dd')
    }
    if ([string]::IsNullOrWhiteSpace([string]$manifest.source_status)) {
        $failures.Add('DOCUMENTATION-MANIFEST.json -> source_status is required')
    }

    $manifestDocuments = @($manifest.documents)
    if ($manifestDocuments.Count -eq 0) {
        $failures.Add('DOCUMENTATION-MANIFEST.json -> documents must not be empty')
    }
    $seenManifestPaths = @{}
    foreach ($document in $manifestDocuments) {
        $documentPath = ([string]$document.path).Replace('/', [IO.Path]::DirectorySeparatorChar)
        if ([string]::IsNullOrWhiteSpace($documentPath)) {
            $failures.Add('DOCUMENTATION-MANIFEST.json -> every document requires a path')
            continue
        }
        $pathKey = $documentPath.ToLowerInvariant()
        if ($seenManifestPaths.ContainsKey($pathKey)) {
            $failures.Add("DOCUMENTATION-MANIFEST.json -> duplicate document path: $($document.path)")
            continue
        }
        $seenManifestPaths[$pathKey] = $true
        $candidate = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $documentPath))
        $rootPrefix = [IO.Path]::GetFullPath($repositoryRoot).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
        if (-not $candidate.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            $failures.Add("DOCUMENTATION-MANIFEST.json -> path escapes repository: $($document.path)")
        } elseif (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            $failures.Add("DOCUMENTATION-MANIFEST.json -> missing document: $($document.path)")
        }
        if ([string]::IsNullOrWhiteSpace([string]$document.role)) {
            $failures.Add("DOCUMENTATION-MANIFEST.json -> role is required for $($document.path)")
        }
    }
} catch {
    $failures.Add("DOCUMENTATION-MANIFEST.json -> invalid JSON or manifest contract: $($_.Exception.Message)")
}

if ($failures.Count -gt 0) {
    Write-Error ("Broken documentation links:`n - " + ($failures -join "`n - "))
}

Write-Output "Documentation links and manifest verified across $($documentationFiles.Count) Markdown/HTML files and $(@($manifest.documents).Count) manifest entries."

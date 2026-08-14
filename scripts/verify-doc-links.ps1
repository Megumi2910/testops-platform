[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$qualityGateRoots = @('docs/guides', 'docs/testing', 'docs/workflows')
$markdownFiles = foreach ($relativeRoot in $qualityGateRoots) {
    Get-ChildItem -LiteralPath (Join-Path $repositoryRoot $relativeRoot) -Recurse -File -Filter '*.md'
}
$markdownFiles += Get-Item -LiteralPath (Join-Path $repositoryRoot 'docs/README.md')
$markdownFiles += Get-Item -LiteralPath (Join-Path $repositoryRoot 'README.md')
$failures = [System.Collections.Generic.List[string]]::new()

foreach ($file in $markdownFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $matches = [regex]::Matches($content, '(?<!\!)\[[^\]]+\]\((?<target>[^)]+)\)')
    foreach ($match in $matches) {
        $target = $match.Groups['target'].Value.Trim()
        if ($target -match '^(?:https?://|mailto:|tel:|#)' -or $target -eq '') {
            continue
        }

        $pathWithoutFragment = ($target -split '#', 2)[0]
        $decodedPath = [Uri]::UnescapeDataString($pathWithoutFragment).Trim('<', '>')
        $candidate = Join-Path $file.DirectoryName $decodedPath
        if (-not (Test-Path -LiteralPath $candidate)) {
            $relativeFile = [IO.Path]::GetRelativePath($repositoryRoot, $file.FullName)
            $failures.Add("$relativeFile -> $target")
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Error ("Broken documentation links:`n - " + ($failures -join "`n - "))
}

Write-Output "Quality-gate documentation links verified: $($markdownFiles.Count) Markdown files."

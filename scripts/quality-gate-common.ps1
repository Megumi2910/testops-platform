Set-StrictMode -Version Latest

function Get-NormalizedComposeProjectName {
    param([Parameter(Mandatory = $true)][string]$Value)

    $normalized = $Value.ToLowerInvariant() -replace '[^a-z0-9_-]', '-'
    $normalized = $normalized -replace '^[^a-z0-9]+', ''
    return $normalized
}

function Get-DefaultComposeProjectNames {
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)

    $resolvedRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
    $candidates = New-Object System.Collections.Generic.List[string]
    $directoryName = Split-Path -Leaf $resolvedRoot
    $normalizedDirectory = Get-NormalizedComposeProjectName $directoryName
    if ($normalizedDirectory) { $candidates.Add($normalizedDirectory) }

    if (-not [string]::IsNullOrWhiteSpace($env:COMPOSE_PROJECT_NAME)) {
        $candidates.Add((Get-NormalizedComposeProjectName $env:COMPOSE_PROJECT_NAME))
    }

    $composePath = Join-Path $resolvedRoot 'docker-compose.yml'
    if (Test-Path -LiteralPath $composePath) {
        foreach ($line in Get-Content -LiteralPath $composePath) {
            if ($line -match '^name:\s*["'']?([^\s"'']+)["'']?\s*$') {
                $candidates.Add((Get-NormalizedComposeProjectName $Matches[1]))
                break
            }
            if ($line -match '^services:\s*$') { break }
        }
    }

    return @($candidates | Where-Object { $_ } | Select-Object -Unique)
}

function Assert-IsolatedComposeProjectName {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectName,
        [Parameter(Mandatory = $true)][string]$RepositoryRoot
    )

    if ([string]::IsNullOrWhiteSpace($ProjectName)) {
        throw 'An explicit isolated Compose project name is required.'
    }
    if ($ProjectName.Length -gt 63 -or $ProjectName -cnotmatch '^[a-z0-9][a-z0-9_-]*$') {
        throw "Compose project '$ProjectName' must be 1-63 lowercase letters, digits, hyphens, or underscores and start with a letter or digit."
    }

    $normalizedProject = Get-NormalizedComposeProjectName $ProjectName
    $defaults = @(Get-DefaultComposeProjectNames $RepositoryRoot)
    if ($defaults -contains $normalizedProject) {
        throw "Compose project '$ProjectName' resolves to the repository's default project. Choose an isolated project name."
    }

    return $ProjectName
}

function New-ComposeArguments {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectName,
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string[]]$ComposeFiles,
        [Parameter(Mandatory = $true)][string]$Command,
        [string[]]$CommandArguments = @()
    )

    Assert-IsolatedComposeProjectName -ProjectName $ProjectName -RepositoryRoot $RepositoryRoot | Out-Null
    if ($ComposeFiles.Count -eq 0) { throw 'At least one Compose file is required.' }

    $arguments = @('compose', '-p', $ProjectName)
    foreach ($file in $ComposeFiles) {
        if ([string]::IsNullOrWhiteSpace($file)) { throw 'Compose file paths must not be blank.' }
        $arguments += @('-f', $file)
    }
    $arguments += $Command
    $arguments += $CommandArguments
    return ,$arguments
}

function Format-NativeInvocation {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $displayArguments = foreach ($argument in $Arguments) {
        if ($argument -match '[\s"]') { '"' + ($argument -replace '"', '\"') + '"' } else { $argument }
    }
    $parts = @($FilePath) + @($displayArguments)
    return $parts -join ' '
}

function Invoke-CheckedNative {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Activity,
        [switch]$CaptureOutput,
        [switch]$DryRun
    )

    $invocation = Format-NativeInvocation -FilePath $FilePath -Arguments $Arguments
    if ($DryRun) {
        Write-Output "DRY-RUN $invocation"
        return
    }

    # Windows PowerShell 5.1 surfaces native stderr as ErrorRecord instances.
    # With the repository-wide Stop preference, harmless progress and warning
    # output from Git, npm, Maven, and Docker would otherwise abort a successful
    # command. Merge stderr into the diagnostic stream and decide success only
    # from the native process exit code.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        if ($CaptureOutput) {
            $output = @(& $FilePath @Arguments 2>&1 | ForEach-Object { $_.ToString() })
            $exitCode = $LASTEXITCODE
        } else {
            & $FilePath @Arguments 2>&1 | ForEach-Object { Write-Output ($_.ToString()) }
            $exitCode = $LASTEXITCODE
        }
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0) { throw "$Activity failed with exit code $exitCode ($invocation)" }
    if ($CaptureOutput) { return ($output -join [Environment]::NewLine).Trim() }
}

function Get-GitRevision {
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)

    $revision = Invoke-CheckedNative -FilePath 'git' -Arguments @('-C', $RepositoryRoot, 'rev-parse', 'HEAD') `
        -Activity "Read Git revision in $RepositoryRoot" -CaptureOutput
    if ($revision -notmatch '^[0-9a-fA-F]{40}$') {
        throw "Git returned an invalid revision for $RepositoryRoot."
    }
    return $revision.ToLowerInvariant()
}

function Assert-RevisionHealthContract {
    param(
        [Parameter(Mandatory = $true)][string]$Service,
        [Parameter(Mandatory = $true)][string]$ExpectedRevision,
        [AllowEmptyString()][string]$ActualRevision,
        [AllowEmptyString()][string]$Health
    )

    if ($ExpectedRevision -notmatch '^[0-9a-fA-F]{40}$') {
        throw "$Service expected revision is missing or is not a full Git commit."
    }
    if ([string]::IsNullOrWhiteSpace($ActualRevision) -or $ActualRevision -eq 'unknown') {
        throw "$Service has no trustworthy OCI revision label."
    }
    if ($ActualRevision -cne $ExpectedRevision) {
        throw "$Service revision mismatch: expected $ExpectedRevision, running $ActualRevision"
    }
    if ($Health -cne 'healthy') {
        throw "$Service health contract failed: expected healthy, observed '$Health'"
    }
}

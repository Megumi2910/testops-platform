[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 100000)]
    [int]$Number,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$ExpectedRevision
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$json = & gh pr view $Number --json number,state,isDraft,headRefName,headRefOid,baseRefName,title,body 2>&1
if ($LASTEXITCODE -ne 0) { throw "Unable to read draft PR #$Number." }
try { $pr = ($json -join [Environment]::NewLine | ConvertFrom-Json) } catch { throw "Draft PR #$Number returned invalid JSON." }

$revision = $ExpectedRevision.ToLowerInvariant()
if ([int]$pr.number -ne $Number -or [string]$pr.state -ne 'OPEN' -or $pr.isDraft -ne $true) { throw "PR #$Number must remain open and draft." }
if ([string]$pr.headRefOid -ne $revision) { throw "PR #$Number head $($pr.headRefOid) does not match candidate $revision." }
if ([string]$pr.baseRefName -ne 'main') { throw "PR #$Number must target main." }
if ([string]$pr.title -notmatch '(?i)milestone\s*10A|testops') { throw 'PR title does not describe the TestOps Milestone 10A candidate.' }
if ([string]$pr.body -notmatch '(?i)phase\s*9|phase\s*10|evidence|verification') { throw 'PR body does not describe the current evidence boundary.' }

Write-Output "PR state PASS number=$Number state=$($pr.state) draft=$($pr.isDraft) head=$revision base=$($pr.baseRefName)"

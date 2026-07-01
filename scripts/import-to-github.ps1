<#
Bulk-creates a GitHub Issue for every row in tasks.csv, labels it by phase,
adds it to a GitHub Project (v2), and fills in the Start date / Target date /
Phase / Status fields.

Prerequisites:
  - GitHub CLI installed and authenticated: winget install GitHub.cli ; gh auth login
  - An empty repo already pushed (see README.md)
  - A GitHub Project already created with fields matching docs/github-project-setup.md:
    Phase (single select), Status (single select), Start date (date), Target date (date)

Usage:
  ./import-to-github.ps1 -Owner "your-org-or-user" -Repo "it-deployment-gantt" -ProjectNumber 1

This is a starting point, not a one-size-fits-all tool: if you renamed fields
or option labels in step 2 of docs/github-project-setup.md, update the
$fieldNames / matching below to match.
#>

param(
    [Parameter(Mandatory = $true)][string]$Owner,
    [Parameter(Mandatory = $true)][string]$Repo,
    [Parameter(Mandatory = $true)][int]$ProjectNumber,
    [string]$CsvPath = (Join-Path $PSScriptRoot "..\tasks.csv")
)

$ErrorActionPreference = "Stop"

function Get-ProjectFields {
    param([string]$Owner, [int]$ProjectNumber)
    $json = gh project field-list $ProjectNumber --owner $Owner --format json | ConvertFrom-Json
    return $json.fields
}

Write-Host "Fetching project field definitions..."
$fields = Get-ProjectFields -Owner $Owner -ProjectNumber $ProjectNumber

function Get-Field($name) {
    $f = $fields | Where-Object { $_.name -eq $name }
    if (-not $f) { throw "Field '$name' not found on project $ProjectNumber. Create it first (see docs/github-project-setup.md)." }
    return $f
}

$phaseField  = Get-Field "Phase"
$statusField = Get-Field "Status"
$startField  = Get-Field "Start date"
$targetField = Get-Field "Target date"

function Get-OptionId($field, $optionName) {
    $opt = $field.options | Where-Object { $_.name -eq $optionName }
    if (-not $opt) { throw "Option '$optionName' not found on field '$($field.name)'. Add it in the Project settings first." }
    return $opt.id
}

Write-Host "Reading $CsvPath..."
$rows = Import-Csv -Path $CsvPath

foreach ($row in $rows) {
    $labelSlug = ($row.Phase -replace '^Phase (\d+).*', 'phase-$1')
    Write-Host "Creating issue: [$($row.ID)] $($row.'Task / Subtask')"

    $body = @"
**Phase:** $($row.Phase)
**Type:** $($row.Type)
**Duration:** $($row.'Duration (business days)') business days
**Start date:** $($row.'Start Date')
**Target date:** $($row.'End Date')
**Dependencies:** $($row.'Dependencies (IDs)')
**Owner:** $($row.Owner)

_Imported from tasks.csv (ID: $($row.ID))_
"@

    # Ensure the phase label exists (idempotent; ignore error if it already does)
    try { gh label create $labelSlug --repo "$Owner/$Repo" --color "0366d6" 2>$null } catch {}

    $issueUrl = gh issue create --repo "$Owner/$Repo" `
        --title "[$($row.ID)] $($row.'Task / Subtask')" `
        --body $body `
        --label $labelSlug

    $itemJson = gh project item-add $ProjectNumber --owner $Owner --url $issueUrl --format json | ConvertFrom-Json
    $itemId = $itemJson.id

    gh project item-edit --id $itemId --project-id $itemJson.projectId `
        --field-id $startField.id --date $row.'Start Date' | Out-Null
    gh project item-edit --id $itemId --project-id $itemJson.projectId `
        --field-id $targetField.id --date $row.'End Date' | Out-Null

    $phaseOptionId = Get-OptionId $phaseField $row.Phase
    gh project item-edit --id $itemId --project-id $itemJson.projectId `
        --field-id $phaseField.id --single-select-option-id $phaseOptionId | Out-Null

    $statusOptionId = Get-OptionId $statusField "Not Started"
    gh project item-edit --id $itemId --project-id $itemJson.projectId `
        --field-id $statusField.id --single-select-option-id $statusOptionId | Out-Null
}

Write-Host "Done. Created $($rows.Count) issues and added them to project #$ProjectNumber."

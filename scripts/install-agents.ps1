param(
    [Parameter(Mandatory = $false)]
    [string]$ProjectPath = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$project = [System.IO.Path]::GetFullPath($ProjectPath)
$template = Join-Path (Split-Path -Parent $PSScriptRoot) 'project-files\AGENTS.md.template'
$target = Join-Path $project 'AGENTS.md'

if (-not (Test-Path -LiteralPath (Join-Path $project '.specify') -PathType Container)) {
    throw "Spec Kit was not found in $project. Run specify init in the project folder first."
}

if (-not (Test-Path -LiteralPath $template -PathType Leaf)) {
    throw "Template not found: $template"
}

$desired = Get-Content -LiteralPath $template -Raw
if (Test-Path -LiteralPath $target -PathType Leaf) {
    $existing = Get-Content -LiteralPath $target -Raw
    $normalize = { param($text) $text.Replace("`r`n", "`n").Trim() }
    $default = @'
<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
'@
    if ((& $normalize $existing) -eq (& $normalize $desired)) {
        Write-Host "AGENTS.md is already installed: $target"
        exit 0
    }
    if ((& $normalize $existing) -ne (& $normalize $default)) {
        throw "Custom rules already exist in $target. This script will not overwrite them. Merge them with project-files/AGENTS.md.template manually."
    }
}

Copy-Item -LiteralPath $template -Destination $target -Force
Write-Host "Installed AGENTS.md: $target"

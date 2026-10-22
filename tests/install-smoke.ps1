param(
    [Parameter(Mandatory = $false)]
    [string]$KitPath = (Split-Path -Parent $PSScriptRoot),
    [Parameter(Mandatory = $false)]
    [string]$ProbeParent = [System.IO.Path]::GetTempPath()
)

$ErrorActionPreference = 'Stop'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'

$kit = [System.IO.Path]::GetFullPath($KitPath)
$preset = Join-Path $kit 'preset'
$extension = Join-Path $kit 'extension\grooming'
$installer = Join-Path $kit 'scripts\install-agents.ps1'

foreach ($file in @((Join-Path $preset 'preset.yml'), (Join-Path $extension 'extension.yml'), $installer)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Package file not found: $file"
    }
}

if (-not (Get-Command specify -ErrorAction SilentlyContinue)) {
    throw 'The specify command was not found. Install the official Spec Kit as described in README.md.'
}

$testBase = [System.IO.Path]::GetFullPath($ProbeParent)
if (-not (Test-Path -LiteralPath $testBase -PathType Container)) {
    throw "Temporary project parent folder does not exist: $testBase"
}
$safePrefix = $testBase.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$probe = [System.IO.Path]::GetFullPath((Join-Path $testBase ('codex-speckit-smoke-' + [guid]::NewGuid().ToString('N'))))
if (-not $probe.StartsWith($safePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Unsafe temporary project path.'
}

New-Item -ItemType Directory -Path $probe | Out-Null
try {
    Push-Location -LiteralPath $probe
    try {
        specify init --here --integration codex --script ps --ignore-agent-tools
        if ($LASTEXITCODE -ne 0) { throw 'specify init failed.' }

        specify extension add $extension --dev
        if ($LASTEXITCODE -ne 0) { throw 'Grooming extension installation failed.' }

        specify preset add --dev $preset
        if ($LASTEXITCODE -ne 0) { throw 'Preset installation failed.' }

        & $installer -ProjectPath $probe | Out-Null

        $required = @(
            '.agents\skills\speckit-grooming-prepare\SKILL.md',
            '.agents\skills\speckit-specify\SKILL.md',
            '.agents\skills\speckit-plan\SKILL.md',
            '.agents\skills\speckit-tasks\SKILL.md',
            '.agents\skills\speckit-implement\SKILL.md',
            'AGENTS.md'
        )
        foreach ($relative in $required) {
            if (-not (Test-Path -LiteralPath (Join-Path $probe $relative) -PathType Leaf)) {
                throw "Missing after installation: $relative"
            }
        }

        $groom = Get-Content -LiteralPath (Join-Path $probe '.agents\skills\speckit-grooming-prepare\SKILL.md') -Raw
        $specifySkill = Get-Content -LiteralPath (Join-Path $probe '.agents\skills\speckit-specify\SKILL.md') -Raw
        $planSkill = Get-Content -LiteralPath (Join-Path $probe '.agents\skills\speckit-plan\SKILL.md') -Raw
        $tasks = Get-Content -LiteralPath (Join-Path $probe '.agents\skills\speckit-tasks\SKILL.md') -Raw
        $agentRules = Get-Content -LiteralPath (Join-Path $probe 'AGENTS.md') -Raw
        if ($groom -notmatch '# Task grooming') { throw 'The grooming command was not registered in Codex.' }
        if ($specifySkill -notmatch 'Agreed scope and decision boundaries') { throw 'The preset did not extend the specify command.' }
        if ($planSkill -notmatch 'Test-first and verification plan') { throw 'The preset did not extend the plan command.' }
        if ($tasks -notmatch 'Standing requirements for this preset') { throw 'The TDD command was not applied.' }
        if ($agentRules -notmatch '<!-- SPECKIT START -->') { throw 'Spec Kit markers were lost from AGENTS.md.' }

        Write-Host 'PASS: Official Spec Kit, grooming extension, preset, and AGENTS.md installed in a clean project.'
    }
    finally {
        Pop-Location
    }
}
finally {
    if ($probe.StartsWith($safePrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $probe -PathType Container)) {
        Remove-Item -LiteralPath $probe -Recurse -Force
    }
}

[CmdletBinding()]
param(
    [ValidateSet("User", "Project")]
    [string]$Scope = "User",
    [string]$ProjectPath,
    [switch]$WithEspanso,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

if ($Scope -eq "Project") {
    if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
        throw "-ProjectPath is required when -Scope Project is selected."
    }
    $ResolvedProject = (Resolve-Path -LiteralPath $ProjectPath).Path
    $Destination = Join-Path $ResolvedProject ".claude"
} else {
    $Destination = Join-Path $HOME ".claude"
}

$Plan = [System.Collections.Generic.List[object]]::new()

function Add-TreeToPlan {
    param(
        [Parameter(Mandatory)] [string]$SourceRoot,
        [Parameter(Mandatory)] [string]$DestinationRoot
    )

    Get-ChildItem -LiteralPath $SourceRoot -Recurse -File | ForEach-Object {
        $RelativePath = [System.IO.Path]::GetRelativePath($SourceRoot, $_.FullName)
        $Plan.Add([pscustomobject]@{
            Source = $_.FullName
            Destination = Join-Path $DestinationRoot $RelativePath
        })
    }
}

Add-TreeToPlan (Join-Path $RepoRoot ".claude\agents") (Join-Path $Destination "agents")
Add-TreeToPlan (Join-Path $RepoRoot ".claude\skills") (Join-Path $Destination "skills")

if ($WithEspanso) {
    if ([string]::IsNullOrWhiteSpace($env:APPDATA)) {
        throw "APPDATA is required to install the Espanso adapter."
    }
    $Plan.Add([pscustomobject]@{
        Source = Join-Path $RepoRoot "text-replacements\espanso\maestro-mini.yml"
        Destination = Join-Path $env:APPDATA "espanso\match\maestro-mini.yml"
    })
}

foreach ($Item in $Plan) {
    if ((Test-Path -LiteralPath $Item.Destination) -and -not $Force) {
        $SourceHash = (Get-FileHash -LiteralPath $Item.Source -Algorithm SHA256).Hash
        $DestinationHash = (Get-FileHash -LiteralPath $Item.Destination -Algorithm SHA256).Hash
        if ($SourceHash -ne $DestinationHash) {
            throw "Refusing to overwrite: $($Item.Destination). Use -Force to replace it."
        }
    }
}

foreach ($Item in $Plan) {
    $Parent = Split-Path -Parent $Item.Destination
    New-Item -ItemType Directory -Path $Parent -Force | Out-Null
    Copy-Item -LiteralPath $Item.Source -Destination $Item.Destination -Force
    Write-Output "Installed $($Item.Destination)"
}

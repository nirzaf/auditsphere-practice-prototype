[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('staging', 'production')]
    [string] $Environment,

    [Parameter(Mandatory = $true)]
    [string] $DestinationPath,

    [string] $NodeExecutable = 'node'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$destination = [IO.Path]::GetFullPath($DestinationPath)
if (-not [IO.Path]::IsPathRooted($DestinationPath)) {
    throw 'DestinationPath must be an absolute path to an approved private backup directory.'
}
$repositoryPrefix = $repositoryRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if ($destination.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    $destination.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Backup destination must be outside the repository.'
}
if (-not (Test-Path -LiteralPath $destination -PathType Container)) {
    throw 'Backup destination directory must already exist and be access-controlled, private, and encrypted at rest.'
}

$databaseName = if ($Environment -eq 'staging') { 'auditsphere-staging' } else { 'auditsphere-production' }
$wranglerEntrypoint = Join-Path $repositoryRoot 'node_modules\wrangler\bin\wrangler.js'
$configPath = Join-Path $repositoryRoot 'wrangler.jsonc'
if (-not (Test-Path -LiteralPath $wranglerEntrypoint -PathType Leaf)) {
    throw 'Wrangler is not installed in this repository; run npm install before scheduling exports.'
}

$createdAt = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ', [Globalization.CultureInfo]::InvariantCulture)
$suffix = [Guid]::NewGuid().ToString('N')
$baseName = "auditsphere-$Environment-$createdAt-$suffix"
$partialPath = Join-Path $destination "$baseName.partial.sql"
$finalPath = Join-Path $destination "$baseName.sql"
$manifestPartialPath = Join-Path $destination "$baseName.manifest.partial.json"
$manifestPath = Join-Path $destination "$baseName.manifest.json"

try {
    & $NodeExecutable $wranglerEntrypoint 'd1' 'export' $databaseName '--remote' '--config' $configPath '--env' $Environment '--output' $partialPath '--skip-confirmation'
    if ($LASTEXITCODE -ne 0) {
        throw "Wrangler D1 export failed for the $Environment database (exit $LASTEXITCODE)."
    }
    if (-not (Test-Path -LiteralPath $partialPath -PathType Leaf)) {
        throw 'Wrangler completed without producing the expected SQL export.'
    }

    $exportHash = (Get-FileHash -LiteralPath $partialPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $exportInfo = Get-Item -LiteralPath $partialPath
    if ($exportInfo.Length -eq 0) {
        throw 'Wrangler produced an empty SQL export.'
    }

    $manifest = [ordered]@{
        environment = $Environment
        database = $databaseName
        createdAtUtc = [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
        exportFile = [IO.Path]::GetFileName($finalPath)
        exportBytes = $exportInfo.Length
        exportSha256 = $exportHash
    }
    $manifestJson = $manifest | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText($manifestPartialPath, $manifestJson, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $partialPath -Destination $finalPath
    Move-Item -LiteralPath $manifestPartialPath -Destination $manifestPath

    $storedHash = (Get-FileHash -LiteralPath $finalPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($storedHash -ne $exportHash) {
        throw 'Export integrity check failed after moving the file to its final path.'
    }
    Write-Output "D1 export completed: $([IO.Path]::GetFileName($finalPath))"
    Write-Output "Manifest: $([IO.Path]::GetFileName($manifestPath))"
} catch {
    Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $manifestPartialPath -Force -ErrorAction SilentlyContinue
    throw
}

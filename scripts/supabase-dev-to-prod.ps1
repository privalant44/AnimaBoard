<#
.SYNOPSIS
  Exporte la base Supabase locale (dev) et/ou importe dans Supabase cloud (prod).

.DESCRIPTION
  Utilise pg_dump / pg_restore / psql (PostgreSQL client tools).

  Actions :
    Export  — dump du schéma public local vers backups/
    Import  — vide public en prod, restaure un dump, réapplique les droits Supabase
    Clone   — Export dev + backup prod + Import (pipeline complet)

  Configuration prod : fichier .env.production à la racine du projet
    SUPABASE_URL=https://<project-ref>.supabase.co
    SUPABASE_DB_PASSWORD=<mot de passe postgres>   (Dashboard → Settings → Database)

.EXAMPLE
  .\scripts\supabase-dev-to-prod.ps1 -Action Export

.EXAMPLE
  .\scripts\supabase-dev-to-prod.ps1 -Action Import -DumpFile .\backups\dev-export-20260604.dump

.EXAMPLE
  .\scripts\supabase-dev-to-prod.ps1 -Action Clone
#>

param(
  [ValidateSet('Export', 'Import', 'Clone')]
  [string] $Action = 'Clone',
  [string] $DevDbUrl = '',
  [string] $ProdDbUrl = '',
  [string] $ProdProjectRef = '',
  [string] $DumpFile = '',
  [string] $OutputDir = '.\backups',
  [string] $EnvFile = '.\.env.production',
  [switch] $Force,
  [switch] $SkipProdBackup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message, [string]$Color = 'Cyan')
  Write-Host ''
  Write-Host $Message -ForegroundColor $Color
}

function Read-DotEnvFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return @{}
  }
  $vars = @{}
  Get-Content -Path $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $vars[$key] = $value
  }
  return $vars
}

function Encode-DbPassword {
  param([string]$Password)
  return [uri]::EscapeDataString($Password)
}

function Resolve-PgTool {
  param([string]$ExeName)

  $direct = Get-Command $ExeName -ErrorAction SilentlyContinue
  if ($direct) { return $ExeName }

  $candidates = @(
    "C:\Program Files\PostgreSQL\*\bin\$ExeName",
    "C:\Program Files (x86)\PostgreSQL\*\bin\$ExeName"
  )

  foreach ($pattern in $candidates) {
    $match = Get-ChildItem -Path $pattern -File -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($match) { return $match.FullName }
  }

  throw "Commande introuvable: $ExeName. Installez les outils client PostgreSQL (pg_dump, pg_restore, psql)."
}

function Resolve-DevDbUrl {
  param([string]$InputDevDbUrl)

  if (-not [string]::IsNullOrWhiteSpace($InputDevDbUrl)) {
    return $InputDevDbUrl
  }

  $configPath = Join-Path (Get-Location) 'supabase\config.toml'
  if (Test-Path $configPath) {
    $config = Get-Content -Path $configPath -Raw
    $dbSection = [regex]::Match($config, '(?ms)^\[db\](.*?)^\[')
    $sectionText = if ($dbSection.Success) { $dbSection.Groups[1].Value } else { $config }
    $portMatch = [regex]::Match($sectionText, '(?m)^\s*port\s*=\s*(\d+)\s*$')
    if ($portMatch.Success) {
      $port = $portMatch.Groups[1].Value
      return "postgresql://postgres:postgres@127.0.0.1:$port/postgres"
    }
  }

  return 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
}

function Resolve-ProdProjectRef {
  param(
    [string]$InputRef,
    [hashtable]$EnvVars
  )

  if (-not [string]::IsNullOrWhiteSpace($InputRef)) {
    return $InputRef.Trim()
  }

  if ($EnvVars.ContainsKey('SUPABASE_PROJECT_REF') -and $EnvVars['SUPABASE_PROJECT_REF']) {
    return $EnvVars['SUPABASE_PROJECT_REF'].Trim()
  }

  $url = $EnvVars['SUPABASE_URL']
  if ($url -match 'https://([a-z0-9]+)\.supabase\.co') {
    return $Matches[1]
  }

  throw 'Project ref prod introuvable. Définissez SUPABASE_URL ou SUPABASE_PROJECT_REF dans .env.production, ou passez -ProdProjectRef.'
}

function Build-ProdDbUrl {
  param(
    [string]$ProjectRef,
    [string]$Password
  )

  if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    throw 'ProdProjectRef est requis.'
  }
  if ([string]::IsNullOrWhiteSpace($Password)) {
    throw 'Mot de passe DB prod manquant. Ajoutez SUPABASE_DB_PASSWORD dans .env.production (Dashboard Supabase → Database).'
  }

  $encoded = Encode-DbPassword -Password $Password
  return "postgresql://postgres:${encoded}@db.$ProjectRef.supabase.co:5432/postgres?sslmode=require"
}

function Resolve-ProdDbUrl {
  param(
    [string]$InputProdDbUrl,
    [string]$InputProjectRef,
    [hashtable]$EnvVars
  )

  if (-not [string]::IsNullOrWhiteSpace($InputProdDbUrl)) {
    return $InputProdDbUrl
  }

  if ($EnvVars.ContainsKey('SUPABASE_DB_URL') -and $EnvVars['SUPABASE_DB_URL']) {
    return $EnvVars['SUPABASE_DB_URL'].Trim()
  }

  if ($EnvVars.ContainsKey('DATABASE_URL') -and $EnvVars['DATABASE_URL']) {
    return $EnvVars['DATABASE_URL'].Trim()
  }

  $projectRef = Resolve-ProdProjectRef -InputRef $InputProjectRef -EnvVars $EnvVars
  $password = $EnvVars['SUPABASE_DB_PASSWORD']
  if ([string]::IsNullOrWhiteSpace($password)) {
    $securePwd = Read-Host 'Mot de passe postgres prod (Dashboard Supabase → Database)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd)
    try {
      $password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }

  return Build-ProdDbUrl -ProjectRef $projectRef -Password $password
}

function Invoke-PgCommand {
  param(
    [string]$Exe,
    [string[]]$Arguments,
    [string]$FailureMessage
  )

  $output = & $Exe @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    if ($output) { $output | ForEach-Object { Write-Host $_ } }
    throw $FailureMessage
  }
  return $output
}

function Export-DevDatabase {
  param(
    [string]$PgDump,
    [string]$DevUrl,
    [string]$OutFile
  )

  Write-Step 'Export DEV → dump' 'Cyan'
  $outDir = Split-Path -Parent $OutFile
  if (-not (Test-Path $outDir)) {
    New-Item -Path $outDir -ItemType Directory | Out-Null
  }

  Invoke-PgCommand -Exe $PgDump -Arguments @(
    "--dbname=$DevUrl",
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--schema=public',
    "--file=$OutFile"
  ) -FailureMessage 'Échec de l''export dev.'

  Write-Host "Dump dev : $OutFile" -ForegroundColor Green
  return $OutFile
}

function Backup-ProdDatabase {
  param(
    [string]$PgDump,
    [string]$ProdUrl,
    [string]$OutFile
  )

  Write-Step 'Backup PROD (avant import)' 'Yellow'
  Invoke-PgCommand -Exe $PgDump -Arguments @(
    "--dbname=$ProdUrl",
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--schema=public',
    "--file=$OutFile"
  ) -FailureMessage 'Échec du backup prod.'

  Write-Host "Backup prod : $OutFile" -ForegroundColor Green
  return $OutFile
}

function Clear-ProdPublicSchema {
  param(
    [string]$Psql,
    [string]$ProdUrl
  )

  Write-Step 'Vidage du schéma public en PROD (DROP + CREATE)' 'Yellow'
  Invoke-PgCommand -Exe $Psql -Arguments @(
    "--dbname=$ProdUrl",
    '-v', 'ON_ERROR_STOP=1',
    '-c', 'drop schema if exists public cascade; create schema public;'
  ) -FailureMessage 'Échec du vidage du schéma public en prod.'
}

function Import-DumpToProd {
  param(
    [string]$PgRestore,
    [string]$ProdUrl,
    [string]$DumpPath
  )

  if (-not (Test-Path $DumpPath)) {
    throw "Fichier dump introuvable : $DumpPath"
  }

  Write-Step "Import dump → PROD ($DumpPath)" 'Cyan'
  Invoke-PgCommand -Exe $PgRestore -Arguments @(
    '--no-owner',
    '--no-privileges',
    '--schema=public',
    "--dbname=$ProdUrl",
    $DumpPath
  ) -FailureMessage 'Échec de l''import en prod.'
}

function Restore-PublicGrants {
  param(
    [string]$Psql,
    [string]$ProdUrl
  )

  $grantsFile = Join-Path (Get-Location) 'supabase\snippets\fix_public_schema_grants.sql'
  if (-not (Test-Path $grantsFile)) {
    throw "Fichier introuvable : $grantsFile"
  }

  Write-Step 'Réapplication des droits Supabase (public)' 'Cyan'
  Invoke-PgCommand -Exe $Psql -Arguments @(
    "--dbname=$ProdUrl",
    '-v', 'ON_ERROR_STOP=1',
    '-f', $grantsFile
  ) -FailureMessage 'Échec de la réapplication des droits Supabase.'
}

function Confirm-Destructive {
  param([string]$ProdUrl)

  Write-Host ''
  Write-Host 'Cible PROD :' -ForegroundColor Yellow
  Write-Host "  $ProdUrl"
  Write-Host ''
  Write-Host 'ATTENTION : l''import vide public en prod et écrase les données métier.' -ForegroundColor Red

  if ($Force) { return }

  $confirm = Read-Host 'Tapez OUI pour continuer'
  if ($confirm -ne 'OUI') {
    throw 'Opération annulée.'
  }
}

try {
  $repoRoot = (Get-Location).Path
  if (-not (Test-Path (Join-Path $repoRoot 'supabase\config.toml'))) {
    throw 'Exécutez ce script depuis la racine du projet AnimaBoard.'
  }

  $pgDump = Resolve-PgTool -ExeName 'pg_dump.exe'
  $pgRestore = Resolve-PgTool -ExeName 'pg_restore.exe'
  $psql = Resolve-PgTool -ExeName 'psql.exe'

  $envVars = Read-DotEnvFile -Path (Join-Path $repoRoot ($EnvFile -replace '^\.\\', ''))
  $devUrl = Resolve-DevDbUrl -InputDevDbUrl $DevDbUrl

  if (-not (Test-Path $OutputDir)) {
    New-Item -Path $OutputDir -ItemType Directory | Out-Null
  }

  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'

  if ($Action -eq 'Export' -or $Action -eq 'Clone') {
    Write-Host 'Source DEV :' -ForegroundColor Cyan
    Write-Host "  $devUrl"

    if ([string]::IsNullOrWhiteSpace($DumpFile)) {
      $DumpFile = Join-Path $OutputDir "dev-export-$timestamp.dump"
    }

    Export-DevDatabase -PgDump $pgDump -DevUrl $devUrl -OutFile $DumpFile | Out-Null
  }

  if ($Action -eq 'Import' -or $Action -eq 'Clone') {
    if ([string]::IsNullOrWhiteSpace($DumpFile)) {
      throw 'Import/Clone : précisez -DumpFile ou lancez Clone (export + import).'
    }

    $prodUrl = Resolve-ProdDbUrl -InputProdDbUrl $ProdDbUrl -InputProjectRef $ProdProjectRef -EnvVars $envVars
    Confirm-Destructive -ProdUrl $prodUrl

    if (-not $SkipProdBackup) {
      $prodBackup = Join-Path $OutputDir "prod-backup-before-import-$timestamp.dump"
      Backup-ProdDatabase -PgDump $pgDump -ProdUrl $prodUrl -OutFile $prodBackup | Out-Null
    }

    Clear-ProdPublicSchema -Psql $psql -ProdUrl $prodUrl
    Import-DumpToProd -PgRestore $pgRestore -ProdUrl $prodUrl -DumpPath $DumpFile
    Restore-PublicGrants -Psql $psql -ProdUrl $prodUrl

    Write-Host ''
    Write-Host 'Import terminé avec succès.' -ForegroundColor Green
    if (-not $SkipProdBackup) {
      Write-Host "Backup prod conservé dans $OutputDir" -ForegroundColor Green
    }
  }

  if ($Action -eq 'Export') {
    Write-Host ''
    Write-Host 'Export terminé.' -ForegroundColor Green
    Write-Host "Pour importer en prod : .\scripts\supabase-dev-to-prod.ps1 -Action Import -DumpFile `"$DumpFile`""
  }

  if ($Action -eq 'Clone') {
    Write-Host ''
    Write-Host 'Clone dev → prod terminé.' -ForegroundColor Green
  }

  exit 0
}
catch {
  Write-Error $_
  exit 1
}

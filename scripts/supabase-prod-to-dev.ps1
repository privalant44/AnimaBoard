<#
.SYNOPSIS
  Clone de la base Supabase PRODUCTION vers la base Supabase DEV (locale).

.DESCRIPTION
  Utilise `pg_dump` / `pg_restore` sur le schéma `public` uniquement (données + politiques RLS).
  Le schéma public en DEV est écrasé (DROP + CREATE + restore).

  Implémentation basée sur `scripts\supabase-dev-to-prod.ps1` en inversant les rôles :
    - source (DEV) => Production
    - cible (PROD) => Dev locale

.PARAMETER Action
  Export : dump PROD -> fichier
  Import : restore fichier -> DEV locale
  Clone  : Export + Import

.PARAMETER EnvFile
  Fichier contenant les variables de prod (par ex. `.env.production` à la racine).

.EXAMPLE
  .\scripts\supabase-prod-to-dev.ps1 -Action Clone -OutputDir .\backups -Force

.EXAMPLE
  .\scripts\supabase-prod-to-dev.ps1 -Action Export -OutputDir .\backups
  .\scripts\supabase-prod-to-dev.ps1 -Action Import -DumpFile .\backups\prod-export-20260720-120000.dump -Force
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
  # Quand Clone/Import : permet d'ignorer la sauvegarde de l'état courant de DEV avant écrasement.
  [switch] $SkipDevBackup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

function Write-ErrorWithContext {
  param([string] $Message)
  throw $Message
}

function Read-DotEnvFile {
  param([string] $Path)
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
  param([string] $Password)
  return [uri]::EscapeDataString($Password)
}

function Resolve-DevDbUrl {
  param([string] $InputDevDbUrl)

  if (-not [string]::IsNullOrWhiteSpace($InputDevDbUrl)) {
    return $InputDevDbUrl.Trim()
  }

  $configPath = Join-Path $repoRoot 'supabase\config.toml'
  if (-not (Test-Path $configPath)) {
    throw "Impossible de trouver `supabase\config.toml`. Exécute ce script depuis la racine du repo."
  }

  $config = Get-Content -Path $configPath -Raw
  $dbSection = [regex]::Match($config, '(?ms)^\[db\](.*?)^\[')
  $sectionText = if ($dbSection.Success) { $dbSection.Groups[1].Value } else { $config }

  $portMatch = [regex]::Match($sectionText, '(?m)^\s*port\s*=\s*(\d+)\s*$')
  if ($portMatch.Success) {
    $port = $portMatch.Groups[1].Value
    return "postgresql://postgres:postgres@127.0.0.1:$port/postgres"
  }

  # Fallback (valeur par défaut dans ce repo)
  return 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
}

function Resolve-ProdProjectRef {
  param(
    [string] $InputProjectRef,
    [hashtable] $EnvVars
  )

  if (-not [string]::IsNullOrWhiteSpace($InputProjectRef)) {
    return $InputProjectRef.Trim()
  }

  if ($EnvVars.ContainsKey('SUPABASE_PROJECT_REF') -and $EnvVars['SUPABASE_PROJECT_REF']) {
    return $EnvVars['SUPABASE_PROJECT_REF'].Trim()
  }

  if (-not $EnvVars.ContainsKey('SUPABASE_URL') -or [string]::IsNullOrWhiteSpace($EnvVars['SUPABASE_URL'])) {
    throw 'Project ref prod introuvable : ajoute SUPABASE_URL ou SUPABASE_PROJECT_REF dans le .env prod.'
  }

  $url = $EnvVars['SUPABASE_URL']
  if ($url -match 'https://([a-z0-9-]+)\.supabase\.co') {
    return $Matches[1]
  }

  throw 'Impossible d''extraire le project ref depuis SUPABASE_URL.'
}

function Build-ProdDbUrl {
  param(
    [string] $ProjectRef,
    [string] $Password
  )

  if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    throw 'ProdProjectRef est requis.'
  }
  if ([string]::IsNullOrWhiteSpace($Password)) {
    throw 'Mot de passe DB prod manquant (SUPABASE_DB_PASSWORD).'
  }

  $encoded = Encode-DbPassword -Password $Password
  return "postgresql://postgres:${encoded}@db.$ProjectRef.supabase.co:5432/postgres?sslmode=require"
}

function Resolve-ProdDbUrl {
  param(
    [string] $InputProdDbUrl,
    [string] $InputProjectRef,
    [hashtable] $EnvVars
  )

  if (-not [string]::IsNullOrWhiteSpace($InputProdDbUrl)) {
    return $InputProdDbUrl.Trim()
  }

  if ($EnvVars.ContainsKey('SUPABASE_DB_URL') -and $EnvVars['SUPABASE_DB_URL']) {
    return $EnvVars['SUPABASE_DB_URL'].Trim()
  }

  if ($EnvVars.ContainsKey('DATABASE_URL') -and $EnvVars['DATABASE_URL']) {
    return $EnvVars['DATABASE_URL'].Trim()
  }

  $projectRef = Resolve-ProdProjectRef -InputProjectRef $InputProjectRef -EnvVars $EnvVars

  $password = $EnvVars['SUPABASE_DB_PASSWORD']
  if ([string]::IsNullOrWhiteSpace($password)) {
    $securePwd = Read-Host 'Mot de passe postgres prod (Dashboard Supabase -> Database)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd)
    try {
      $password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }

  return Build-ProdDbUrl -ProjectRef $projectRef -Password $password
}

if (-not (Test-Path (Join-Path $repoRoot 'supabase\config.toml'))) {
  throw "Exécute ce script depuis la racine du projet AnimaBoard (répertoire contenant `supabase\config.toml`)."
}

Push-Location $repoRoot
try {
  if (-not (Test-Path (Join-Path $repoRoot 'scripts\supabase-dev-to-prod.ps1'))) {
    throw "Script source manquant : scripts\supabase-dev-to-prod.ps1"
  }

  $envPath = Join-Path $repoRoot ($EnvFile -replace '^\.\\', '')
  $envVars = Read-DotEnvFile -Path $envPath

  $devUrl = Resolve-DevDbUrl -InputDevDbUrl $DevDbUrl
  $prodUrl = Resolve-ProdDbUrl -InputProdDbUrl $ProdDbUrl -InputProjectRef $ProdProjectRef -EnvVars $envVars

  Write-Host ''
  Write-Host 'Source PROD  :' -ForegroundColor Cyan
  Write-Host "  $prodUrl"
  Write-Host 'Cible DEV   :' -ForegroundColor Cyan
  Write-Host "  $devUrl"

  $params = @{
    Action         = $Action
    DevDbUrl       = $prodUrl   # en inversant les rôles : la "DEV" du script source = prod
    ProdDbUrl      = $devUrl    # la "PROD" du script source = dev locale
    ProdProjectRef = $ProdProjectRef
    OutputDir      = $OutputDir
    EnvFile        = $EnvFile
  }

  if (-not [string]::IsNullOrWhiteSpace($DumpFile)) {
    $params.DumpFile = $DumpFile
  }

  if ($Force) { $params.Force = $true }
  if ($SkipDevBackup) { $params.SkipProdBackup = $true }

  & (Join-Path $scriptDir 'supabase-dev-to-prod.ps1') @params
}
finally {
  Pop-Location
}


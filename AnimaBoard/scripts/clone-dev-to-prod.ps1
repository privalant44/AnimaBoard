<#
  Alias rétrocompatible — voir supabase-dev-to-prod.ps1
#>
param(
  [string] $DevDbUrl = '',
  [string] $ProdProjectRef = '',
  [string] $ProdDbUrl = '',
  [string] $OutputDir = '.\backups',
  [switch] $Force
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$params = @{
  Action          = 'Clone'
  DevDbUrl        = $DevDbUrl
  ProdProjectRef  = $ProdProjectRef
  ProdDbUrl       = $ProdDbUrl
  OutputDir       = $OutputDir
}
if ($Force) { $params.Force = $true }

& (Join-Path $scriptDir 'supabase-dev-to-prod.ps1') @params

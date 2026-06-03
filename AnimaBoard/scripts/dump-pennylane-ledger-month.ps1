<#
  Export / visualisation des lignes d'écritures Pennylane pour un mois (GET /ledger_entry_lines, filtre date).
  Par défaut : toutes les lignes du mois, sans agrégation (synthèses seulement avec -WithSummary).

  Exemples (depuis la racine du projet AnimaBoard) :
    .\scripts\dump-pennylane-ledger-month.ps1 -Year 2026 -Month 1
    .\scripts\dump-pennylane-ledger-month.ps1 2026 1
    .\scripts\dump-pennylane-ledger-month.ps1                              # mois courant
    .\scripts\dump-pennylane-ledger-month.ps1 -PlOnly -Year 2026 -Month 1  # seulement lignes P&L (6/7)
    .\scripts\dump-pennylane-ledger-month.ps1 -WithSummary -Year 2026 -Month 1  # + synthèses P&L / par compte

  Sorties :
    - Liste des pièces (TSV, regroupement des lignes) : id pièce, date, statut, n° pièce / facture, journal, nb lignes
    - Détail (TSV) : id ligne Pennylane, id pièce, compte, débit/crédit ; impacts P&L si -PlOnly ou -WithSummary
  -Json  : JSON (mêmes règles : agrégats seulement avec -WithSummary)
#>

param(
  [int] $Year = 0,
  [int] $Month = 0,
  [switch] $PlOnly,
  [switch] $WithSummary,
  [string] $Json = ""
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Set-Location $root

if ($Year -eq 0 -and $Month -eq 0 -and $args.Count -ge 2) {
  $Year = [int]$args[0]
  $Month = [int]$args[1]
}
$now = Get-Date
if ($Year -eq 0) { $Year = $now.Year }
if ($Month -eq 0) { $Month = $now.Month }

$argsNode = @(
  (Join-Path $root "scripts\dump-pennylane-ledger-month.js"),
  "$Year",
  "$Month"
)
if ($PlOnly) { $argsNode += "--pl-only" }
if ($WithSummary) { $argsNode += "--with-summary" }
if ($Json -ne "") { $argsNode += "--json=$Json" }

Write-Host "Pennylane : export $Year-$([string]::Format('{0:D2}', $Month)) (détail sans agrégation ; -WithSummary pour synthèses)" -ForegroundColor Cyan
& node @argsNode
exit $LASTEXITCODE

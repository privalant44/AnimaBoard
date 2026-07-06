# Script PowerShell pour configurer les variables d'environnement
# Ce script vous aide à créer le fichier .env

Write-Host "=== Configuration des API pour Anima Board ===" -ForegroundColor Cyan
Write-Host ""

# Vérifier si .env existe déjà
if (Test-Path .env) {
    $overwrite = Read-Host "Le fichier .env existe déjà. Voulez-vous le remplacer ? (o/n)"
    if ($overwrite -ne "o" -and $overwrite -ne "O") {
        Write-Host "Configuration annulée." -ForegroundColor Yellow
        exit
    }
}

Write-Host "Configuration BoondManager:" -ForegroundColor Green
$boondUrl = Read-Host "URL de l'API BoondManager (par défaut: https://api.boondmanager.com)"
if ([string]::IsNullOrWhiteSpace($boondUrl)) {
    $boondUrl = "https://api.boondmanager.com"
}

$boondKey = Read-Host "Clé API BoondManager (API Key)"
$boondSecret = Read-Host "Secret API BoondManager (API Secret)" -AsSecureString
$boondSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($boondSecret)
)

Write-Host ""
Write-Host "Configuration Pennylane:" -ForegroundColor Green
$pennyUrl = Read-Host "URL de l'API Pennylane (par défaut: https://api.pennylane.io)"
if ([string]::IsNullOrWhiteSpace($pennyUrl)) {
    $pennyUrl = "https://api.pennylane.io"
}

$pennyKey = Read-Host "Token API Pennylane" -AsSecureString
$pennyKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pennyKey)
)

# Créer le contenu du fichier .env
$envContent = @"
# Port du serveur
PORT=3000

# BoondManager API
BOONDMANAGER_API_URL=$boondUrl
BOONDMANAGER_API_KEY=$boondKey
BOONDMANAGER_API_SECRET=$boondSecretPlain

# Pennylane API
PENNYLANE_API_URL=$pennyUrl
PENNYLANE_API_KEY=$pennyKeyPlain

# Environnement
NODE_ENV=development
"@

# Écrire le fichier .env
$envContent | Out-File -FilePath .env -Encoding utf8 -NoNewline

Write-Host ""
Write-Host "✅ Fichier .env créé avec succès !" -ForegroundColor Green
Write-Host ""
Write-Host "Vous pouvez maintenant tester la connexion avec:" -ForegroundColor Cyan
Write-Host "  GET http://localhost:3000/api/boondmanager/test" -ForegroundColor Yellow
Write-Host "  GET http://localhost:3000/api/test" -ForegroundColor Yellow
Write-Host ""
Write-Host "N'oubliez pas de redémarrer le serveur après la configuration !" -ForegroundColor Yellow

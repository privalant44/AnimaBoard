# Script PowerShell pour lancer le serveur et le client en parallèle
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Démarrage du serveur et du client depuis: $scriptPath" -ForegroundColor Green

# Lancer le serveur en arrière-plan
$serverArgs = "-NoExit", "-Command", "cd '$scriptPath'; npm run server"
Start-Process powershell -ArgumentList $serverArgs -WindowStyle Normal

# Attendre un peu pour que le serveur démarre
Start-Sleep -Seconds 3

# Lancer le client en arrière-plan (port 3001 pour éviter le conflit avec le serveur 3000)
$clientArgs = "-NoExit", "-Command", "cd '$scriptPath\client'; `$env:PORT=3001; npm start"
Start-Process powershell -ArgumentList $clientArgs -WindowStyle Normal

Write-Host "Serveur et client lancés dans des fenêtres séparées." -ForegroundColor Green
Write-Host "Pour arrêter, fermez les fenêtres PowerShell ou utilisez: Get-Process node | Stop-Process" -ForegroundColor Yellow

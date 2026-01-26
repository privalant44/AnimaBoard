# Guide de déploiement sur Railway

## Étapes pour déployer AnimaBoard sur Railway

### 1. Prérequis
- Un compte GitHub avec votre dépôt AnimaBoard
- Un compte Railway (gratuit) : https://railway.app

### 2. Créer un projet sur Railway

1. Allez sur https://railway.app
2. Cliquez sur "Login" et connectez-vous avec GitHub
3. Cliquez sur "New Project"
4. Sélectionnez "Deploy from GitHub repo"
5. Choisissez votre dépôt `AnimaBoard`

### 3. Configurer les variables d'environnement

Dans les paramètres du projet Railway, ajoutez les variables suivantes :

**Variables requises :**
- `NODE_ENV` = `production`
- `BOOND_EMAIL` = votre email BoondManager
- `BOOND_PASSWORD` = votre mot de passe BoondManager
- `BOOND_API_URL` = `https://ui.boondmanager.com/api` (optionnel, valeur par défaut)

**Variables optionnelles :**
- `PORT` = Railway définit automatiquement cette variable, ne pas la modifier

### 4. Déploiement automatique

Railway va automatiquement :
1. Détecter que c'est un projet Node.js
2. Installer les dépendances (`npm install`)
3. Installer les dépendances du client (`cd client && npm install`)
4. Builder le client React (`npm run build`)
5. Démarrer le serveur (`npm start`)

### 5. Accéder à votre application

Une fois déployé, Railway vous fournira une URL du type :
`https://votre-app.railway.app`

### 6. Vérifier le déploiement

- Vérifiez les logs dans Railway pour voir si tout s'est bien passé
- Testez l'endpoint de santé : `https://votre-app.railway.app/api/health`
- Accédez à l'application : `https://votre-app.railway.app`

## Notes importantes

- **Données persistantes** : Les fichiers JSON dans le dossier `data/` seront perdus à chaque redéploiement. Pour la persistance, considérez :
  - Utiliser Railway PostgreSQL (add-on)
  - Utiliser un service de stockage externe (S3, etc.)
  - Synchroniser les données depuis BoondManager régulièrement

- **Synchronisation des données** : Les scripts de synchronisation (`sync.js`, `sync_timesheets.js`) peuvent être exécutés manuellement via Railway CLI ou en créant un service séparé.

- **Build time** : Le premier build peut prendre quelques minutes (installation des dépendances + build React)

## Commandes Railway CLI (optionnel)

Si vous installez Railway CLI, vous pouvez :
```bash
railway login
railway link
railway up
railway logs
```

## Support

En cas de problème, vérifiez :
1. Les logs dans Railway Dashboard
2. Que toutes les variables d'environnement sont définies
3. Que le build s'est terminé sans erreur

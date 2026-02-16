# Guide de déploiement sur Vercel

## Étapes pour déployer AnimaBoard sur Vercel

### 1. Prérequis
- Un compte GitHub avec votre dépôt AnimaBoard
- Un compte Vercel (gratuit) : https://vercel.com

### 2. Créer un projet sur Vercel

1. Allez sur https://vercel.com
2. Cliquez sur "Login" et connectez-vous avec GitHub
3. Cliquez sur "Add New Project"
4. Importez votre dépôt (celui qui contient AnimaBoard)
5. **Si l’app est dans un sous-dossier** (ex. `AnimaBoard/`) : dans **Settings → General**, définir **Root Directory** sur `AnimaBoard` (ou le chemin du dossier contenant `package.json`, `api/`, `client/`). Sans cela, les API (sync, etc.) peuvent renvoyer une erreur 500 / FUNCTION_INVOCATION_FAILED.
6. Vercel détectera automatiquement la configuration

### 3. Configurer les variables d'environnement

Dans les paramètres du projet Vercel, ajoutez les variables suivantes :

**Variables requises :**
- `BOOND_EMAIL` = votre email BoondManager
- `BOOND_PASSWORD` = votre mot de passe BoondManager
- `BOOND_API_URL` = `https://ui.boondmanager.com/api` (optionnel, valeur par défaut)

**Variables optionnelles :**
- `NODE_ENV` = `production` (défini automatiquement par Vercel)

### 4. Configuration Vercel KV (pour les métadonnées)

Pour la persistance des métadonnées des ressources (temps, statut feu, commentaires) et des forecast times :

1. Dans votre projet Vercel, allez dans **"Storage"** (menu de gauche)
2. Cliquez sur **"Create Database"**
3. Sélectionnez **"KV"** (Redis)
4. Donnez un nom à votre base (ex: `anima-board-kv`)
5. Choisissez la région la plus proche
6. Cliquez sur **"Create"**
7. Les variables d'environnement seront automatiquement ajoutées :
   - `KV_URL`
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `KV_REST_API_READ_ONLY_TOKEN`

**Note :** Si Vercel KV n'est pas configuré, les données utiliseront un cache en mémoire (perdu entre les redéploiements).

**Migration des données :** Après avoir créé la base KV, vous pouvez migrer vos données JSON existantes :
```bash
npm run migrate-to-kv
```

**Vérification :** Pour tester la connexion à Vercel KV :
```bash
npm run test-kv
```

Voir `VERCEL_KV_SETUP.md` pour plus de détails.

### 5. Déploiement automatique

Vercel va automatiquement :
1. Détecter que c'est un projet React
2. Installer les dépendances (`npm install` dans root et client)
3. Builder le client React (`cd client && npm run build`)
4. Déployer les serverless functions dans `/api`

### 6. Accéder à votre application

Une fois déployé, Vercel vous fournira une URL du type :
`https://votre-app.vercel.app`

### 7. Vérifier le déploiement

- Vérifiez les logs dans Vercel pour voir si tout s'est bien passé
- Testez l'endpoint de santé : `https://votre-app.vercel.app/api/health`
- Accédez à l'application : `https://votre-app.vercel.app`

## Architecture Vercel

### Frontend
- **Dossier** : `client/`
- **Build** : Automatique via `vercel.json`
- **Output** : `client/build/`

### Backend (Serverless Functions)
- **Dossier** : `api/`
- **Routes** :
  - `/api/health` → `api/health.js`
  - `/api/data/resources` → `api/data/resources.js`
  - `/api/data/deliveries` → `api/data/deliveries.js`
  - `/api/data/timesheets_aggregate` → `api/data/timesheets_aggregate.js`
  - `/api/data/forecast-times` → `api/data/forecast-times.js`
  - `/api/data/resources-metadata` → `api/data/resources-metadata.js`
  - `/api/boondmanager/resources` → `api/boondmanager/resources.js`

## Différences avec le déploiement local

### Données synchronisées à la volée
Sur Vercel, les données ne sont **pas** stockées dans des fichiers JSON car Vercel est serverless et stateless. À la place :

- **Ressources** : Synchronisées depuis BoondManager à chaque requête (avec cache de 5 minutes)
- **Prestations (Deliveries)** : Synchronisées depuis BoondManager à chaque requête (avec cache de 5 minutes)
- **Timesheets** : Synchronisées depuis BoondManager à chaque requête (avec cache de 5 minutes)
- **Métadonnées des ressources** : Stockées dans Vercel KV (persistant) ou cache mémoire (temporaire)

### Performance
- Le cache en mémoire réduit les appels API (TTL de 5 minutes)
- Les données sont fraîches mais peuvent être légèrement plus lentes au premier chargement
- Pour améliorer les performances, considérez :
  - Augmenter le TTL du cache
  - Utiliser Vercel KV pour mettre en cache les données synchronisées
  - Utiliser ISR (Incremental Static Regeneration) si applicable

## Commandes Vercel CLI (optionnel)

Si vous installez Vercel CLI, vous pouvez :
```bash
npm i -g vercel
vercel login
vercel
vercel env add BOOND_EMAIL
vercel env add BOOND_PASSWORD
```

## Dépannage : 404 NOT_FOUND

Si vous voyez `404: NOT_FOUND` (Code: NOT_FOUND) en ouvrant l’URL du projet :

1. **Root Directory (priorité si 404 sur la page ET l’API)**  
   Si votre dépôt est **Code** avec le dossier **AnimaBoard** dedans : Vercel → **Settings** → **General** → **Root Directory** → **Edit** → indiquer **`AnimaBoard`** (sans slash), sauvegarder, puis **Redeploy**. Sinon Vercel build depuis la mauvaise racine et tout renvoie 404.

2. **Build**  
   Dans Vercel → Deployments → dernier déploiement → **Building** : vérifier qu’il n’y a pas d’erreur. Si le build échoue, `client/build` n’existe pas et toutes les URLs renvoient 404.

3. **URL testée**  
   - Page d’accueil : `https://votre-app.vercel.app/` (avec ou sans slash).  
   - API : `https://votre-app.vercel.app/api/health` (doit retourner du JSON).

4. **Redéploiement**  
   Après une modification de `vercel.json` ou de la Root Directory, faire un nouveau déploiement (nouveau commit + push, ou “Redeploy” dans Vercel).

## Support

En cas de problème, vérifiez :
1. Les logs dans Vercel Dashboard
2. Que toutes les variables d'environnement sont définies
3. Que le build s'est terminé sans erreur
4. Que les serverless functions sont bien déployées dans `/api`

# Changements pour le déploiement Vercel

## Fichiers supprimés (Railway)
- ✅ `railway.json`
- ✅ `railpack.json`
- ✅ `nixpacks.toml`
- ✅ `.railwayignore`
- ✅ `RAILWAY_DEPLOY.md`

## Fichiers créés (Vercel)

### Configuration
- ✅ `vercel.json` - Configuration Vercel
- ✅ `VERCEL_DEPLOY.md` - Guide de déploiement

### Serverless Functions
- ✅ `api/health.js` - Health check
- ✅ `api/data/resources.js` - Synchronise les ressources depuis BoondManager
- ✅ `api/data/deliveries.js` - Synchronise les prestations depuis BoondManager
- ✅ `api/data/timesheets_aggregate.js` - Synchronise et agrège les timesheets
- ✅ `api/data/forecast-times.js` - Gère les temps prévisionnels (avec Vercel KV)
- ✅ `api/data/resources-metadata.js` - Gère les métadonnées des ressources (avec Vercel KV)
- ✅ `api/boondmanager/resources.js` - Proxy vers BoondManager pour les ressources

### Services
- ✅ `lib/dataSyncService.js` - Service de synchronisation avec cache

## Changements majeurs

### 1. Données synchronisées à la volée
**Avant** : Les données étaient lues depuis des fichiers JSON dans `data/`
**Maintenant** : Les données sont synchronisées depuis BoondManager à chaque requête avec un cache de 5 minutes

### 2. Persistance des métadonnées
**Avant** : Fichier `data/resources_metadata.json`
**Maintenant** : Vercel KV (Redis) pour la persistance, avec fallback sur cache mémoire

### 3. Forecast Times
**Avant** : Fichier `data/forecast-times.json`
**Maintenant** : Vercel KV avec fallback sur cache mémoire

## Variables d'environnement requises sur Vercel

### Obligatoires
- `BOOND_EMAIL` - Email BoondManager
- `BOOND_PASSWORD` - Mot de passe BoondManager

### Optionnelles
- `BOOND_API_URL` - URL de l'API (défaut: `https://ui.boondmanager.com/api`)

### Vercel KV (pour la persistance)
Si vous créez une base Vercel KV, ces variables seront ajoutées automatiquement :
- `KV_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`

## Performance

- **Cache en mémoire** : TTL de 5 minutes pour réduire les appels API
- **Synchronisation** : Les données sont fraîches mais peuvent être plus lentes au premier chargement
- **Optimisation future** : Utiliser Vercel KV pour mettre en cache les données synchronisées

## Notes importantes

1. **Les fichiers JSON dans `data/` ne sont plus utilisés** en production sur Vercel
2. **Les scripts de synchronisation** (`sync.js`, `sync_timesheets.js`) peuvent toujours être exécutés localement
3. **Les métadonnées des ressources** nécessitent Vercel KV pour la persistance en production

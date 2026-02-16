# Guide de configuration Redis (Upstash) pour Vercel

## Qu'est-ce que Upstash Redis ?

Upstash Redis est un service de stockage clé-valeur basé sur Redis, serverless et compatible avec Vercel. C'est la solution recommandée par Vercel pour remplacer l'ancien Vercel KV (déprécié). Le plan gratuit offre 10 000 commandes/jour.

## ⚠️ Important : Migration depuis Vercel KV

Vercel KV est maintenant **déprécié**. Si vous aviez une base Vercel KV, elle a été migrée automatiquement vers Upstash Redis. Pour les nouveaux projets, utilisez directement Upstash Redis.

## Étape 1 : Installer l'intégration Upstash Redis

### Via le Dashboard Vercel

1. **Connectez-vous à Vercel**
   - Allez sur https://vercel.com
   - Connectez-vous avec votre compte GitHub

2. **Accédez à votre projet**
   - Sélectionnez votre projet `AnimaBoard` dans le dashboard

3. **Installez l'intégration Upstash**
   - Dans le menu de gauche, cliquez sur **"Integrations"** (ou **"Storage"**)
   - Cherchez **"Upstash"** dans le marketplace
   - Cliquez sur **"Add Integration"** ou **"Install"**
   - Choisissez une option :
     - **"Create New Upstash Account"** - Vercel gère votre compte Upstash
     - **"Link Existing Upstash Account"** - Connecter un compte existant
   - Configurez votre base :
     - Nom de la base (ex: `anima-board-redis`)
     - Région (ex: `eu-west-1` pour l'Europe)
     - Type de plan (Free tier disponible)
   - Cliquez sur **"Create"**

4. **Variables d'environnement automatiques**
   - Les variables seront automatiquement ajoutées à votre projet :
     - `UPSTASH_REDIS_REST_URL` - URL de l'API REST
     - `UPSTASH_REDIS_REST_TOKEN` - Token d'authentification

## Étape 2 : Installer le package @upstash/redis

Le package `@upstash/redis` est nécessaire pour utiliser Upstash Redis.

```bash
npm install @upstash/redis
```

**Note :** Le package `@vercel/kv` est toujours installé pour la rétrocompatibilité, mais `@upstash/redis` est utilisé en priorité.

## Étape 3 : Vérifier la configuration

Votre code utilise déjà `lib/kvStorage.js` qui gère automatiquement :
- **Upstash Redis** (priorité, si `UPSTASH_REDIS_REST_URL` est configuré)
- **Vercel KV** (fallback pour rétrocompatibilité)

Il suffit que les variables d'environnement soient configurées.

## Étape 4 : Migrer les données depuis les fichiers JSON

Un script de migration est disponible pour transférer vos données existantes vers Vercel KV.

### Exécuter la migration

```bash
node scripts/migrate-to-kv.js
```

Ce script va :
1. Lire les fichiers JSON locaux (`data/resources_metadata.json`, `data/forecast-times.json`)
2. Les transférer vers Vercel KV
3. Vérifier que la migration a réussi

## Structure des données dans Redis

Les données sont stockées avec ces clés :
- `resources_metadata` - Métadonnées des ressources (temps, statut, commentaires)
- `forecast_times` - Temps prévisionnels par prestation et par mois

## Utilisation dans le code

Votre code utilise déjà `lib/kvStorage.js` qui gère automatiquement :
- La connexion à Vercel KV
- Le fallback sur cache mémoire si KV n'est pas disponible
- La gestion d'erreur

Exemple d'utilisation :
```javascript
const kvStorage = require('./lib/kvStorage');
const { KV_KEYS } = require('./lib/constants');

// Lire
const data = await kvStorage.get(KV_KEYS.RESOURCES_METADATA, {});

// Écrire
await kvStorage.set(KV_KEYS.RESOURCES_METADATA, metadata);
```

## Limites du plan gratuit Upstash

- **Commandes** : 10 000 commandes/jour
- **Stockage** : Illimité (avec limites de performance)
- **Régions** : Multiples régions disponibles
- **Backup** : Automatique

**Note :** Les limites peuvent varier selon le plan choisi. Consultez https://upstash.com/pricing pour plus de détails.

## Vérification

Pour vérifier que Vercel KV fonctionne :

1. **Vérifier les variables d'environnement**
   - Dans Vercel Dashboard → Settings → Environment Variables
   - Pour Upstash : Vérifiez que `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` sont présents
   - Pour Vercel KV (ancien) : `KV_URL`, `KV_REST_API_URL`, etc.

2. **Tester la connexion**
   - Utilisez le script de migration ou testez via l'API

3. **Vérifier les logs**
   - Dans Vercel Dashboard → Deployments → Logs
   - Cherchez les messages de connexion KV

## Dépannage

### Erreur : "KV is not available"
- Vérifiez que les variables d'environnement sont configurées :
  - Pour Upstash : `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`
  - Pour Vercel KV (ancien) : `KV_URL`, `KV_REST_API_URL`, etc.
- Vérifiez que `@upstash/redis` ou `@vercel/kv` est installé
- Le code utilisera automatiquement le cache mémoire en fallback

### Les données ne persistent pas
- Vérifiez que vous utilisez `kvStorage.set()` et non le cache mémoire directement
- Vérifiez que la base KV est bien liée à votre projet

### Migration échoue
- Vérifiez que les fichiers JSON existent dans `data/`
- Vérifiez que les variables d'environnement sont configurées
- Vérifiez les logs pour plus de détails

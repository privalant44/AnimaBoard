# Anima Board — Tableau de bord Anima Néo

Application de pilotage pour Anima Néo : synchronisation **BoondManager** (ressources, prestations, temps, besoins), compte de résultat **Pennylane**, et indicateurs mensuels (CA, marges, TACE, besoins).

## Fonctionnalités

| Écran | Contenu |
|-------|---------|
| **Accueil** | Récap mensuel : CA Anima Néo / sous-traitance, marges, résultat, TACE, besoins (créés, stock, gagnés, perdus, etc.) |
| **Ressources** | Liste des collaborateurs (types, statuts, feu tricolore) |
| **Forecast** | Prévisionnel et temps saisis par prestation |
| **Rapports** | Compte de résultat Pennylane, exports |
| **Paramètres** | Sync manuelle Boond / besoins, logo, tests API |

Les données métier sont stockées dans **Supabase/Postgres** (pas de fichiers JSON locaux).

## Prérequis

- **Node.js 24.x** (voir `package.json` → `engines`)
- **Supabase CLI** pour le dev local : `npx supabase start`
- Comptes API **BoondManager** (Basic Auth) et **Pennylane** (token Bearer)

## Installation rapide

```bash
npm run install-all
cp env.example .env          # ou : .\setup-env.ps1 (Windows)
npx supabase start
npm run dev
```

| Service | URL (dev) |
|---------|-----------|
| Interface React | http://localhost:3001 |
| API Express | http://localhost:3000 |
| Supabase API | http://127.0.0.1:55221 |
| Supabase Studio | http://127.0.0.1:55223 |
| Postgres direct | `127.0.0.1:55222` |

En dev, le client React (port **3001**) proxy les appels `/api/*` vers Express (port **3000**) — voir `client/src/setupProxy.js`.

### Variables d'environnement essentielles (`.env`)

Copier `env.example` vers `.env` et renseigner au minimum :

```env
SUPABASE_URL=http://127.0.0.1:55221
SUPABASE_SERVICE_ROLE_KEY=...    # clé Secret : npx supabase status

BOOND_API_URL=https://ui.boondmanager.com/api
BOOND_EMAIL=votre.email@entreprise.fr
BOOND_PASSWORD=...               # ou BOOND_PASSWORD_ENC + ANIMA_SECRET_KEY

PENNYLANE_API_URL=https://app.pennylane.com/api/external/v2
PENNYLANE_API_KEY=...
```

> Les anciennes variables `BOONDMANAGER_API_KEY` / `BOONDMANAGER_API_SECRET` ne sont plus utilisées.  
> `SUPABASE_URL` doit correspondre exactement au port défini dans `supabase/config.toml` (`[api] port`).

Guide détaillé : [`docs/SYNCHRONISATIONS.md`](docs/SYNCHRONISATIONS.md) · [`docs/CONFIGURATION_ENVIRONNEMENTS.md`](docs/CONFIGURATION_ENVIRONNEMENTS.md)

## Connexion à la base (dev)

```
Navigateur → :3001 (React)
              ↓ proxy /api/*
           :3000 (Express) → lib/supabaseClient.js → Supabase API :55221 → Postgres :55222
```

| Fichier | Rôle |
|---------|------|
| `.env` | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| `scripts/loadRootEnv.js` | Charge `.env` au démarrage serveur / dev |
| `lib/supabaseClient.js` | Client Supabase singleton (`getSupabase()`) |
| `lib/db.js` | Accès aux tables métier |
| `supabase/config.toml` | Ports du stack local Supabase CLI |

## Utilisation

### Développement

```bash
npx supabase start   # si pas déjà lancé
npm run dev          # serveur 3000 + client 3001
```

Ou séparément : `npm run server` + `npm run client`.

### Production locale (comme Vercel)

```bash
npm run serve      # build + Express sur :3000
```

### Production cloud (Vercel)

Déploiement via Git → variables d'environnement dans Vercel → voir [`docs/VERCEL_DEPLOY.md`](docs/VERCEL_DEPLOY.md).

Vérification après déploiement : `GET /api/health` et `GET /api/env-check`.

## Synchronisations

### Manuelle (UI)

À la connexion (rôles admin/manager) ou via **Paramètres** : ressources, prestations, timesheets (3 mois), besoins (2 mois), compte de résultat Pennylane.

### Scripts npm

| Commande | Action |
|----------|--------|
| `npm run sync` | Ressources Boond |
| `node extract_deliveries.js` | Prestations |
| `npm run sync-timesheets` | Feuilles de temps (args mois optionnels) |
| `npm run sync-timesheets-2years` | Timesheets sur 2 ans |
| `npm run sync-absences` | Absences |
| `npm run init-income-statement` | Init compte de résultat Pennylane |
| `node scripts/init-production.js` | Init complète base cloud |

Pour cibler la prod cloud depuis votre poste : variables dans `.env.production` (voir `env.example` et docs).

### Crons Vercel (automatique en prod)

Configurés dans `vercel.json` (pas d’interface « Ajouter » — déclaration dans le code + redeploy) :

| Job | Chemin | Planning (UTC) | Contenu |
|-----|--------|----------------|---------|
| Journalier | `/api/cron/daily-sync` | `0 4 * * *` | Ressources, prestations, timesheets (3 mois), absences, besoins (2 mois), Pennylane |
| Mensuel | `/api/cron/monthly-sync` | `0 5 1 * *` | Dictionnaire, besoins complets, timesheets (2 ans) |

Après déploiement : Vercel → **Settings → Cron Jobs**.  
Recommandé : définir `CRON_SECRET` dans les variables Vercel (envoyé en `Authorization: Bearer`).

Test manuel :

```powershell
Invoke-RestMethod -Method POST `
  -Uri "https://VOTRE-APP.vercel.app/api/cron/daily-sync" `
  -Headers @{ Authorization = "Bearer VOTRE_CRON_SECRET" }
```

## Structure du projet

```
AnimaBoard/
├── api/                    # Routes serverless Vercel
│   ├── cron/               # daily-sync, monthly-sync
│   ├── dashboard/          # récap accueil, compte de résultat
│   ├── boondmanager/       # sync Boond
│   └── data/               # lectures Supabase
├── server/                 # Backend Express (dev + routes partagées)
│   ├── routes/
│   └── services/
├── client/                 # Frontend React / TypeScript
├── lib/                    # supabaseClient, db, auth, tls
├── supabase/               # migrations, config.toml (ports locaux)
├── scripts/                # dev, init prod, dumps, etc.
└── vercel.json             # build, crons, rewrites
```

## API (aperçu)

| Route | Description |
|-------|-------------|
| `GET /api/health` | Santé API |
| `GET /api/env-check` | Variables configurées + test Supabase |
| `GET /api/dashboard/home-monthly-recap?year=` | Récap mensuel accueil |
| `POST /api/dashboard/income-statement/sync` | Sync compte de résultat Pennylane |
| `POST /api/boondmanager/sync/*` | Sync ressources, prestations, timesheets, besoins, dictionnaire |
| `GET /api/boondmanager/test` | Test connexion Boond |

Authentification optionnelle (Microsoft Entra ID + compte local) : [`docs/AUTH_MICROSOFT.md`](docs/AUTH_MICROSOFT.md).

## Documentation

| Document | Sujet |
|----------|--------|
| [`docs/SYNCHRONISATIONS.md`](docs/SYNCHRONISATIONS.md) | Détail de toutes les syncs (Boond, Pennylane, crons) |
| [`docs/CONFIGURATION_ENVIRONNEMENTS.md`](docs/CONFIGURATION_ENVIRONNEMENTS.md) | Dev, prod locale, prod cloud |
| [`docs/VERCEL_DEPLOY.md`](docs/VERCEL_DEPLOY.md) | Déploiement Vercel |
| [`docs/DATA_STRUCTURES.md`](docs/DATA_STRUCTURES.md) | Schéma des données |
| [`docs/SUPABASE_DEV_TO_PROD.md`](docs/SUPABASE_DEV_TO_PROD.md) | Clone base dev → prod |
| [`env.example`](env.example) | Liste des variables serveur |

## Technologies

- **Backend** : Node.js, Express, fonctions serverless Vercel
- **Frontend** : React, TypeScript
- **Base** : Supabase / PostgreSQL
- **Intégrations** : BoondManager API, Pennylane API v2

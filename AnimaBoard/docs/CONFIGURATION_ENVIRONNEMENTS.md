# Configuration AnimaBoard — récapitulatif par environnement

Ce document décrit la configuration **complète** de l’application selon l’environnement d’exécution.  
Référence canonique des variables : [`env.example`](../env.example) (racine) et [`client/env.example`](../client/env.example).

> **Sécurité** : ne jamais committer `.env`, `.env.production`, ni les clés `service_role` / mots de passe. Ces fichiers sont listés dans `.gitignore`.

**Authentification** : voir [`docs/AUTH_MICROSOFT.md`](AUTH_MICROSOFT.md) — Microsoft Entra ID (`AUTH_ENABLED`, `AZURE_*`, `REACT_APP_*`) et compte local admin (`LOCAL_ADMIN_*`, `LOCAL_AUTH_JWT_SECRET`).

---

## Vue d’ensemble

| Environnement | Commande(s) | Frontend | Backend API | Base de données |
|---------------|-------------|----------|-------------|-----------------|
| **Développement** | `npm run dev` | React CRA, port **3001** | Express, port **3000** | Supabase **local** (`127.0.0.1:55221`) |
| **Production locale** | `npm run serve` ou `npm run build` + `npm run start:prod` | Build statique `client/build` | Express unique, port **3000** | Selon `.env` (souvent local ou cloud) |
| **Production cloud** | Déploiement Vercel | Build statique + CDN | Serverless `api/**/*.js` | Supabase **cloud** |

**Stockage métier** : toutes les données synchronisées (ressources, prestations, timesheets, forecast, etc.) passent par **Supabase/Postgres** via `lib/db.js` et `lib/kvStorage.js`. Il n’y a plus de fichiers JSON locaux ni de dépendance active à Upstash Redis (variables `UPSTASH_*` éventuellement présentes dans un ancien `.env` = **obsolètes**).

---

## Fichiers de configuration

| Fichier | Rôle | Commité ? |
|---------|------|-----------|
| [`env.example`](../env.example) | Modèle des variables **serveur / scripts** | Oui |
| `.env` | Config **dev** courante (racine) | Non |
| `.env.production` | Config pour scripts pointant vers **Supabase cloud** | Non |
| [`client/env.example`](../client/env.example) | Modèle variables **React** (`REACT_APP_*`) | Oui |
| `client/.env.development` | Client en dev (proxy API) | Non (souvent commenté) |
| `client/.env.local` | Surcharge locale CRA (ex. `PORT=3001`) | Non |
| [`supabase/config.toml`](../supabase/config.toml) | Ports et options Supabase CLI local | Oui |
| [`vercel.json`](../vercel.json) | Build et routes Vercel | Oui |

### Chargement des variables

- **Serveur Express** : `require('dotenv').config()` → lit **`.env`** à la racine (`server/index.js`, scripts de sync, etc.).
- **Scripts production** (`scripts/init-production.js`, `sync_timesheets.js`, …) : idem, **`.env` uniquement** par défaut. Pour cibler la prod cloud, exporter les variables depuis `.env.production` avant d’exécuter le script (ou copier temporairement le contenu dans `.env`).
- **Client React (CRA)** : charge automatiquement `client/.env.development`, `client/.env.local`, `client/.env.production` selon le mode de build.
- **Vercel** : variables définies dans **Settings → Environment Variables** (Production + Preview).

---

## 1. Environnement de développement

### Démarrage

```bash
npm run install-all   # une fois
npx supabase start    # base locale (si pas déjà lancée)
npm run dev           # serveur 3000 + client 3001
```

| Service | URL |
|---------|-----|
| Interface React | http://localhost:3001 |
| API Express | http://localhost:3000 |
| Health check | http://localhost:3000/api/health |
| Supabase API locale | http://127.0.0.1:55221 (voir `supabase status`) |
| Supabase Studio | http://127.0.0.1:55223 (port par défaut CLI) |

### Architecture réseau (dev)

```
Navigateur → :3001 (React)
                ↓ proxy /api/*
             :3000 (Express) → Boond / Pennylane / Supabase local
```

Le proxy est défini dans [`client/src/setupProxy.js`](../client/src/setupProxy.js) (`/api` → `http://127.0.0.1:3000`).  
[`client/src/api.ts`](../client/src/api.ts) : laisser `REACT_APP_API_URL` **vide** en dev.

### Variables serveur — `.env` (racine)

| Variable | Obligatoire | Valeur / exemple dev | Description |
|----------|-------------|----------------------|-------------|
| `PORT` | Non | `3000` | Port Express |
| `NODE_ENV` | Non | `development` | Active le mode dev (stack traces, pas de static React) |
| `SUPABASE_URL` | **Oui** | `http://127.0.0.1:55221` | URL API Supabase — **doit correspondre** au port dans `supabase/config.toml` (`[api] port = 55221`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Oui** | Clé **Secret** de `npx supabase status` | Accès serveur aux tables (bypass RLS) |
| `BOOND_API_URL` | Recommandé | `https://ui.boondmanager.com/api` ou URL instance dédiée | Base API BoondManager |
| `BOOND_EMAIL` | **Oui** | email Boond | Basic Auth — identifiant |
| `BOOND_PASSWORD` | Option A | mot de passe en clair | Basic Auth |
| `BOOND_PASSWORD_ENC` | Option B | base64 chiffré | Mot de passe chiffré (préféré) |
| `ANIMA_SECRET_KEY` | Si `BOOND_PASSWORD_ENC` | phrase secrète longue | Clé de déchiffrement (`lib/secretEnv.js`) |
| `PENNYLANE_API_URL` | **Oui** (dashboard) | `https://app.pennylane.com/api/external/v2` | API Pennylane v2 |
| `PENNYLANE_API_KEY` | **Oui** (dashboard) | token API | Bearer token Pennylane |
| `DEV_INSECURE_TLS` | Si proxy SSL entreprise | `1` | **Dev uniquement** — désactive la vérification TLS Node (`lib/tlsConfig.js`) |
| `NODE_EXTRA_CA_CERTS` | Recommandé (entreprise) | chemin `.pem` | Certificat racine du proxy — **préféré** à `DEV_INSECURE_TLS` |

#### Variables Pennylane (optionnelles, [`env.example`](../env.example))

| Variable | Défaut | Rôle |
|----------|--------|------|
| `PENNYLANE_PL_SOURCE` | `ledger_entry_lines` | Source P&L (`ledger_entry_lines` ou `ledger_entries`) |
| `PENNYLANE_USE_2026_API_CHANGES` | activé | Pagination curseur API 2026 |
| `PENNYLANE_LEDGER_SORT` | — | Tri des écritures |
| `PENNYLANE_LEDGER_STATUS` | — | Filtre statut après chargement |
| `PENNYLANE_LEDGER_DATE_GTE` / `LTE` | `gteq` / `lteq` | Opérateurs de filtre date |
| `PENNYLANE_PAGE_LIMIT` | `100` | Taille de page |
| `PENNYLANE_RATE_DELAY_MS` | `260` | Délai entre pages (anti-429) |
| `PENNYLANE_ACCOUNT_FETCH_CONCURRENCY` | `8` | Parallélisme résolution comptes |
| `PENNYLANE_INCOME_CACHE_MS` | `0` | Cache compte de résultat (ms) |
| `PENNYLANE_PL_CHARGES_PREFIXES` | comptes 6* | Préfixes charges |
| `PENNYLANE_PL_PRODUITS_PREFIXES` | comptes 7* | Préfixes produits |
| `PENNYLANE_DEBUG` | — | `1` = logs détaillés |

### Variables client — `client/.env.development`

| Variable | Dev typique | Description |
|----------|-------------|-------------|
| `REACT_APP_API_URL` | *(vide)* | Laisser vide : proxy CRA vers port 3000 |
| `REACT_APP_SUPABASE_URL` | optionnel | Client Supabase côté navigateur (si utilisé) |
| `REACT_APP_SUPABASE_ANON_KEY` | optionnel | Clé anon / publishable |

`client/.env.local` : souvent `PORT=3001` pour fixer le port du dev server.

### Supabase local

| Paramètre | Valeur (`supabase/config.toml`) |
|-----------|----------------------------------|
| API | port **55221** |
| Postgres | port **55222** |
| TLS local | `enabled = false` (HTTP) |

Initialisation schéma : [`supabase/dev_init.sql`](../supabase/dev_init.sql) ou migrations dans [`supabase/migrations/`](../supabase/migrations/).

Tables principales : `resources`, `deliveries`, `projects`, `timesheets_detail`, `timesheets_data`, `forecast_times`, `absence`, `french_public_holiday`, `app_metadata`, …

### TLS / certificats (réseau entreprise)

Erreur fréquente : `unable to verify the first certificate`.

1. **Recommandé** : `NODE_EXTRA_CA_CERTS=C:\chemin\corporate-root-ca.pem`
2. **Contournement dev** : `DEV_INSECURE_TLS=1` (ignoré si `NODE_ENV=production`)

Voir [`lib/tlsConfig.js`](../lib/tlsConfig.js).

### Synchronisations automatiques (dev)

À l’ouverture du portail (`App.tsx`), si `/api/health` répond :

1. Sync ressources Boond  
2. Sync prestations  
3. Sync feuilles de temps (**3 derniers mois**)

Sync manuelle complète : onglet **Paramètres** de l’application.

---

## 2. Production locale (test avant déploiement)

Simule le comportement **Vercel + build React** sur une seule machine.

```bash
npm run build          # génère client/build
npm run start:prod     # NODE_ENV=production, sert le build sur PORT (3000)
# ou
npm run serve          # build + start:prod
```

| Aspect | Comportement |
|--------|--------------|
| URL | http://localhost:3000 (UI + API même origine) |
| `NODE_ENV` | `production` (forcé par `scripts/run-prod.js`) |
| Static files | `client/build` servi par Express |
| `DEV_INSECURE_TLS` | **Inactif** (bloqué en production) |
| Proxy CRA | Non utilisé |

Utiliser le même `.env` que en dev, ou un fichier dédié en exportant les variables avant `npm run serve`.

**Vérifications utiles :**

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/data/timesheets_aggregate.json
```

---

## 3. Production cloud (Vercel + Supabase)

### Architecture

```
Utilisateur → Vercel CDN (client/build)
                 ↓ /api/*
            Serverless functions (dossier api/)
                 ↓
            Supabase cloud + APIs Boond / Pennylane
```

Configuration build : [`vercel.json`](../vercel.json).

- `installCommand` : `npm install && cd client && npm install`
- `buildCommand` : `cd client && npm run build`
- `outputDirectory` : `client/build`
- Functions `api/**/*.js` : timeout 60 s

Guide détaillé : [`docs/VERCEL_DEPLOY.md`](VERCEL_DEPLOY.md).

### Variables Vercel (Settings → Environment Variables)

Cocher **Production** et **Preview**. **Redéployer** après toute modification.

#### Obligatoires

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | URL projet Supabase cloud (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT **service_role** (Settings → API) — **secret serveur uniquement** |
| `BOOND_EMAIL` | Email BoondManager |
| `BOOND_PASSWORD` **ou** `BOOND_PASSWORD_ENC` + `ANIMA_SECRET_KEY` | Authentification Boond |
| `BOOND_API_URL` | URL instance Boond (optionnel, défaut `ui.boondmanager.com`) |
| `PENNYLANE_API_URL` | API Pennylane v2 |
| `PENNYLANE_API_KEY` | Token Pennylane |

#### Recommandées

| Variable | Description |
|----------|-------------|
| `NODE_EXTRA_CA_CERTS` | Si inspection SSL côté infra Vercel rare ; surtout utile en local |
| Variables `PENNYLANE_*` | Ajuster rate-limit, préfixes comptables, source P&L |

#### Automatiques Vercel

| Variable | Valeur |
|----------|--------|
| `NODE_ENV` | `production` |

#### Obsolètes (ne plus configurer)

| Variable | Note |
|----------|------|
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Ancien stockage — remplacé par Supabase |
| `KV_URL`, `KV_REST_API_*` | Ancien Vercel KV — remplacé par Supabase |
| `BOONDMANAGER_API_KEY` / `SECRET` | Ancien schéma — remplacé par `BOOND_EMAIL` + mot de passe |

### Fichier `.env.production` (scripts locaux → cloud)

Utilisé pour lancer des **scripts de sync** depuis votre poste vers la base **cloud**, sans passer par Vercel.

Structure attendue :

```env
# Supabase Production
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_jwt>

# BoondManager — utiliser BOOND_EMAIL (pas BOOND_USERNAME)
BOOND_API_URL=https://ui.boondmanager.com/api
BOOND_EMAIL=votre.email@entreprise.fr
BOOND_PASSWORD=<mot de passe>
# ou BOOND_PASSWORD_ENC + ANIMA_SECRET_KEY

# Pennylane (si scripts dashboard)
PENNYLANE_API_URL=https://app.pennylane.com/api/external/v2
PENNYLANE_API_KEY=<token>
```

> **Piège connu** : `.env.production` ne doit pas utiliser `BOOND_USERNAME` — le code lit **`BOOND_EMAIL`** (`boondManagerService.js`, `sync_timesheets.js`).

Exemple d’exécution init prod (Windows PowerShell) :

```powershell
# Charger .env.production dans la session, puis :
node scripts/init-production.js
```

Le script enchaîne : ressources → prestations → timesheets (2 ans) → dictionnaire → jours fériés.

### Vérification config cloud

| Endpoint | Usage |
|----------|--------|
| `GET /api/health` | API vivante |
| `GET /api/env-check` | Variables présentes + test connexion Supabase (`api/env-check.js`) |

### Client React en production Vercel

- `REACT_APP_API_URL` : **vide** (URLs relatives `/api/...`)
- Pas de proxy CRA : l’API est sur le même domaine Vercel

---

## 4. Référence — authentification BoondManager

L’application utilise **HTTP Basic Auth** :

- **Username** : `BOOND_EMAIL`
- **Password** : `BOOND_PASSWORD` (clair ou déchiffré depuis `BOOND_PASSWORD_ENC`)

Chiffrement du mot de passe :

```bash
node scripts/encrypt-env.js "votre_mot_de_passe"
# → placer la sortie dans BOOND_PASSWORD_ENC + définir ANIMA_SECRET_KEY
```

Dans BoondManager (admin) : activer l’**authentification par identifiants** / Basic Auth.  
Si instance dédiée : adapter `BOOND_API_URL` (ex. `https://animaneo.boondmanager.com/api`).

Test : `GET /api/boondmanager/test` ou `node scripts/verify-boond-auth.js`.

---

## 5. Référence — Pennylane

- URL par défaut : `https://app.pennylane.com/api/external/v2`
- Auth : header `Authorization: Bearer ${PENNYLANE_API_KEY}`
- Scopes utiles : `ledger_entries:readonly`, `ledger_accounts:readonly`
- En dev sans clé : données mockées pour certaines routes (`pennylaneService.js`)

Script diagnostic :

```bash
npm run dump-ledger-month -- 2026 3
```

---

## 6. Scripts npm utiles par environnement

| Script | Environnement | Action |
|--------|---------------|--------|
| `npm run dev` | Dev | Serveur + client |
| `npm run server` | Dev / prod local | API seule |
| `npm run client` | Dev | React seul (port 3001) |
| `npm run build` | Prod | Build React |
| `npm run serve` | Prod local | Build + Express production |
| `npm run sync-timesheets` | Scripts | Sync feuilles de temps (CLI, args mois optionnels) |
| `npm run sync-absences` | Scripts | Sync absences Boond |
| `npm run view-db` | Dev | Aperçu données Supabase |
| `node scripts/init-production.js` | Prod cloud | Initialisation complète base cloud |

---

## 7. Checklist rapide par environnement

### Dev — premier lancement

- [ ] `env.example` → `.env` rempli (Supabase local, Boond, Pennylane)
- [ ] `npx supabase start` + URL/port alignés avec `.env`
- [ ] `DEV_INSECURE_TLS=1` ou `NODE_EXTRA_CA_CERTS` si proxy entreprise
- [ ] `npm run dev` → http://localhost:3001
- [ ] Paramètres → test API Boond + sync ressources / prestations / timesheets

### Prod locale

- [ ] `npm run build` OK
- [ ] `npm run serve` → http://localhost:3000
- [ ] Pas de `DEV_INSECURE_TLS` en production

### Prod cloud

- [ ] Projet Supabase cloud + migrations appliquées
- [ ] Variables Vercel (Production + Preview) + redeploy
- [ ] `/api/env-check` tout vert
- [ ] `init-production.js` exécuté une fois (ou syncs via l’UI)
- [ ] `.env.production` : `BOOND_EMAIL` (pas `BOOND_USERNAME`)

---

## 8. Documents connexes

| Document | Sujet |
|----------|--------|
| [`env.example`](../env.example) | Liste à jour des variables serveur |
| [`CONFIGURATION_API.md`](../CONFIGURATION_API.md) | Guide API (partiellement obsolète sur Boond clé/secret) |
| [`docs/VERCEL_DEPLOY.md`](VERCEL_DEPLOY.md) | Déploiement Vercel |
| [`docs/DATA_STRUCTURES.md`](DATA_STRUCTURES.md) | Schéma des données synchronisées |
| [`supabase/config.toml`](../supabase/config.toml) | Ports Supabase local |

---

*Dernière mise à jour : mai 2026 — aligné sur le code actuel (Basic Auth Boond, stockage Supabase, TLS `lib/tlsConfig.js`).*

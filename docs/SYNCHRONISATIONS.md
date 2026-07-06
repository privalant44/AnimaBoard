# Synchronisations AnimaBoard

Ce document décrit **toutes** les synchronisations de données : sources (BoondManager, Pennylane), tables Supabase cibles, déclencheurs (UI, API, scripts CLI, crons Vercel) et comportements (plein / incrémental).

> **Stockage** : toutes les données métier passent par **Supabase/Postgres** via `lib/supabaseClient.js` → `lib/db.js` / `lib/kvStorage.js`.  
> **Authentification Boond** : Basic Auth (`BOOND_EMAIL` + `BOOND_PASSWORD` ou `BOOND_PASSWORD_ENC` + `ANIMA_SECRET_KEY`).

---

## Vue d'ensemble

```
BoondManager API                    Pennylane API
      │                                    │
      ├─ ressources, contrats              └─ compte de résultat (ledger)
      ├─ prestations (deliveries)
      ├─ feuilles de temps (timesheets)
      ├─ absences
      ├─ opportunités → besoins
      └─ dictionnaire (types / statuts)
                    │
                    ▼
           Scripts / API / Crons
                    │
                    ▼
              Supabase (Postgres)
                    │
                    ▼
         Accueil, Forecast, Rapports, etc.
```

---

## Tableau récapitulatif

| Donnée | Source | Table(s) Supabase | Période par défaut | Fichier principal |
|--------|--------|-------------------|--------------------|-------------------|
| Ressources | `GET /resources` + contrats | `resources` | Toutes (visibles) | `sync.js` |
| Prestations | `GET /deliveries/{id}` | `deliveries`, `projects` | IDs configurés (`DELIVERIES_START_ID`–`END_ID`) | `extract_deliveries.js` |
| Feuilles de temps | `GET /times-reports` (liste + détail) | `timesheets_detail`, `timesheets_data` | Variable (voir ci-dessous) | `sync_timesheets.js` |
| Absences | `GET /absences` | `absence` | N−1 → N (années civiles) | `sync_absences.js` |
| Besoins | `GET /opportunites` ou `/opportunities` | `besoins` | 2 mois (incrémental) ou complet | `server/routes/boondManager.js` |
| Dictionnaire | `GET /application/dictionary` | `dictionnaire` | Complet (upsert) | `api/boondmanager/sync.js` |
| Compte de résultat | Pennylane ledger | `pennylane_income_statement_monthly` | Année courante (sync standard) | `server/services/dashboardService.js` |
| Jours fériés | Calcul local (France) | `french_public_holiday` | 10 ans glissants | `scripts/seed-french-holidays.js` |

---

## Déclencheurs

### 1. Sync automatique à la connexion (UI)

**Fichier** : `client/src/App.tsx`  
**Condition** : API joignable + permission `OPS_SYNC` (rôles **admin** / **manager** quand l’auth est activée).  
**Une seule fois** par session navigateur.

| Ordre | Endpoint | Contenu |
|-------|----------|---------|
| 1 | `POST /api/boondmanager/sync/resources` | Ressources |
| 2 | `POST /api/boondmanager/sync/deliveries` | Prestations |
| 3 | `POST /api/boondmanager/sync/timesheets` | Timesheets **3 derniers mois** |
| 4 | `POST /api/boondmanager/sync/besoins/snapshot?recentMonths=2` | Besoins **2 derniers mois** |
| 5 | `POST /api/dashboard/income-statement/sync` | Pennylane année courante |

> N’inclut **pas** : absences, dictionnaire, besoins complets, timesheets 2 ans.

### 2. Paramètres (sync manuelle)

**Fichier** : `client/src/components/Settings.tsx`

| Bouton UI | Endpoint | Période / mode |
|-----------|----------|----------------|
| Actualiser les ressources | `POST /api/boondmanager/sync/resources` | Complet |
| Synchroniser le dictionnaire | `POST /api/boondmanager/sync/dictionary` | Complet (upsert) |
| Actualiser les prestations | `POST /api/boondmanager/sync/deliveries` | Complet |
| Synchroniser les feuilles de temps | `POST /api/boondmanager/sync/timesheets` | **3 derniers mois** |
| Synchroniser les absences | `POST /api/boondmanager/sync/absences` | **N−1 et N** (`(année−1)-01-01` → `année-12-31`) |
| Actualiser les besoins | `POST /api/boondmanager/sync/besoins/snapshot?recentMonths=2` | **2 derniers mois** (upsert, sans vider la table) |
| Réinitialiser les feuilles de temps | `POST /api/timesheets-reset` | Vide puis recharge **6 derniers mois** (limite Vercel) |

### 3. Rapports (Pennylane + besoins)

**Fichier** : `client/src/components/Report.tsx`

| Action | Endpoint |
|--------|----------|
| Refresh compte de résultat | `POST /api/dashboard/income-statement/sync` |
| Sync besoins (bouton) | `POST /api/boondmanager/sync/besoins/snapshot` (mode **complet** si pas de `recentMonths`) |

### 4. API Boond (toutes routes)

**Fichiers** : `api/boondmanager/sync.js` (Vercel), `server/routes/boondManager.js` (Express dev)

| Méthode | Route | Corps / query optionnel |
|---------|-------|-------------------------|
| `POST` | `/api/boondmanager/sync/resources` | — |
| `POST` | `/api/boondmanager/sync/deliveries` | — |
| `POST` | `/api/boondmanager/sync/dictionary` | — |
| `POST` | `/api/boondmanager/sync/timesheets` | `{ "startMonth": "YYYY-MM", "endMonth": "YYYY-MM" }` |
| `POST` | `/api/boondmanager/sync/absences` | `{ "beginDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }` (défaut N−1 → N) |
| `POST` | `/api/boondmanager/sync/besoins/snapshot` | `?recentMonths=2` ou corps `{ "recentMonths": 2 }` ; sans param = **mode complet** |

### 5. Scripts CLI (hors application)

Exécutés depuis la racine du projet, avec `.env` (dev) ou `.env.production` (cloud).

| Commande | Équivalent API / action |
|----------|-------------------------|
| `npm run sync` | Ressources (`node sync.js`) |
| `node extract_deliveries.js` | Prestations |
| `npm run sync-timesheets` | Timesheets ; args optionnels : `node sync_timesheets.js 2025-01 2026-06` |
| `npm run sync-timesheets-2years` | Timesheets jan (N−1) → déc (N) |
| `npm run sync-absences` | Absences (défaut N−1 → N) |
| `npm run init-dictionary` | Dictionnaire |
| `npm run init-income-statement` | Pennylane multi-années (`--years=2025,2026`) |
| `npm run seed-french-holidays` | Jours fériés |
| `node scripts/init-production.js` | **Init complète** cloud (voir section dédiée) |

### 6. Crons Vercel (production cloud)

Déclarés dans `vercel.json` — **pas de bouton dans l’UI Vercel pour les créer** : commit + deploy Production.

| Job | Route | Planning (UTC) | Timeout |
|-----|-------|----------------|---------|
| Journalier | `/api/cron/daily-sync` | `0 4 * * *` (tous les jours ~4h) | 300 s |
| Mensuel | `/api/cron/monthly-sync` | `0 5 1 * *` (1er du mois ~5h) | 300 s |

Sécurité : variable `CRON_SECRET` → header `Authorization: Bearer <secret>` (envoyé automatiquement par Vercel).

**Journalier** (`api/cron/daily-sync.js`) :

1. Ressources  
2. Prestations  
3. Timesheets **3 derniers mois**  
4. Absences **N−1 → N**  
5. Besoins **2 derniers mois**  
6. Compte de résultat Pennylane **année courante**

**Mensuel** (`api/cron/monthly-sync.js`) :

1. Dictionnaire  
2. Besoins **complets** (vide `besoins` puis recharge tout Boond)  
3. Timesheets **2 ans** (jan N−1 → déc N)

Test manuel :

```powershell
Invoke-RestMethod -Method POST `
  -Uri "https://VOTRE-APP.vercel.app/api/cron/daily-sync" `
  -Headers @{ Authorization = "Bearer VOTRE_CRON_SECRET" }
```

---

## Détail par synchronisation

### Ressources

- **API Boond** : `GET /resources`, puis `GET /resources/{id}/contracts` par ressource.
- **Filtre** : ressources visibles (`isVisible` ≠ false/0).
- **Persistance** : `kvStorage.set(KV_KEYS.RESOURCES)` → upsert table `resources` (`lib/db.js`).
- **Champs** : `id`, `nom`, `prenom`, `type_of`, `state`, `is_visible`, `contracts`, `raw`.

### Prestations (deliveries)

- **API Boond** : boucle `GET /deliveries/{id}` de `DELIVERIES_START_ID` à `DELIVERIES_END_ID` (`lib/constants.js`).
- **Persistance** : `deliveries` + projets associés dans `projects`.
- **Champs clés** : `tjm`, `average_daily_cost`, `resource_id`, `ordered_days`, dates début/fin.

### Feuilles de temps (timesheets)

- **API Boond** : liste via endpoint times-reports, puis détail par feuille.
- **États inclus** : `draft`, `submitted`, `waitingForValidation`, `validated`, `rejected`.
- **Tables** :
  - `timesheets_detail` : granularité ressource × prestation × mois (`total_days_prod`, etc.) — utilisée pour **TACE**, marges, Forecast.
  - `timesheets_data` : agrégat / cache legacy.
- **Périodes courantes** :

| Contexte | Plage |
|----------|-------|
| Connexion / Settings / cron journalier | 3 derniers mois |
| Cron mensuel / `sync-timesheets-2years` | jan (N−1) → déc (N) |
| `init-production.js` | idem 2 ans |
| `timesheets-reset` (Vercel) | 6 derniers mois après vidage |

### Absences

- **API Boond** : `GET /absences` (pagination).
- **Table** : `absence` — agrégat **jours** par `resource_id` × `month` (`YYYY-MM`).
- **Période** : par défaut du 1er janvier (N−1) au 31 décembre (N).
- **Usage** : dénominateur TACE sur l’écran d’accueil (`dashboardService.getHomeMonthlyRecap`).

### Besoins (opportunités Boond)

- **Source** : opportunités Boond (`/opportunites` ou `/opportunities`), pagination jusqu’à 200 pages.
- **Table** : `besoins` — champs `id`, `titre`, `date_creation`, `date_mise_a_jour`, `type_of`, `state`.

#### Mode incrémental (`recentMonths=N`)

- Filtre les opportunités dont `date_mise_a_jour` ou `date_creation` ≥ début du mois (N−1) en UTC.
- **Upsert** uniquement — ne supprime pas les anciennes lignes.
- Utilisé : connexion auto, Settings, cron journalier (`recentMonths=2`).

#### Mode complet (sans `recentMonths`)

- **Supprime** toute la table `besoins`, puis upsert l’intégralité Boond.
- Utilisé : cron mensuel, bouton Rapports « Sync Besoins » sans filtre.

#### Règles d’affichage (écran Accueil)

Calcul dans `server/services/dashboardService.js` à partir de la table `besoins` :

| Indicateur | Date de référence | Règle |
|------------|-------------------|-------|
| Créés (hors piste) | `date_creation` | +1 si `state !== '0'` |
| En stock | `date_mise_a_jour` | `state` ∈ `5`, `10` |
| Gagnés | `date_mise_a_jour` | `state === '1'` |
| Perdus | `date_mise_a_jour` | `state === '2'` |
| Abandonnés | `date_mise_a_jour` | `state === '3'` |
| Stand by | `date_mise_a_jour` | `state === '9'` |
| Délai moyen de réponse | `date_mise_a_jour` | Moyenne `(date_mise_a_jour − date_creation)` en jours |

Libellés des `state` : table `dictionnaire` (`table_name = opportunities`, `column_name = state`).

### Dictionnaire

- **Source** : dictionnaire Boond (types et statuts ressources + opportunités).
- **Table** : `dictionnaire` — clé `(table_name, column_name, code)` → `label`.
- **Mode** : upsert (pas de suppression globale).

### Compte de résultat Pennylane

- **Source** : API Pennylane v2 (`pennylaneService.getCompteDeResultat`) — lignes ledger par défaut.
- **Table** : `pennylane_income_statement_monthly` — une ligne par `(year, month)`.
- **Sync standard** (`syncPennylaneIncomeStatement`) : **toujours l’année courante**.
- **Init multi-années** : `syncPennylaneIncomeStatementYears` ou `npm run init-income-statement -- --years=2025,2026`.
- **Variables** : `PENNYLANE_API_URL`, `PENNYLANE_API_KEY` (voir `env.example`).

### Jours fériés France

- **Source** : calcul algorithmique (`lib/frenchHolidays.js`), pas d’API externe.
- **Table** : `french_public_holiday`.
- **Script** : `npm run seed-french-holidays` — 10 ans par défaut.
- **Usage** : jours ouvrés pour le TACE.

---

## Initialisation production cloud

**Script** : `node scripts/init-production.js`  
**Prérequis** : `.env` ou variables exportées depuis `.env.production` (`SUPABASE_URL` cloud, Boond, etc.).

Enchaînement :

1. Ressources  
2. Prestations  
3. Timesheets **2 ans**  
4. Dictionnaire  
5. Jours fériés (**10 ans**)

> Ne synchronise **pas** Pennylane ni les besoins — à lancer séparément (`init-income-statement`, sync besoins).

---

## Permissions (auth activée)

| Permission | Sync |
|------------|------|
| `OPS_SYNC` | Toutes les routes `/api/boondmanager/sync/*`, reset timesheets |
| Rôles typiques | `admin`, `manager` |

Les crons `/api/cron/*` contournent l’auth utilisateur (`skipAuth: true`) mais exigent `CRON_SECRET` si défini.

---

## Variables d'environnement requises

| Sync | Variables |
|------|-----------|
| Boond (toutes) | `BOOND_EMAIL`, `BOOND_PASSWORD` (ou `BOOND_PASSWORD_ENC` + `ANIMA_SECRET_KEY`), `BOOND_API_URL` |
| Supabase (persistance) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Pennylane | `PENNYLANE_API_URL`, `PENNYLANE_API_KEY` |
| Crons | `CRON_SECRET` (recommandé en prod) |

Voir [`env.example`](../env.example) et [`docs/CONFIGURATION_ENVIRONNEMENTS.md`](CONFIGURATION_ENVIRONNEMENTS.md).

---

## Dépannage

| Symptôme | Piste |
|----------|-------|
| Tables vides après sync | `SUPABASE_URL` ≠ port `npx supabase status` en local |
| Boond 401/422 | Vérifier `BOOND_EMAIL` (pas `BOOND_USERNAME`), Basic Auth activé dans Boond |
| Pennylane timeout | Réduire la charge ou augmenter `maxDuration` sur Vercel |
| Cron invisible | Redéployer **Production** après modification de `vercel.json` |
| Besoins incomplets en accueil | Lancer sync **complète** (mensuel ou Rapports sans `recentMonths`) |
| `timesheets-reset` ne recharge que 6 mois | Comportement voulu sur Vercel (éviter timeout) ; utiliser `sync-timesheets-2years` en CLI pour 2 ans |

**Vérification rapide** :

```bash
curl http://localhost:3000/api/env-check
curl http://localhost:3000/api/boondmanager/test
```

---

## Documents connexes

- [`README.md`](../README.md) — démarrage rapide  
- [`docs/CONFIGURATION_ENVIRONNEMENTS.md`](CONFIGURATION_ENVIRONNEMENTS.md) — variables par environnement  
- [`docs/DATA_STRUCTURES.md`](DATA_STRUCTURES.md) — schéma des tables  
- [`docs/VERCEL_DEPLOY.md`](VERCEL_DEPLOY.md) — déploiement et variables Vercel  

*Dernière mise à jour : juin 2026 — aligné sur `daily-sync`, `monthly-sync` et routes `/api/boondmanager/sync/*`.*

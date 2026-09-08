# Rapport Synthèse Forecast — Documentation fonctionnelle et technique

Document de référence pour la conception, le fonctionnement et l’implémentation du rapport **Synthèse Forecast** dans AnimaBoard.

---

## 1. Objectif du rapport

Le rapport **Synthèse Forecast** fournit une **vue heatmap annuelle** (année civile en cours) des **jours de production** par **ressource** et par **mois**.

Chaque cellule agrège :

1. les **jours déjà saisis** (timesheets),
2. les **jours prévisionnels Boond** (saisie Forecast liée aux prestations),
3. éventuellement les **jours prévisionnels manuels** (scénarios P1, P2…), selon le filtre scénario.

Il sert au pilotage de la charge : repérer rapidement les sous-charges (rouge) et les mois bien chargés (vert clair), filtrer les populations (type / statut), et visualiser les mois « avant retour » pour les collaborateurs en **Retour planifié**.

Ce n’est **pas** :

- l’écran **Forecast** (grille éditable des prestations / scénarios),
- le tableau de bord **Accueil** (CA, marge, TACE en euros / % — logique mois clôturés vs ouverts différente),
- l’ancien générateur `report.js` / clé KV `forecast_report` (legacy, hors UI actuelle).

---

## 2. Documentation fonctionnelle

### 2.1 Accès utilisateur

| Étape | Action |
|-------|--------|
| 1 | Ouvrir l’onglet **Rapports** dans la navigation |
| 2 | Sur le menu des rapports, cliquer **Synthèse Forecast** |
| 3 | La grille ressource × mois de l’année en cours s’affiche |

**Permissions** (auth Microsoft activée) :

- onglet Rapports visible si l’utilisateur a au moins une permission rapport (`TAB_REPORT` / `VIEW_REPORT_FORECAST` / `VIEW_REPORT_INCOME`) ;
- le bouton **Synthèse Forecast** exige `view:report:forecast` (`VIEW_REPORT_FORECAST`) ;
- si l’auth est désactivée (dev), tous les droits sont accordés.

### 2.2 Contenu affiché

- **Colonnes** : `Ressource` + 12 mois (`Jan.` … `Déc.` de l’année courante).
- **Lignes** : toutes les ressources locales (même sans prestation), triées nom puis prénom.
- **Valeur d’une cellule** : nombre de jours (1 décimale), ou `0` si nul.
- **Couleurs (légende)** :

| Jours | Couleur | Signification visuelle |
|------:|---------|------------------------|
| 0 – 4 | Rouge `#EE423F` | Sous-charge |
| 5 – 9 | Rose `#FAC7C6` | Charge faible |
| 10 – 14 | Jaune `#FFBD2E` | Charge moyenne |
| ≥ 15 | Menthe `#B1E8E6` | Charge élevée |

### 2.3 Formule métier (valeur cellule)

Pour une ressource \(R\) et un mois \(M\) (format `YYYY-MM`) :

\[
\text{Valeur}(R, M) =
\text{Jours saisis}(R, M)
+ \text{Jours prévi. Boond}(R, M)
+ \text{Jours scénarios}(R, M, F)
\]

| Composante | Source métier | Détail |
|------------|---------------|--------|
| **Jours saisis** | Feuilles de temps | Somme des `days` sur toutes les prestations de \(R\) pour \(M\) |
| **Jours prévi. Boond** | Forecast lié aux prestations | Somme des valeurs `forecast_times` des prestations rattachées à \(R\) pour \(M\) |
| **Jours scénarios** | Prestations prévisionnelles manuelles (Forecast) | Somme des jours `planned_forecast` pour les scénarios inclus par le filtre \(F\) |

**Périmètre temporel UI** : année civile **courante uniquement** (pas de N−1 dans la grille).

**Pas de bascule « mois clôturé / ouvert »** dans ce rapport : la formule est la même pour les 12 mois (contrairement à l’Accueil).

### 2.4 Filtres

#### Type et Statut

- Multi-sélection (cases à cocher).
- Liste vide = **aucun filtre** (toutes les ressources).
- Options = libellés dictionnaire Boond ∪ valeurs présentes sur les ressources.
- Persistés dans `localStorage` (`report_typeFilter`, `report_statutFilter`).

#### Scénario prévisionnel

Sélecteur **Scénario prévi.** (même sémantique cumulative que l’Accueil) :

| Valeur | Effet sur les jours scénarios |
|--------|-------------------------------|
| **Aucun** | Contribution scénarios = **0** (saisis + Boond uniquement) |
| **P1** | Inclut le scénario 1 |
| **P1 à P2** | Inclut scénarios 1 **et** 2 |
| **P1 à Pn** | Inclut tous les scénarios \(s \le n\) |

Les options Pn disponibles sont dérivées des scénarios réellement présents dans les données planifiées chargées.

Persistance : `localStorage` clé `report_scenarioFilter` (`none` ou `"1"`…`"n"`).

### 2.5 Mois grisés — Retour planifié

Pour une ressource dont le statut Boond est **Retour planifié** (ou **Retour imminent**, détection souple casse/accents) **et** qui a une **date de retour prévisionnelle** saisie dans **Ressources** :

- les mois **strictement antérieurs** au mois de la date de retour,
- **et** sans aucun jour saisi sur ce mois,

sont affichés en **gris** avec `—` (tooltip : pas de saisie attendue avant la date de retour).

Si des jours saisis existent malgré tout avant la date, la cellule **n’est pas** grisée : la valeur réelle s’affiche.

La date est stockée dans les métadonnées ressources (`dateRetourPrevisionnelle`). Quand le statut change dans Boond, la date active est archivée hors affichage (`derniereDateRetourPrevisionnelle`) côté page Ressources — le rapport n’utilise que la date **active** tant que le statut reste éligible.

### 2.6 Chaîne de création des données (vue métier)

```
BoondManager                    AnimaBoard (saisie)                 Rapport Synthèse Forecast
─────────────                   ───────────────────                 ─────────────────────────
Ressources  ──sync──► resources (+ dictionnaire type/statut)  ──► lignes + filtres
Prestations ──sync──► deliveries                              ──► rattachement forecast Boond
Timesheets  ──sync──► timesheets_detail → agrégat             ──► jours saisis
                        forecast_times (écran Forecast)       ──► jours prévi. Boond
                        planned_scenario / planned_forecast   ──► jours scénarios P1…Pn
                        resources_metadata (écran Ressources) ──► grisage retour
```

**Prérequis opérationnels**

1. Synchroniser **Ressources** et **Prestations** (Paramètres).
2. Maintenir les **timesheets** à jour (sync feuilles de temps).
3. Renseigner le **Forecast** Boond (et éventuellement les scénarios manuels) pour les mois futurs.
4. Pour le grisage : statut Boond « Retour planifié » + date dans **Ressources**.

Sans prestations synchronisées, l’API bootstrap renvoie une erreur 404 (« Aucune donnée prestations… »).

### 2.7 Rafraîchissement

Un événement global `DATA_REFRESH_EVENT` (émis après sync / actions Paramètres) recharge bootstrap + métadonnées sans recharger toute l’application.

---

## 3. Documentation technique

### 3.1 Architecture (flux de bout en bout)

```
[Navigation] tab=report
      │
      ▼
[Report.tsx] activeReport='menu' → bouton → 'forecast-year'
      │
      ├─ GET /api/data/forecast-bootstrap
      │         │
      │         ▼
      │   forecastBootstrapService.getForecastBootstrapData()
      │         ├─ KV deliveries, forecast_times, timesheets_aggregate, absence…
      │         ├─ getResourcesLocalPayload() (resources + dictionary)
      │         ├─ listPlannedDeliveriesByResource()
      │         └─ (dev) fallback SQL timesheets_detail
      │
      └─ GET /api/data/resources-metadata
                │
                ▼
          kvStorage RESOURCES_METADATA (JSONB)
      │
      ▼
Calcul client : getTotalValue / shouldGrayCell → table heatmap
```

### 3.2 Fichiers clés

| Fichier | Rôle |
|---------|------|
| `client/src/App.tsx` | Monte `<Report />` sur l’onglet Rapports |
| `client/src/components/Navigation.tsx` | Entrée sidebar « Rapports » |
| `client/src/components/Report.tsx` | UI, filtres, formules cellules |
| `client/src/components/Report.css` | Styles table, légende, cellules grises, filtres |
| `client/src/utils/plannedScenarios.ts` | Filtre cumulatif + somme jours scénarios |
| `client/src/utils/resourceStatus.ts` | Détection statut retour + mois avant retour |
| `client/src/utils/resourceReturnDate.ts` | Date active depuis métadonnées |
| `client/src/auth/roles.ts` | `VIEW_REPORT_FORECAST` |
| `lib/forecastBootstrapService.js` | Construction du payload bootstrap |
| `lib/plannedDeliveriesService.js` | Lecture `planned_scenario` / `planned_forecast` |
| `lib/dictionarySync.js` | `resourcesLocal` + libellés type/statut |
| `server/routes/data.js` | Route Express `GET /forecast-bootstrap` (fallback timesheets **on**) |
| `api/data/forecast-bootstrap.js` | Route Vercel (fallback timesheets **off**) |
| `api/data/resources-metadata.js` | GET/POST métadonnées (prod) |
| `supabase/migrations/20260708220000_planned_forecast_normalized.sql` | Schéma scénarios manuels |

### 3.3 Endpoints

#### `GET /api/data/forecast-bootstrap`

Query optionnelle (utilisée surtout par Forecast ; Report n’en envoie pas) :

| Param | Défaut | Effet |
|-------|--------|--------|
| `from` | année courante − 1 | Début de fenêtre années |
| `years` | 12 (max 15) | Nombre d’années de fenêtre (jours fériés / fallback) |

Réponse :

```json
{
  "success": true,
  "data": {
    "deliveries": [ /* prestations */ ],
    "resourcesLocal": [ /* ressources enrichies typeLabel/stateLabel */ ],
    "dictionaryOptions": { "types": [], "states": [] },
    "forecastByDeliveryId": { "<deliveryId>": { "YYYY-MM": 0 } },
    "orderedDaysByDeliveryId": {},
    "absenceByResource": {},
    "plannedDeliveriesByResource": {
      "<resourceId>": [
        {
          "resourceId": 123,
          "scenario": 1,
          "tjm": 500,
          "description": "…",
          "forecast": { "2026-07": 10, "2026-08": 12 }
        }
      ]
    },
    "forecastScenarios": [],
    "holidays": [],
    "timesheetsAggregate": {
      "<resourceId>": {
        "<deliveryId>": {
          "YYYY-MM": { "days": 8, "hours": 56 }
        }
      }
    }
  }
}
```

**Utilisé par Synthèse** : `deliveries`, `resourcesLocal`, `dictionaryOptions`, `forecastByDeliveryId`, `plannedDeliveriesByResource`, `timesheetsAggregate`.

**Présent mais non utilisé par Synthèse** : `absenceByResource`, `holidays`, `forecastScenarios`, `orderedDaysByDeliveryId`.

**Différence dev / prod** :

- Express (`server/routes/data.js`) : `includeSupabaseTimesheetsFallback: true` — complète les cellules absentes depuis `timesheets_detail` (`delivery_id ≠ 0`, `total_days_prod`).
- Vercel (`api/data/forecast-bootstrap.js`) : fallback **désactivé** (payload plus léger, agrégat KV uniquement).

Erreur typique : `404` si aucune prestation en stockage (`KV_KEYS.DELIVERIES` vide).

#### `GET /api/data/resources-metadata`

Retourne l’objet métadonnées indexé par ID ressource, dont :

```json
{
  "12345": {
    "tempsTravail": "100%",
    "statutFeu": "vert",
    "commentaires": "…",
    "dateRetourPrevisionnelle": "2026-09-15",
    "derniereDateRetourPrevisionnelle": "2026-03-01"
  }
}
```

### 3.4 Sources de données (stockage)

| Concept | Stockage | Champs / clés utiles |
|---------|----------|----------------------|
| Ressources | Table `resources` (+ dictionnaire) | `id`, `nom`/`prenom`, `typeLabel`, `stateLabel` |
| Prestations | KV / table `deliveries` | `id`, `resourceId`, `title`, `tjm`, … |
| Jours saisis | Agrégat KV `timesheets_aggregate` (issu de `timesheets_detail`) | `resourceId`, `deliveryId`, `month`, `totalDays` |
| Prévi. Boond | KV / table `forecast_times` | `delivery_id`, `month`, `value` |
| Scénarios manuels | `planned_scenario` + `planned_forecast` | PK `(resource_id, scenario)` ; jours par `(resource_id, scenario, month)` |
| Métadonnées retour | KV `resources_metadata` (JSONB) | `dateRetourPrevisionnelle` |

Schéma scénarios (extrait migration) :

- `planned_scenario (resource_id, scenario, tjm, description)`
- `planned_forecast (resource_id, scenario, month, days)` avec FK cascade vers le scénario

### 3.5 Implémentation frontend (détail)

#### États principaux (`Report.tsx`)

| État | Type logique |
|------|----------------|
| `resources` | `{ id, nom, prenom, type, statut, projects[] }` |
| `forecastData` | `{ [deliveryId]: { forecast: { [month]: number } } }` |
| `timesheetsAggregate` | nested resource → delivery → month → `{ days, hours }` |
| `plannedDeliveriesByResource` | `{ [resourceId]: PlannedForecastItem[] }` |
| `resourcesMetadata` | métadonnées par id |
| `typeFilter` / `statutFilter` / `scenarioFilter` | filtres UI |
| `activeReport` | `'menu' \| 'forecast-year' \| 'pennylane-pl'` |

#### Fonctions de calcul

**`getActualDays(resourceId, month)`**  
Somme de `timesheetsAggregate[resourceId][deliveryId][month].days` pour tous les `deliveryId`.

**`getTotalValue(resourceId, month)`**

```
actual
+ Σ forecastData[project.id].forecast[month]   // projets de la ressource
+ getPlannedDaysForMonth(plannedItems, month, parsedScenarioFilter)
```

**`getPlannedDaysForMonth`** (`plannedScenarios.ts`)  
Si filtre `'none'` → `0` ; sinon somme de `item.forecast[month]` pour chaque item avec `scenario <= n`.

**`shouldGrayCell(resource, month)`** — vrai si :

1. `hasDateRetourPrevisionnelle(resource.statut)`
2. `getActiveReturnDate(...)` non vide
3. `month < dateRetour.slice(0, 7)`
4. `getActualDays(...) === 0`

#### Couleurs

`getCellColor(value)` selon les seuils 4 / 9 / 14 ; texte blanc si luminance &lt; 0,5.

#### Prop optionnelle

`initialReport?: 'menu' | 'forecast-year' | 'pennylane-pl'` — utile tests / embedding. **Non passée** par `App.tsx` en production (démarrage sur le menu).

### 3.6 Règles utilitaires (modules partagés)

**`plannedScenarios.ts`**

- `parseScenarioFilter('none'|string) → 'none' | number`
- `scenarioIncluded(scenario, filter)` : `false` si `none`, sinon `scenario <= filter`
- `buildScenarioFilterOptions(max)` : options UI
- `formatPlannedScenarioFilterLabel` : libellé sous-titre

**`resourceStatus.ts`**

- `hasDateRetourPrevisionnelle(statut)` : match normalisé sur « retour planifié » / « retour imminent »
- `isMonthBeforeProvisionalReturn(month, returnDate)` : comparaison lexicographique `YYYY-MM`

**`resourceReturnDate.ts`**

- `getActiveReturnDate(statut, metadata)` : retourne `dateRetourPrevisionnelle` seulement si statut éligible
- `archiveReturnDateIfNeeded` : utilisé sur **Ressources**, pas sur le rapport

### 3.7 Différences Synthèse Forecast vs Accueil vs Forecast

| Aspect | Synthèse Forecast | Accueil (home-monthly-recap) | Écran Forecast |
|--------|-------------------|------------------------------|----------------|
| Unité | **Jours** | **€ / %** (CA, marge, TACE…) | Jours éditables |
| Mois clôturés | Même formule 12 mois | Actuals only (Pennylane / timesheets) | Édition + lecture |
| Mois ouverts | Actual + Boond + scénarios | CA/marge recalculés avec prévi. | Idem sources |
| Filtre scénario | Cumulatif jours | Cumulatif **CA** (`days × TJM`) | Édition par scénario (pas de filtre cumulatif d’affichage) |
| Grisage retour | Oui | Non | Non |
| Année | Courante (UI) | Sélectionnable | Multi-années possible |

### 3.8 Autorisation API

- `GET /api/data/forecast-bootstrap` et `GET /api/data/resources-metadata` : utilisateur authentifié (pas de permission métier supplémentaire dans `authorize.js` pour ces GET).
- L’accès **UI** au bouton Synthèse est contrôlé par `VIEW_REPORT_FORECAST`.
- L’écriture des scénarios / métadonnées passe par d’autres routes (`POST planned-deliveries`, `POST resources-metadata`) avec droits d’écriture data.

### 3.9 Points d’attention / limites connues

1. **Prod vs Dev timesheets** : sans fallback SQL en Vercel, l’agrégat KV doit être à jour sinon des jours saisis peuvent manquer.
2. **Année UI fixe** : pas de sélecteur d’année sur Synthèse (contrairement à l’Accueil).
3. **Ressources sans prestation** : ligne affichée ; contribution Boond = 0, scénarios possibles si planifiés sur la ressource.
4. **`delivery_id = 0`** : lignes de synthèse timesheets exclues de l’agrégat / fallback (non comptées comme production prestation).
5. **Legacy** : ne pas confondre avec `report.js` / `forecast_report`.

---

## 4. Checklist de validation

| # | Contrôle |
|---|----------|
| 1 | Menu Rapports → Synthèse Forecast s’ouvre avec l’année courante |
| 2 | Cellule = saisis + prévi Boond (filtre scénario = Aucun) |
| 3 | Filtre P1 / P1 à Pn augmente les jours des ressources avec scénarios |
| 4 | Filtres Type / Statut réduisent les lignes |
| 5 | Ressource « Retour planifié » + date → mois avant retour grisés (`—`) si 0 saisi |
| 6 | Saisie réelle avant date de retour → cellule non grisée |
| 7 | Légende couleurs conforme aux seuils 4 / 9 / 14 |
| 8 | Après sync Paramètres, la grille se rafraîchit (`DATA_REFRESH_EVENT`) |
| 9 | Sans prestations sync → message d’erreur bootstrap clair |

---

## 5. Glossaire

| Terme | Définition |
|-------|------------|
| **Jours saisis** | Temps production déjà saisi dans Boond / timesheets |
| **Prévi. Boond** | Temps prévisionnel saisi sur l’écran Forecast pour une prestation existante |
| **Scénario Pn** | Ligne prévisionnelle manuelle (TJM + description + jours/mois) hors prestation Boond |
| **Filtre cumulatif** | Pn inclut P1…Pn |
| **Date de retour prévisionnelle** | Date saisie dans Ressources pour un statut « Retour planifié » |
| **Bootstrap Forecast** | Payload unique partagé Forecast / Report pour charger ressources, temps et prévisions |

---

*Dernière mise à jour : documentation alignée sur l’implémentation client `Report.tsx`, `lib/forecastBootstrapService.js`, `planned_scenario` / `planned_forecast`, et le filtre scénario cumulatif.*

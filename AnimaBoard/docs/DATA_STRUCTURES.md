# Structures de données stockées

Toutes les données métier sont stockées dans des **tables Supabase** via `lib/db.js` et `lib/kvStorage.js`.  
La migration `supabase/migrations/20250112000000_create_data_tables.sql` crée ces tables.

Les clés métier sont définies dans `lib/constants.js` sous `KV_KEYS` et servent à router vers les bonnes tables.

---

## 1. Ressources — clé `resources`

**Écrit par :** `sync.js` (syncResources), appelé via API BoondManager sync/resources.

**Type :** tableau d’objets.

**Structure d’un élément :**

| Champ      | Type    | Description |
|-----------|---------|-------------|
| `id`      | number  | ID BoondManager |
| `nom`     | string  | Nom de famille (attributes.lastName) |
| `prenom`  | string  | Prénom (attributes.firstName) |
| `typeOf`  | number \| null | Code type ressource |
| `state`   | number \| null | Code statut |
| `isVisible` | boolean | Visible dans l’app |
| `contracts` | array  | Liste des contrats (pour TJM, etc.) |
| `raw`     | object  | Réponse brute BoondManager |

---

## 2. Prestations (deliveries) — clé `deliveries`

**Écrit par :**  
- soit `extract_deliveries.js` (bouton « Prestations » dans Paramètres),  
- soit `sync.js` (syncDeliveries).

**Type :** objet avec `metadata` et `data`.

**Structure :**

```json
{
  "metadata": {
    "lastSync": "ISO8601",
    "extractedAt": "ISO8601",
    "method": "GET",
    "baseURL": "...",
    "idRange": "1-500",
    "successCount": 0,
    "notFoundCount": 0,
    "errorCount": 0,
    "totalRecords": 0
  },
  "data": [ /* tableau de prestations */ ]
}
```

**Structure d’un élément de `data` (prestation) :**

| Champ | Type | Description |
|-------|------|-------------|
| `id` | number \| string | ID prestation |
| `type` | string | `"delivery"` |
| `startDate` | string \| null | Date début (ISO ou YYYY-MM-DD) |
| `endDate` | string \| null | Date fin |
| `title` | string \| null | Titre |
| `state` | * | Statut |
| `averageDailyPriceExcludingTax` | number \| null | TJM |
| `averageDailyCost` | number \| null | Coût journalier moyen |
| `resource_id` | string \| null | ID ressource associée |
| `orderedDays` | number \| null | Jours commandés |
| *(optionnel)* `reference`, `resourceFirstName`, `resourceLastName`, `raw` | * | Selon source (sync.js vs extract_deliveries) |

L’API `/api/data/deliveries.json` renvoie soit `stored` tel quel (avec `metadata` + `data`), soit seulement le tableau `data` selon le format stocké.

---

## 3. Projets — clé `projects`

**Écrit par :** `sync.js` (syncProjects).

**Type :** tableau d’objets.

**Structure d’un élément :**

| Champ | Type | Description |
|-------|------|-------------|
| `id` | number | ID projet BoondManager |
| `project` | object | Objet projet brut (attributes, relationships, etc.) |
| `deliveries` | array | Liste des prestations du projet (objets bruts BoondManager) |

Utilisé par `report.js` pour générer le rapport forecast (projets × ressources × prestations).

---

## 4. Feuilles de temps (détail) — clé `timesheets_data`

**Écrit par :** `sync_timesheets.js`.

**Type :** objet avec `metadata` et `data`.

**Structure :**

```json
{
  "metadata": {
    "syncedAt": "ISO8601",
    "period": { "startMonth": "YYYY-MM", "endMonth": "YYYY-MM" },
    "totalTimesheets": 0,
    "totalEntries": 0,
    "endpoint": "...",
    "structure": "Ressource > Année > Mois > Jour"
  },
  "data": { /* voir ci‑dessous */ }
}
```

**Structure de `data` :** objet imbriqué **Ressource → Année → Mois → Jour**.

- Clé niveau 1 : `resourceId` (string).
- Valeur : `{ resourceName, [year]: { [monthNum]: { [day]: [ { timesheetId, items: [ ... ] } ] } } }`.
- Chaque **item** dans une feuille contient : `projectId`, `deliveryId`, `days`, `hours`, `value`, `date`.

En pratique, le front ne lit pas directement `timesheets_data` ; il utilise **`timesheets_aggregate`** pour les totaux par ressource / mois / prestation.

---

## 5. Agrégat feuilles de temps — clé `timesheets_aggregate`

**Écrit par :** `sync_timesheets.js` (createAggregate).

**Type :** objet avec `metadata` et `data`.

**Structure :**

```json
{
  "metadata": {
    "generatedAt": "ISO8601",
    "source": "KV",
    "period": { "startMonth": "YYYY-MM", "endMonth": "YYYY-MM" },
    "totalRecords": 0
  },
  "data": [ /* tableau de lignes agrégées */ ]
}
```

**Structure d’un élément de `data` :**

| Champ | Type | Description |
|-------|------|-------------|
| `resourceId` | string \| null | ID ressource |
| `resourceName` | string | Nom affiché |
| `month` | string \| null | Mois (YYYY-MM) |
| `deliveryId` | string \| null | ID prestation |
| `totalDays` | number | Jours totaux saisis |
| `totalHours` | number | Heures totales |

C’est la structure lue par Forecast et Report pour afficher les temps saisis par ressource / prestation / mois.

---

## 6. Temps prévisionnels (forecast) — clé `forecast_times`

**Écrit par :**  
- Lecture/écriture via API : `GET /api/data/forecast-times.json`, `POST /api/data/forecast-times` (server/routes/data.js).  
- Script migration : `scripts/migrate-to-kv.js` (import ancien JSON).

**Type :** objet avec `metadata` et `data`.

**Structure :**

```json
{
  "metadata": {
    "createdAt": "ISO8601",
    "lastUpdated": "ISO8601"
  },
  "data": {
    "<deliveryId>": {
      "forecast": {
        "<month>": <number>
      }
    }
  }
}
```

- `data` : clés = ID prestation (string), valeur = `{ forecast: { "YYYY-MM": jours } }`.
- `POST /api/data/forecast-times` reçoit `deliveryId`, `month`, `hours` (en fait des jours) et met à jour `data[deliveryId].forecast[month]`.

---

## 7. Rapport forecast (synthèse) — clé `forecast_report`

**Écrit par :** `report.js` (generateJSONReport), après génération à partir de `projects` et `resources`.

**Type :** tableau d’objets (une ligne par prestation × ressource).

**Structure d’un élément :**

| Champ | Type | Description |
|-------|------|-------------|
| `nom` | string | Nom de famille ressource |
| `prenom` | string | Prénom ressource |
| `reference` | string | Référence projet/prestation |
| `titre` | string | Titre prestation |
| `dateDebut` | string | Date début |
| `dateFin` | string | Date fin |
| `tjm` | number \| null | TJM |

---

## 8. Temps missions (extraction CSV) — clé `temps_missions`

**Écrit par :** `extract_time_reports.js` (extraction temps saisis via API BoondManager en CSV).

**Type :** objet avec `metadata` et `data`.

**Structure :**

```json
{
  "metadata": {
    "extractedAt": "ISO8601",
    "method": "POST",
    "endpoint": "...",
    "period": { "beginDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" },
    "totalRecords": 0,
    "columns": ["Ressource", "Projet", "Prestation", "Mois", "Nombre de jours"]
  },
  "data": [
    { "Ressource": "...", "Projet": "...", "Prestation": "...", "Mois": "...", "Nombre de jours": "..." }
  ]
}
```

---

## 9. Métadonnées ressources — clé `resources_metadata`

**Écrit par :**  
- Script `scripts/migrate-to-kv.js` (import ancien JSON).  
- API `POST /api/data/resources-metadata` (server/routes/data.js) avec le body comme valeur.

**Type :** objet libre (métadonnées par ressource ou autre usage interne). Pas de structure imposée par le reste de l’app.

---

## Récapitulatif des clés

| Clé | Contenu principal |
|-----|--------------------|
| `resources` | Liste des ressources (nom, prénom, type, statut, contrats, raw) |
| `deliveries` | Prestations : `{ metadata, data: [{ id, type, startDate, endDate, title, resource_id, orderedDays, averageDailyPriceExcludingTax, ... }] }` |
| `projects` | Projets avec prestations : `[{ id, project, deliveries }]` |
| `timesheets_data` | Détail feuilles de temps (Ressource > Année > Mois > Jour) |
| `timesheets_aggregate` | Agrégat par ressource / mois / prestation (totalDays, totalHours) |
| `forecast_times` | Temps prévisionnels par prestation et mois |
| `forecast_report` | Rapport synthèse : tableau `[{ nom, prenom, reference, titre, dateDebut, dateFin, tjm }]` |
| `temps_missions` | Extraction CSV temps : `{ metadata, data: [{ Ressource, Projet, Prestation, Mois, Nombre de jours }] }` |
| `resources_metadata` | Métadonnées libres (optionnel) |

Ces structures sont celles attendues par les routes `/api/data/*` et par les écrans Forecast, Report et Paramètres.

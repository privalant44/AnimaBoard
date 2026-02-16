# Anima Board - Tableau de bord Anima Néo

Application de tableau de bord pour la société Anima Néo, intégrant les données de BoondManager et Pennylane.

## Fonctionnalités

Le tableau de bord présente les métriques suivantes :

- **Chiffre d'affaires par mois** : Facturation issue de Pennylane
- **Coût des ressources facturables** : Calculé à partir des temps saisis dans BoondManager
- **Coût des ressources non facturables** : Ressources internes non facturables
- **Charges par mois** : Frais et salaires depuis Pennylane
- **TACE** : Taux d'Activité Coût d'Emploi (CA / Coût total des ressources)
- **TACI** : Taux d'Activité Coût d'Intervention (CA / Coût ressources facturables)
- **EBE** : Excédent Brut d'Exploitation (CA - Coût facturable - Charges)
- **REX** : Résultat d'Exploitation (CA - Coût total ressources - Charges)

## Structure du projet

```
AnimaBoard/
├── server/                 # Backend Node.js/Express
│   ├── routes/            # Routes API
│   │   ├── boondManager.js
│   │   ├── pennylane.js
│   │   └── dashboard.js
│   ├── services/          # Services métier
│   │   ├── boondManagerService.js
│   │   ├── pennylaneService.js
│   │   └── dashboardService.js
│   └── index.js           # Point d'entrée serveur
├── client/                # Frontend React/TypeScript
│   ├── src/
│   │   ├── components/    # Composants React
│   │   ├── types.ts       # Types TypeScript
│   │   └── App.tsx
│   └── package.json
└── package.json           # Configuration racine
```

## Installation

**En local, il suffit de :** Node.js 18+, puis `npm run install-all`, puis créer un `.env` (voir ci‑dessous). Aucun Redis ni base de données à installer : le KV utilise Upstash (cloud) ou un cache mémoire si les variables KV ne sont pas configurées.

1. **Installer les dépendances** :
```bash
npm run install-all
```

2. **Configurer les variables d'environnement** :
   
   **Option A - Script automatique (Windows PowerShell)** :
   ```powershell
   .\setup-env.ps1
   ```
   
   **Option B - Manuellement** :
   - Copier `env.example` vers `.env`
   - Remplir les clés API pour BoondManager et Pennylane :
     ```
     BOONDMANAGER_API_KEY=your_key
     BOONDMANAGER_API_SECRET=your_secret
     PENNYLANE_API_KEY=your_key
     ```
   
   📖 **Voir le guide détaillé** : `CONFIGURATION_API.md`

3. **Stockage des données**  
   Aucun fichier JSON n’est utilisé : en développement et en production, les données (métadonnées, forecast, prestations, timesheets, etc.) sont stockées en **KV (Redis)**. Configurer Upstash Redis (ou Vercel KV) : voir `VERCEL_KV_SETUP.md`.

## Utilisation

### Mode développement

Lancer le serveur et le client en parallèle :
```bash
npm run dev
```

Ou séparément :
```bash
# Terminal 1 - Backend
npm run server

# Terminal 2 - Frontend
npm run client
```

Le tableau de bord sera accessible sur `http://localhost:3000`

### Mode production

1. Build du frontend :
```bash
npm run build
```

2. Lancer le serveur :
```bash
npm run server
```

### Environnement similaire à la production (local)

Pour tester localement comme en production (un seul processus, frontend servi depuis le build) :

```bash
# Une seule commande : build + serveur en mode production
npm run serve
```

Ou en deux étapes :
```bash
npm run build
npm run start:prod
```

L’application est alors disponible sur `http://localhost:3000` : le serveur Express sert le build React depuis `client/build`, comme sur Vercel. Aucun `react-scripts start` ni nodemon, donc pas de problème EPERM sous Windows.

## API Endpoints

### Dashboard
- `GET /api/dashboard/metrics` - Récupère toutes les métriques
- `GET /api/dashboard/revenue-by-month` - CA par mois

### BoondManager
- `GET /api/boondmanager/test` - **Test de connexion à l'API BoondManager**
- `GET /api/boondmanager/resources` - Liste des ressources
- `GET /api/boondmanager/projects` - Liste des projets
- `GET /api/boondmanager/services` - Liste des prestations
- `GET /api/boondmanager/time-entries?startDate=&endDate=` - Saisies de temps

### Pennylane
- `GET /api/pennylane/invoices?startDate=&endDate=` - Factures
- `GET /api/pennylane/expenses?startDate=&endDate=` - Charges
- `GET /api/pennylane/salaries?startDate=&endDate=` - Salaires

### Test de configuration
- `GET /api/test` - **Vérifier l'état de la configuration des API**

## Notes

- En mode développement, des données mockées sont retournées si les API ne sont pas configurées
- Les dates doivent être au format `YYYY-MM-DD`
- Les calculs sont effectués mensuellement

## Technologies

- **Backend** : Node.js, Express
- **Frontend** : React, TypeScript
- **Graphiques** : Recharts
- **Styling** : CSS moderne avec gradients

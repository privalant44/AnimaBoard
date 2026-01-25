# Guide de configuration des API

## Configuration BoondManager

### 1. Obtenir les identifiants API

Pour obtenir vos identifiants API BoondManager :

1. Connectez-vous à votre compte BoondManager
2. Allez dans **Paramètres** > **API** ou **Intégrations**
3. Créez une nouvelle clé API si nécessaire
4. Notez :
   - **API Key** (clé API)
   - **API Secret** (secret API)
   - **URL de base de l'API** (généralement `https://api.boondmanager.com` ou votre URL personnalisée)

### 2. Configuration dans l'application

Créez un fichier `.env` à la racine du projet (copiez `env.example`) :

```env
# Port du serveur
PORT=3000

# BoondManager API
BOONDMANAGER_API_URL=https://api.boondmanager.com
BOONDMANAGER_API_KEY=votre_api_key_ici
BOONDMANAGER_API_SECRET=votre_api_secret_ici

# Pennylane API
PENNYLANE_API_URL=https://api.pennylane.io
PENNYLANE_API_KEY=votre_api_key_ici

# Environnement
NODE_ENV=development
```

### 3. Format d'authentification BoondManager

L'API BoondManager utilise généralement l'une de ces méthodes :

**Option A : Basic Authentication (HTTP Basic Auth)**
- Username = API Key
- Password = API Secret

**Option B : Token Bearer**
- Header : `Authorization: Bearer <token>`

**Option C : Clé API dans les headers**
- Header : `X-API-Key: <api_key>`

### 4. Endpoints BoondManager utilisés

L'application fait appel aux endpoints suivants :
- `GET /api/v2/resources` - Liste des ressources
- `GET /api/v2/projects` - Liste des projets
- `GET /api/v2/services` - Liste des prestations
- `GET /api/v2/time-entries` - Saisies de temps (avec paramètres `startDate` et `endDate`)

### 5. Tester la connexion

Une fois configuré, vous pouvez tester la connexion :

```bash
# Via curl
curl -u "VOTRE_API_KEY:VOTRE_API_SECRET" https://api.boondmanager.com/api/v2/resources

# Ou via l'endpoint de test de l'application
GET http://localhost:3000/api/boondmanager/resources
```

## Configuration Pennylane

### 1. Obtenir le token API

1. Connectez-vous à votre compte Pennylane
2. Allez dans **Paramètres** > **API** ou **Développeurs**
3. Créez un nouveau token API
4. Notez le **Token API**

### 2. Configuration

Ajoutez dans votre fichier `.env` :

```env
PENNYLANE_API_KEY=votre_token_ici
```

### 3. Format d'authentification

Pennylane utilise généralement :
- Header : `Authorization: Bearer <token>`

### 4. Endpoints Pennylane utilisés

- `GET /v1/invoices` - Factures (avec paramètres `start_date` et `end_date`)
- `GET /v1/expenses` - Charges (avec paramètres `start_date` et `end_date`)
- `GET /v1/salaries` - Salaires (avec paramètres `start_date` and `end_date`)

## Vérification de la configuration

Après avoir configuré vos API, redémarrez le serveur :

```bash
npm run server
```

Puis testez les endpoints :
- `http://localhost:3000/api/boondmanager/resources`
- `http://localhost:3000/api/pennylane/invoices`

Si les API ne sont pas configurées, l'application utilisera des données mockées en mode développement.

## Dépannage

### Erreur 401 (Unauthorized)
- Vérifiez que vos clés API sont correctes
- Vérifiez le format d'authentification utilisé par votre API

### Erreur 404 (Not Found)
- Vérifiez l'URL de base de l'API
- Vérifiez que les endpoints existent dans la documentation de votre API

### Erreur de connexion
- Vérifiez votre connexion internet
- Vérifiez que l'URL de l'API est accessible

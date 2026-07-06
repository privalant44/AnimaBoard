# Authentification AnimaBoard (Microsoft + compte local)

AnimaBoard peut exiger une connexion avant d’accéder à l’interface et aux API. Deux modes coexistent :

1. **Microsoft Entra ID** (MSAL + JWT RS256)
2. **Compte administrateur local** (identifiant / mot de passe + JWT HS256)

## Architecture

| Couche | Rôle |
|--------|------|
| **React** | Écran de connexion (Microsoft + formulaire local) ; session locale en `sessionStorage` |
| **MSAL** | Connexion popup Microsoft, jeton d’accès API |
| **API Express / Vercel** | Vérifie JWT Microsoft (`jwks-rsa`) ou JWT local (`LOCAL_AUTH_JWT_SECRET`) |
| **Restriction optionnelle** | Domaines e-mail Microsoft (`AUTH_ALLOWED_EMAIL_DOMAINS`) |

Routes **publiques** (sans jeton) : `/api/health`, `/api/auth/local/login`, `/api/cron/*` (protégé par `CRON_SECRET`).

### Compte administrateur local

| Variable | Description |
|----------|-------------|
| `LOCAL_ADMIN_USERNAME` | Identifiant (défaut dev : `Administrateur`) |
| `LOCAL_ADMIN_PASSWORD_HASH` | Hash **scrypt** base64 (pas de mot de passe en clair dans le dépôt) |
| `LOCAL_ADMIN_EMAIL` | E-mail affiché dans le menu compte (optionnel) |
| `LOCAL_AUTH_JWT_SECRET` | Secret HMAC pour signer les JWT locaux (**obligatoire en production**) |
| `LOCAL_AUTH_JWT_EXPIRES` | Durée du jeton (défaut `8h`) |

Générer un hash pour un nouveau mot de passe :

```bash
node scripts/hash-local-admin-password.js "VotreMotDePasse"
```

En **développement**, si `LOCAL_ADMIN_PASSWORD_HASH` est absent, un hash par défaut est utilisé (documenté dans `env.example`) — **ne pas s’appuyer sur ce comportement en production**.

Connexion : `POST /api/auth/local/login` avec `{ "username", "password" }` → `{ token, user }`. Le client envoie ensuite `Authorization: Bearer <token>` comme pour Microsoft.

## 1. Inscription d’application Azure

1. [Portail Azure](https://portal.azure.com) → **Microsoft Entra ID** → **Inscriptions d’applications** → **Nouvelle inscription**.
2. Nom : `AnimaBoard`.
3. Types de comptes : **Comptes uniquement dans cet annuaire organisationnel** (recommandé pour un usage interne).
4. URI de redirection (SPA) :
   - Dev : `http://localhost:3001`
   - Prod : `https://votre-domaine.vercel.app` (URL exacte du site)
5. Noter **ID d’application (client)** et **ID de locataire (tenant)**.

### Exposer une API (obligatoire pour le jeton API)

1. Dans l’app → **Exposer une API** → **Définir** l’URI = `api://{CLIENT_ID}` (remplacer par votre GUID client).
2. **Ajouter une étendue** : nom `access_as_user`, utilisateurs/admins consentement.
3. **Ajouter une application cliente** : sélectionner la même app, cocher l’étendue `access_as_user`.

Sans cette étape, l’API renverra `401` (audience du jeton incorrecte).

## 2. Variables d’environnement

### Vercel — Production (et Preview si besoin)

| Variable | Exemple | Où |
|----------|---------|-----|
| `AUTH_ENABLED` | `true` | Serveur (API) |
| `AZURE_CLIENT_ID` | GUID | Serveur |
| `AZURE_TENANT_ID` | GUID locataire | Serveur |
| `AUTH_ALLOWED_EMAIL_DOMAINS` | `animaneo.fr` | Serveur (optionnel, virgules) |
| `REACT_APP_AUTH_ENABLED` | `true` | Build client |
| `REACT_APP_AZURE_CLIENT_ID` | même GUID | Build client |
| `REACT_APP_AZURE_TENANT_ID` | même tenant | Build client |

Les variables `REACT_APP_*` sont lues **au build** CRA : redéployer après modification.

### Développement local

**Racine `.env`** :

```env
AUTH_ENABLED=true
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AUTH_ALLOWED_EMAIL_DOMAINS=animaneo.fr
```

**`client/.env.local`** :

```env
REACT_APP_AUTH_ENABLED=true
REACT_APP_AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
REACT_APP_AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Sans `AUTH_ENABLED`, l’app reste ouverte (comportement actuel pour migration progressive).

## Rôles applicatifs (RBAC)

Quatre rôles, assignés **par adresse e-mail** (table Supabase `app_user_roles` ou variables d’env).

| Rôle | Onglets | Sync / paramètres | Données sensibles |
|------|---------|-------------------|-------------------|
| **admin** | Tous + gestion utilisateurs | Oui | Finance, feuilles de temps, écriture |
| **manager** | Accueil, Ressources, Forecast, Rapports | Sync auto + manuel | Finance, feuilles de temps, écriture |
| **commercial** | Accueil, Forecast, Rapports | Non | Lecture compte de résultat, écriture forecast |
| **consultation** | Accueil, Ressources, Forecast (lecture) | Non | Pas de rapports finance ni sync |

- Compte local **Administrateur** → toujours `admin`.
- Utilisateur Microsoft **sans entrée** en base → rôle `AUTH_DEFAULT_ROLE` (défaut : `consultation`).

### Variables

| Variable | Description |
|----------|-------------|
| `AUTH_DEFAULT_ROLE` | Rôle si l’e-mail n’est pas dans `app_user_roles` (`consultation` par défaut) |
| `AUTH_ROLE_OVERRIDES` | Surcharges sans SQL : `email@domaine.fr=manager,autre@domaine.fr=commercial` |

### Migration Supabase

Appliquer `supabase/migrations/20260604100000_app_user_roles.sql`, puis par exemple :

```sql
insert into public.app_user_roles (email, role, display_name) values
  ('vous@animaneo.fr', 'admin', 'Votre nom')
on conflict (email) do update set role = excluded.role, updated_at = now();
```

Les **admin** peuvent aussi gérer les rôles dans **Paramètres → Utilisateurs et rôles**.

### API

- `GET /api/auth/me` — rôle et permissions du connecté (jeton requis).
- `GET|POST|DELETE /api/auth/users` — réservé aux **admin**.

## 3. Vérification

1. Ouvrir l’app → écran de connexion (logo Anima Néo, Microsoft, formulaire local).
2. Tester **Microsoft** ou **Administrateur** + mot de passe configuré.
3. Après connexion, les appels vers `/api/*` doivent inclure `Authorization: Bearer …`.
4. `GET /api/env-check` (connecté) → `200` avec `AUTH_ENABLED` et `LOCAL_AUTH` renseignés.
5. Appel API sans jeton → `401` `{ "error": "Authentification requise" }`.

## 4. Limites Vercel Hobby

L’auth est intégrée dans `lib/errorHandler.js` (pas de 13ᵉ fonction serverless).

## Dépannage

| Symptôme | Cause probable |
|----------|----------------|
| `AADSTS50011` redirect URI | URI de redirection manquante ou différente de l’URL du site |
| `401 Jeton invalide` | API non exposée, mauvais scope, ou `AZURE_CLIENT_ID` différent entre client et serveur |
| `Domaine non autorisé` | E-mail hors de `AUTH_ALLOWED_EMAIL_DOMAINS` |
| Page blanche / config | `REACT_APP_*` absent au build Vercel |
| `AADSTS9002326` SPA | URI de redirection en plateforme **Application monopage**, pas Web |
| `403 Accès refusé` | Rôle insuffisant — vérifier `app_user_roles` ou `AUTH_ROLE_OVERRIDES` |

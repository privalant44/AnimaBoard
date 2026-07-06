# Guide de démarrage rapide - Anima Board

## Installation rapide

1. **Installer toutes les dépendances** :
```bash
npm run install-all
```

2. **Configurer les API** :
   - Copier `env.example` vers `.env`
   - Remplir vos clés API :
     - BoondManager : `BOONDMANAGER_API_KEY` et `BOONDMANAGER_API_SECRET`
     - Pennylane : `PENNYLANE_API_KEY`

## Lancement

### Mode développement (recommandé)
```bash
npm run dev
```
Cette commande lance simultanément :
- Le serveur backend sur `http://localhost:5000`
- Le client React sur `http://localhost:3000`

### Mode séparé
```bash
# Terminal 1
npm run server

# Terminal 2
npm run client
```

## Accès à l'application

Ouvrez votre navigateur sur : **http://localhost:3000**

## Données de test

En mode développement, si les API ne sont pas configurées, l'application utilise des données mockées pour vous permettre de tester l'interface.

## Structure des données attendues

### BoondManager
- **Ressources** : `{ id, name, billable, hourlyRate }`
- **Temps** : `{ id, resourceId, projectId, serviceId, hours, date }`

### Pennylane
- **Factures** : `{ id, amount, date, status }`
- **Charges** : `{ id, amount, date, category }`
- **Salaires** : `{ id, amount, date, employee }`

## Dépannage

### Le serveur ne démarre pas
- Vérifiez que le port 5000 n'est pas utilisé
- Vérifiez que Node.js est installé (version 14+)

### Le client ne démarre pas
- Vérifiez que le port 3000 n'est pas utilisé
- Exécutez `cd client && npm install` si nécessaire

### Erreurs API
- Vérifiez vos clés API dans le fichier `.env`
- Consultez les logs du serveur pour plus de détails

# Corriger le 404 NOT_FOUND sur Vercel

Si vous voyez **404: NOT_FOUND** (Code: NOT_FOUND, ID: cdg1::...) sur l’URL de votre projet, suivez ces étapes dans l’ordre.

---

## 1. Root Directory (cause la plus fréquente)

Votre dépôt Git est très probablement **Code** (racine) avec le dossier **AnimaBoard** à l’intérieur.

- Ouvrez **Vercel** → votre projet → **Settings** → **General**.
- Section **Root Directory** : cliquez sur **Edit**.
- Saisissez exactement : **`AnimaBoard`** (sans `/` avant ou après).
- Cliquez sur **Save**.

Sans cela, Vercel build depuis la racine du repo (Code), ne trouve pas `vercel.json` ni `client/`, et tout renvoie 404.

---

## 2. Ne pas surcharger la config de build

Toujours dans **Settings** → **General** :

- Dans **Build & Development Settings**, vérifiez que vous n’avez pas coché **Override** pour *Build Command*, *Output Directory* ou *Install Command* de façon à écraser le `vercel.json`.
- Si **Override** est coché, décochez-le pour laisser le `vercel.json` du projet gérer la build (ou alignez les valeurs sur ce fichier).

---

## 3. Vérifier que le build réussit

- Allez dans **Deployments** → ouvrez le **dernier déploiement**.
- Onglet **Building** : la commande doit être du type `cd client && npm run build` et se terminer **sans erreur** (statut vert).
- Si le build est rouge, corrigez l’erreur affichée (dépendances, variables d’environnement, etc.). Tant que le build échoue, il n’y a pas de `client/build` → 404 partout.

---

## 4. Redéployer après modification

Après toute modification de **Root Directory** ou des paramètres de build :

- **Deployments** → **⋮** (trois points) sur le dernier déploiement → **Redeploy**.
- Attendez la fin du déploiement (statut vert).

---

## 5. Tester les URLs

- **Page d’accueil** : `https://votre-projet.vercel.app/`
- **API** : `https://votre-projet.vercel.app/api/health` (doit retourner du JSON)

Si la Root Directory est correcte et le build vert, ces URLs doivent répondre.

---

## Récapitulatif

| À vérifier | Où | Valeur / action |
|------------|-----|------------------|
| Root Directory | Settings → General | **AnimaBoard** (si repo = Code/AnimaBoard) |
| Override build | Settings → General | Désactivé (ou cohérent avec vercel.json) |
| Build réussi | Deployments → dernier → Building | Statut vert, pas d’erreur |
| Redéploiement | Deployments → ⋮ → Redeploy | Après chaque changement de réglages |

Si après tout ça vous avez encore 404, envoyez une capture du **Building** (logs complets) du dernier déploiement pour analyser l’erreur.

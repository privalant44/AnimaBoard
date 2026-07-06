# Clone Supabase dev → prod

Exporte le schéma **`public`** de la base **locale** (Supabase CLI) et le restaure en **production cloud**, après avoir **vidé** `public` en prod.

## Prérequis

1. **Supabase local** démarré : `npx supabase start`
2. **Outils PostgreSQL** installés (`pg_dump`, `pg_restore`, `psql`) — ex. [PostgreSQL for Windows](https://www.postgresql.org/download/windows/)
3. Fichier **`.env.production`** (copie de [`.env.production.example`](../.env.production.example)) avec :
   - `SUPABASE_URL`
   - `SUPABASE_DB_PASSWORD` — mot de passe **postgres** (Dashboard → Settings → **Database**, pas la clé service_role)

## Commandes

Depuis la racine `AnimaBoard/` :

| Commande | Action |
|----------|--------|
| `npm run db:export-dev` | Dump dev seul → `backups/dev-export-*.dump` |
| `npm run db:import-prod -- -DumpFile .\backups\dev-export-....dump` | Backup prod, vide `public`, importe le dump |
| `npm run db:clone-dev-to-prod` | Export dev + import prod (pipeline complet) |

PowerShell direct :

```powershell
.\scripts\supabase-dev-to-prod.ps1 -Action Export
.\scripts\supabase-dev-to-prod.ps1 -Action Import -DumpFile .\backups\dev-export-20260604.dump
.\scripts\supabase-dev-to-prod.ps1 -Action Clone
```

Options utiles :

- `-Force` — sans confirmation `OUI`
- `-SkipProdBackup` — pas de backup prod avant import (déconseillé)
- `-ProdProjectRef wqmosguasirxdgyshpnq` — si `.env.production` incomplet
- `-DevDbUrl postgresql://postgres:postgres@127.0.0.1:52122/postgres` — URL dev explicite

## Déroulement (Import / Clone)

1. **Backup prod** → `backups/prod-backup-before-import-*.dump`
2. **Export dev** (Clone uniquement) → `backups/dev-export-*.dump`
3. **`DROP SCHEMA public CASCADE`** puis **`CREATE SCHEMA public`** en prod
4. **`pg_restore`** du dump dev
5. Réapplication des droits Supabase ([`fix_public_schema_grants.sql`](../supabase/snippets/fix_public_schema_grants.sql))

## Sécurité

- Ne commitez jamais `.env.production` ni les fichiers `.dump`
- Le dossier `backups/` est ignoré par git
- Vérifiez l’URL prod affichée avant de taper `OUI`

## Dépannage

| Erreur | Piste |
|--------|--------|
| `pg_dump introuvable` | Installer PostgreSQL client tools et relancer le terminal |
| `connection refused` (dev) | `npx supabase status` — port DB dans `supabase/config.toml` `[db] port` |
| `password authentication failed` (prod) | Réinitialiser le mot de passe postgres dans le dashboard Supabase |
| `permission denied for schema public` (Vercel) | Relancer l’import (étape grants) ou exécuter `fix_public_schema_grants.sql` à la main |

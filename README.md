# MonSalon

App privée de gestion de salon : revenus, dépenses, rendez-vous, loyer, rapports Word.  
Frontend statique (GitHub Pages) + base [Supabase](https://supabase.com).

## Installation (une fois)

### 1. Base Supabase

1. Créez un projet sur [supabase.com](https://supabase.com)
2. **SQL Editor** → exécutez [`supabase/schema.sql`](supabase/schema.sql)
3. **Settings → API** → copiez l'URL et la clé **anon public**

### 2. Configuration locale (privée)

```bash
cp .env.example .env
```

Éditez `.env` avec vos vraies valeurs, puis :

```bash
node setup.mjs
```

Cela crée `config.js` (ignoré par Git). **Ne commitez jamais** `.env` ni `config.js`.

> Le navigateur ne peut pas lire `.env` directement. `setup.mjs` fait le pont vers `config.js`.

### 3. Lancer en local

```bash
npx serve .
```

## GitHub Pages

1. Poussez le code **sans** `.env` ni `config.js` (dépôt privé recommandé)
2. Activez Pages (branche `main`, racine)
3. Avant chaque déploiement : `node setup.mjs` puis uploadez `config.js` sur la branche publiée (ou via GitHub Actions + secrets)

## Sécurité

| Clé | Frontend |
|-----|----------|
| `SUPABASE_ANON_KEY` | Oui |
| `service_role` | **Jamais** |

La clé `service_role` contourne toutes les protections. Elle reste uniquement dans le dashboard Supabase.

## Structure

```
index.html
css/styles.css
js/app.js          → interface
js/data.js         → Supabase
js/calc-platform.js → calculs
supabase/schema.sql
.env.example       → modèle (sur Git)
.env               → vos clés (hors Git)
config.js          → généré (hors Git)
assets/logo.png
```

## Tables

| Table | Rôle |
|-------|------|
| `clients` | Fiche client unique (`telephone` unique) |
| `revenus` | Encaissements |
| `rdvs` | Rendez-vous |
| `depenses` | Frais salon |
| `settings` | Loyer (`monthly_rent`) |

Le téléphone sert d'identifiant : normalisé, puis recherche/création automatique du client. Les totaux sont calculés en JavaScript.

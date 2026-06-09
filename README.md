# MonSalon

App privée de gestion de salon : revenus, dépenses, rendez-vous, loyer, rapports Word.  
Frontend statique (GitHub Pages) + base [Supabase](https://supabase.com).

## Installation locale

```bash
cp .env.example .env
# Éditez .env (URL sans /rest/v1/ — ex: https://xxx.supabase.co)
node setup.mjs
npx serve .
```

`config.js` est généré localement et **ignoré par Git**.

---

## GitHub Pages (publication en ligne)

`config.js` n’est **pas** sur GitHub (`.gitignore`). GitHub Pages ne peut pas exécuter `node setup.mjs`.  
La solution : **GitHub Actions** génère `config.js` à chaque déploiement.

### Étape 1 — Secrets du dépôt

Sur GitHub : **Settings → Secrets and variables → Actions → New repository secret**

| Nom | Valeur |
|-----|--------|
| `SUPABASE_URL` | `https://votre-projet.supabase.co` (sans `/rest/v1/`) |
| `SUPABASE_ANON_KEY` | Clé **anon public** (Settings → API dans Supabase) |

### Étape 2 — Activer GitHub Pages

**Settings → Pages → Build and deployment**

- **Source** : `GitHub Actions` (pas « Deploy from a branch »)

### Étape 3 — Pousser le code

```bash
git push origin master
```

Le workflow `.github/workflows/pages.yml` crée `config.js` et publie le site.

Vérifiez l’onglet **Actions** : le job « Deploy GitHub Pages » doit être vert.

### Erreur « Configuration Supabase manquante » en ligne ?

1. Source Pages = **GitHub Actions** (pas la branche master seule)
2. Secrets `SUPABASE_URL` et `SUPABASE_ANON_KEY` bien renseignés
3. URL Supabase **sans** `/rest/v1/` à la fin
4. Attendre la fin du déploiement (Actions → vert) puis rafraîchir le site

---

## Base Supabase

1. Créez un projet sur [supabase.com](https://supabase.com)
2. **SQL Editor** → exécutez [`supabase/schema.sql`](supabase/schema.sql)
3. **Settings → API** → URL + clé anon

## Sécurité

| Clé | Frontend / GitHub Pages |
|-----|-------------------------|
| `SUPABASE_ANON_KEY` | Oui (prévue pour le navigateur) |
| `service_role` | **Jamais** |

La clé `service_role` contourne le RLS — elle reste uniquement dans le dashboard Supabase.

## Structure

```
index.html
js/app.js, js/data.js, js/calc-platform.js
css/styles.css
supabase/schema.sql
.github/workflows/pages.yml   ← déploiement Pages
.env.example                  ← modèle local
.env / config.js              ← locaux, gitignored
setup.mjs                     ← génère config.js en local
```

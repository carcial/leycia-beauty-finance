/**
 * Génère config.js depuis .env (une seule commande, aucune dépendance npm).
 * Usage : node setup.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, ".env");
const outPath = path.join(root, "config.js");

if (!fs.existsSync(envPath)) {
  console.error("Fichier .env introuvable. Copiez .env.example vers .env et remplissez vos clés Supabase.");
  process.exit(1);
}

const vars = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const i = trimmed.indexOf("=");
  if (i < 1) continue;
  vars[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
}

const url = vars.SUPABASE_URL || "";
const key = vars.SUPABASE_ANON_KEY || "";
if (!url || !key || url.includes("votre-projet") || key.includes("votre_cle")) {
  console.error("Renseignez SUPABASE_URL et SUPABASE_ANON_KEY dans .env");
  process.exit(1);
}

const content = `// Généré par setup.mjs — ne pas committer (voir .gitignore)\nconst SUPABASE_URL = ${JSON.stringify(url)};\nconst SUPABASE_ANON_KEY = ${JSON.stringify(key)};\n`;
fs.writeFileSync(outPath, content, "utf8");
console.log("config.js créé avec succès.");

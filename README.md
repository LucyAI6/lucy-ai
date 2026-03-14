# Lucy AI — Guide de déploiement

## Prérequis
- Compte GitHub (github.com) — gratuit
- Compte Vercel (vercel.com) — gratuit

---

## Étape 1 — Mettre le code sur GitHub

1. Va sur **github.com** → clique **"New repository"**
2. Nom : `lucy-ai` → clique **"Create repository"**
3. Clique **"uploading an existing file"**
4. Glisse-dépose TOUS les fichiers du dossier `lucy-app` (sauf `.env.local`)
5. Clique **"Commit changes"**

---

## Étape 2 — Déployer sur Vercel

1. Va sur **vercel.com** → connecte-toi avec GitHub
2. Clique **"Add New Project"**
3. Importe ton repository `lucy-ai`
4. **AVANT de déployer**, clique **"Environment Variables"** et ajoute :

| Variable | Valeur |
|---|---|
| `AIRTABLE_API_KEY` | ta clé Airtable |
| `AIRTABLE_BASE_ID` | ton ID de base |
| `AIRTABLE_TABLE_NAME` | `IA Lucy Base` |
| `ANTHROPIC_API_KEY` | ta clé Claude |
| `REPLICATE_API_KEY` | ta clé Replicate |
| `NEXT_PUBLIC_CONTACT_EMAIL` | ton email pour recevoir les commandes |

5. Clique **"Deploy"**
6. Lucy est en ligne ! ✅

---

## Mises à jour futures

Pour modifier le code, modifie les fichiers sur GitHub → Vercel redéploie automatiquement.

---

## Structure du projet

```
lucy-app/
├── pages/
│   ├── index.js          ← Interface utilisateur
│   └── api/
│       ├── chat.js       ← Connexion Claude (cerveau IA)
│       ├── components.js ← Connexion Airtable (base composants)
│       └── render.js     ← Connexion Replicate (génération image)
├── styles/
│   └── globals.css       ← Styles globaux
├── package.json
├── next.config.js
└── .env.local            ← Variables API (ne jamais mettre sur GitHub)
```

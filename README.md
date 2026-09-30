# Galerie H360 — site statique des illustrations

Bibliothèque visuelle officielle H360 : **logos, couvertures vidéo, captures et visuels de
campagne**, chacun avec son titre, sa légende (français), ses tags et ses métadonnées.

Le site est **100 % statique** (HTML/CSS/JS, aucun PHP, aucune base de données) et conçu pour
être **couplé à [Pomelli](https://labs.google.com/pomelli/website)** (Google Labs) : textes
riches, extraits structurés (`asset-manifest.json`, `data/galerie.json`, `llms.txt`) et
boutons « Copier pour Pomelli » partout.

> 🌍 **En ligne** : **https://dilevembamu12.github.io/h360-galerie/** —
> dépôt public `dilevembamu12/h360-galerie` (GitHub Pages). Mise à jour :
> `bash tools/publish-github.sh`.

---

## 1. Aperçu rapide

```bash
# depuis ce dossier (GALERIE-H360/)
python3 -m http.server 8090        # → http://localhost:8090
# ou simplement ouvrir index.html dans un navigateur (les fichiers restent lisibles)
```

---

## 2. Arborescence

```
GALERIE-H360/
├─ index.html              ← le site (grille injectée par le build)
├─ .nojekyll · .github/workflows/pages.yml  ← déploiement GitHub Pages
├─ asset-manifest.json     ← inventaire machine (Pomelli & autres outils)
├─ llms.txt · robots.txt · sitemap.xml (si base_url renseignée)
├─ assets/                 ← app.css · app.js · police Inter · favicons · og-cover.png
├─ data/                   ← galerie.json + galerie.js (générés)
├─ media/                  ← les visuels prêts pour le web (générés)
│   ├─ logos/ covers/ captures/ application/ production/
│   └─ thumbs/             ← miniatures 640 px utilisées par la grille
└─ tools/
    ├─ sources.json        ← ⭐ LA source de vérité : liste des visuels + légendes
    ├─ build.mjs           ← script de construction
    ├─ rebuild.sh          ← raccourci (bash tools/rebuild.sh)
    └─ publish-github.sh   ← publication GitHub Pages (bash tools/publish-github.sh)
```

**Règle d'or** : les fichiers originaux restent dans leurs projets
(`BRANDING/logo/`, `onboarding-videos/…`). La galerie en garde une **copie web** dans
`media/`, et `tools/sources.json` retient le chemin source pour tout régénérer.

---

## 3. Ajouter / modifier un visuel

1. Déposez le fichier dans son projet d'origine (jamais recréer un logo : `BRANDING/logo/`).
2. Ajoutez une entrée dans `tools/sources.json` :

```json
{
  "slug": "mon-nouveau-visuel",
  "category": "captures",
  "kind": "image",
  "title": "Titre du visuel",
  "caption": "La légende en français — c'est ce texte que Pomelli et les supports réutilisent.",
  "alt": "Description pour l'accessibilité.",
  "tags": ["thème", "usage"],
  "usage": "Où l'utiliser.",
  "date": "2026-09-30",
  "credit": "© H360",
  "source": "../../../chemin/vers/le/fichier.png",
  "out": "mon-nouveau-visuel.png"
}
```

3. Relancez le build :

```bash
bash tools/rebuild.sh            # = node tools/build.mjs
```

> Pour une **couverture vidéo**, `kind: "video"` + `video_source` (chemin du MP4) + `cover_at`
> (instant en secondes) : le build extrait lui-même l'image. Ex. : `"cover_at": "98"`.

**Prérequis du build** : Node ≥ 18, `ffmpeg`/`ffprobe`, ImageMagick (`convert`).
Options : `--with-videos` (copie aussi les MP4 dans `media/videos/` — lourd),
`--force-covers` (ré-extrait toutes les covers vidéo).

---

## 4. Coupler la galerie avec Pomelli

1. **Publier** le dossier (voir §5) → une URL publique. La galerie est déjà en ligne sur
   **https://dilevembamu12.github.io/h360-galerie/**.
2. `tools/sources.json` → `site.base_url` contient déjà cette URL : en cas de changement de
   domaine, mettez-la à jour puis relancez le build — le `sitemap.xml`, `robots.txt` et les
   URL absolues du manifeste suivent automatiquement.
3. Ouvrez [labs.google.com/pomelli/website](https://labs.google.com/pomelli/website), lancez une
   création et **donnez l'URL de la galerie** : Pomelli y lit l'identité H360 (couleurs, ton,
   visuels) et s'en sert pour générer des contenus de marque.
4. Pour les briefs manuels : dans la galerie, chaque visuel propose
   « **Copier la légende** » et « **Copier pour Pomelli** » (titre + légende + tags + fichier).
   La section « Coupler avec Pomelli » propose aussi un **brief de marque complet** à copier.
5. Fichiers machine disponibles à la racine du site : `asset-manifest.json`,
   `data/galerie.json`, `llms.txt` (utile si l'outil accepte un fichier de référence).

---

## 5. Déployer (exemples)

**Nginx / aaPanel** (site statique classique) :

```nginx
server {
    listen 80;
    server_name galerie.h360.local;      # ou votre domaine réel
    root /chemin/vers/GALERIE-H360;
    index index.html;
    try_files $uri $uri/ =404;
}
```

**GitHub Pages (officiel)** — dépôt public `dilevembamu12/h360-galerie` :
**https://dilevembamu12.github.io/h360-galerie/**

```bash
bash tools/publish-github.sh     # snapshot → commit → push → Pages (idempotent)
```

Le script pousse un **snapshot complet** (force-push : le dépôt distant est un **miroir
généré** — ne l'éditez jamais en ligne, travaillez ici puis republiez). Le déploiement est
pris en charge par `.github/workflows/pages.yml` (Actions) : au premier push, le workflow
**active GitHub Pages** puis publie le site — aucun réglage manuel. Premier déploiement :
~1 min. **Netlify / Vercel** restent possibles (build : aucun, dossier : racine).

> ⚠️ La création du dépôt exige un droit que le jeton `gh` actuel n'a pas : si le dépôt
> `h360-galerie` n'existe pas encore, créez-le **une fois** sur https://github.com/new
> (public, sans README), puis relancez le script.

> ℹ️ Le reste de `H360-Administration` reste **privé** ; la galerie, elle, est volontairement
> **publique** (requis pour le couplage Pomelli) : uniquement des visuels de campagne destinés
> à la diffusion. Les mentions provisoires de la publicité (WhatsApp, domaine) seront mises à
> jour puis republiées.

---

## 6. Notes & pièges connus

- **Coordonnées provisoires** : la carte de fin de la publicité contient encore
  « WhatsApp : [à compléter] » et « h360.cd — à confirmer ». À mettre à jour dans la vidéo,
  puis relancer la cover (`--force-covers`).
- **Police** : Inter est copiée depuis `onboarding-videos/publicite-h360-business/shared/fonts/`
  (licence libre OFL). La police officielle reste à valider (voir charte graphique).
- **Couleurs** : l'orange circule en deux valeurs dans les fichiers historiques
  (`#FF7900` et `#F48018`) — la galerie retient **#FF7900** (recommandation de la charte,
  à valider par le fondateur).
- **Sous-module git** : ce dossier vit dans `H360-Administration` (dépôt privé). Committer
  `media/`, `data/` et les fichiers générés permet un déploiement direct sans rebuild.
- **Vidéo** : par défaut les MP4 ne sont pas copiés (poids) ; la cover renvoie vers le projet
  source dans ses métadonnées. Utiliser `--with-videos` si une version jouable en ligne est
  nécessaire.

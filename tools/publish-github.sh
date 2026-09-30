#!/usr/bin/env bash
# =============================================================================
# Publie la galerie H360 sur GitHub Pages (dépôt public dilevembamu12/h360-galerie).
# Snapshot complet → commit → push (force : le dépôt distant est un miroir généré)
# → activation / mise à jour de GitHub Pages. Idempotent : relançable à volonté.
#
#   bash tools/publish-github.sh
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="dilevembamu12/h360-galerie"
BRANCH="main"
URL="https://dilevembamu12.github.io/h360-galerie/"

command -v gh >/dev/null 2>&1 || { echo "✗ gh CLI requis (https://cli.github.com)"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✗ gh non connecté — lancez : gh auth login"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "== 1/5. Snapshot de la galerie =="
mkdir -p "$WORK/gallery"
cp -a . "$WORK/gallery/"
rm -rf "$WORK/gallery/.git"
cd "$WORK/gallery"

echo "== 2/5. Commit local =="
git init -q -b "$BRANCH"
git add -A
git -c user.name="H360 Galerie" -c user.email="h360@h360.cd" \
    commit -q -m "Galerie H360 — snapshot du $(date +%F)"
echo "  $(git rev-list --count HEAD) commit(s) local(aux), $(du -sh . | cut -f1) de contenu"

echo "== 3/5. Dépôt GitHub =="
# Détection fiable SANS jeton : l'accès SSH suffit (le token gh peut, lui,
# ne pas « voir » le dépôt selon son périmètre d'accès).
if git ls-remote "git@github.com:$REPO.git" >/dev/null 2>&1; then
  echo "  dépôt présent (accessible en SSH)"
else
  if gh repo create "$REPO" --public \
      --description "Galerie H360 — site statique des illustrations (GitHub Pages)" >/dev/null 2>&1; then
    echo "  dépôt créé"
  else
    echo "✗ Dépôt introuvable et création impossible avec le token gh actuel."
    echo "  → Créez-le à la main (30 secondes) : https://github.com/new"
    echo "      • Repository name : h360-galerie"
    echo "      • Visibility      : Public"
    echo "      • Ne cochez NI README, NI .gitignore, NI licence."
    echo "  → Puis relancez : bash tools/publish-github.sh"
    exit 1
  fi
fi

echo "== 4/5. Push =="
git remote add origin "git@github.com:$REPO.git"
git push --force -u origin "$BRANCH" -q && echo "  poussé vers $REPO@$BRANCH"

echo "== 5/5. GitHub Pages =="
echo "  Déploiement pris en charge par .github/workflows/pages.yml (Actions)."
echo "  Au premier push, le workflow ACTIVE Pages puis publie le site."
gh repo edit "$REPO" --homepage "$URL" >/dev/null 2>&1 || true
gh run list -R "$REPO" --limit 3 2>/dev/null || true

echo
echo "✅ Site publié : $URL"
echo "   (le premier déploiement GitHub Pages prend ~1 minute)"

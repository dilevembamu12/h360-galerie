#!/usr/bin/env bash
# H360 — Galerie : reconstruit le site (médias + données + injections).
# Usage : bash tools/rebuild.sh [--with-videos] [--force-covers]
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/build.mjs "$@"

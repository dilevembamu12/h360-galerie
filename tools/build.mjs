#!/usr/bin/env node
/**
 * H360 — Galerie : script de construction.
 *
 * Lit tools/sources.json, prépare les médias (copie / conversion / extraction
 * des couvertures vidéo / miniatures), puis génère :
 *   - data/galerie.json + data/galerie.js   (données du site)
 *   - asset-manifest.json                   (inventaire machine, pour Pomelli/IA)
 *   - la grille et les statistiques injectées dans index.html (marqueurs)
 *   - assets/og-cover.png, assets/favicon-*.png
 *   - robots.txt + sitemap.xml (si site.base_url renseigné)
 *
 * Usage :  node tools/build.mjs [--with-videos] [--force-covers]
 * Prérequis : node >= 18, ffmpeg/ffprobe, ImageMagick (convert).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const WITH_VIDEOS = args.includes('--with-videos');
const FORCE_COVERS = args.includes('--force-covers');

/* ---------------------------------------------------------------- helpers */

function sh(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function requireTool(cmd) {
  try { sh('which', [cmd]); } catch {
    console.error(`✗ Outil manquant : « ${cmd} ». Installez-le puis relancez le build.`);
    process.exit(1);
  }
}
function probeDims(file) {
  const out = sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).trim().split(',').map(Number);
  return { width: out[0], height: out[1] };
}
function probeDuration(file) {
  const out = sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', file]).trim();
  return parseFloat(out) || 0;
}
function humanDuration(s) {
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m} min ${String(sec).padStart(2, '0')}` : `${sec} s`;
}
function humanBytes(b) {
  if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
  if (b >= 1024) return Math.round(b / 1024) + ' Ko';
  return b + ' o';
}
function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) { return esc(str).replace(/\n/g, ' '); }
function frDate(iso) {
  if (!iso) return '';
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.',
    'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${months[m - 1]} ${y}`;
}

/* ------------------------------------------------------------- chargement */

requireTool('ffmpeg');
requireTool('ffprobe');
requireTool('convert');

const sources = JSON.parse(readFileSync(join(ROOT, 'tools', 'sources.json'), 'utf8'));
const warnings = [];
const items = [];

mkdirSync(join(ROOT, 'media', 'thumbs'), { recursive: true });
mkdirSync(join(ROOT, 'assets'), { recursive: true });

/* --------------------------------------------------------- préparation des médias */

for (const src of sources.items) {
  const catDir = join(ROOT, 'media', src.category);
  mkdirSync(catDir, { recursive: true });
  const outName = src.out || `${src.slug}.jpg`;
  const outFull = join(catDir, outName);
  const outExt = extname(outName).slice(1).toLowerCase();

  let inputPath = null;
  let videoMeta = null;

  try {
    if (src.kind === 'video') {
      inputPath = resolve(ROOT, src.video_source);
      if (!existsSync(inputPath)) throw new Error(`vidéo introuvable : ${src.video_source}`);
      const duration = probeDuration(inputPath);
      videoMeta = {
        duration: Math.round(duration),
        durationHuman: humanDuration(duration),
        res: src.video_res || '',
        project: src.project || '',
      };
      if (!existsSync(outFull) || FORCE_COVERS) {
        console.log(`  ↳ cover : ${src.slug} @ ${src.cover_at}s`);
        sh('ffmpeg', ['-y', '-v', 'error', '-ss', String(src.cover_at), '-i', inputPath,
          '-frames:v', '1', '-q:v', '2', outFull]);
      }
    } else {
      inputPath = resolve(ROOT, src.source);
      if (!existsSync(inputPath)) throw new Error(`image introuvable : ${src.source}`);
      const srcExt = extname(inputPath).slice(1).toLowerCase();
      const needConvert = src.convert === 'jpg' || src.convert === 'png' || srcExt !== outExt;
      if (needConvert) {
        if (outExt === 'jpg') {
          sh('convert', [inputPath, '-background', '#0B1526', '-flatten', '-quality', '92', outFull]);
        } else {
          sh('convert', [inputPath, outFull]);
        }
      } else if (!existsSync(outFull) || statSync(inputPath).mtimeMs > statSync(outFull).mtimeMs) {
        copyFileSync(inputPath, outFull);
      }
    }

    if (!existsSync(outFull)) throw new Error(`sortie non générée : ${outName}`);

    // Miniature (640 px de large max)
    const thumbName = `${src.slug}.${outExt === 'png' ? 'png' : 'jpg'}`;
    const thumbPath = join(ROOT, 'media', 'thumbs', thumbName);
    if (outExt === 'png') {
      sh('convert', [outFull, '-resize', '640x>', '-strip', thumbPath]);
    } else {
      sh('convert', [outFull, '-resize', '640x>', '-strip', '-quality', '82', thumbPath]);
    }

    // Vidéo locale optionnelle
    let videoUrl = null;
    if (src.kind === 'video' && WITH_VIDEOS) {
      const vdir = join(ROOT, 'media', 'videos');
      mkdirSync(vdir, { recursive: true });
      const vfile = join(vdir, `${src.slug}.mp4`);
      if (!existsSync(vfile)) copyFileSync(inputPath, vfile);
      videoUrl = `media/videos/${src.slug}.mp4`;
    }

    const dims = probeDims(outFull);
    const bytes = statSync(outFull).size;

    items.push({
      slug: src.slug,
      category: src.category,
      kind: src.kind || 'image',
      title: src.title,
      caption: src.caption,
      alt: src.alt || src.title,
      tags: src.tags || [],
      usage: src.usage || '',
      note: src.note || '',
      date: src.date || '',
      dateHuman: frDate(src.date),
      credit: src.credit || '© H360',
      file: `media/${src.category}/${outName}`,
      thumb: `media/thumbs/${thumbName}`,
      width: dims.width,
      height: dims.height,
      bytes,
      bytesHuman: humanBytes(bytes),
      duration: videoMeta ? videoMeta.duration : null,
      durationHuman: videoMeta ? videoMeta.durationHuman : '',
      videoRes: videoMeta ? videoMeta.res : '',
      project: videoMeta ? videoMeta.project : '',
      videoUrl,
      sourceRef: src.kind === 'video' ? src.video_source : src.source,
    });
  } catch (err) {
    warnings.push(`${src.slug} : ${err.message}`);
    console.warn(`  ⚠ ${src.slug} ignoré — ${err.message}`);
  }
}

/* --------------------------------------------------------------- données */

const catOrder = sources.categories.map((c) => c.id);
const categories = sources.categories.map((c) => ({
  ...c,
  count: items.filter((i) => i.category === c.id).length,
}));

const today = new Date().toISOString().slice(0, 10);
const data = {
  generated: new Date().toISOString(),
  generatedHuman: frDate(today),
  site: sources.site,
  brand: sources.brand,
  categories,
  stats: {
    items: items.length,
    videos: items.filter((i) => i.kind === 'video').length,
    categories: categories.length,
    updatedHuman: frDate(today),
  },
  items,
};

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data', 'galerie.json'), JSON.stringify(data, null, 2) + '\n');
writeFileSync(join(ROOT, 'data', 'galerie.js'),
  '/* Généré par tools/build.mjs — ne pas éditer à la main. */\n' +
  'window.H360_GALERIE = ' + JSON.stringify(data, null, 2) + ';\n');

// Inventaire machine (Pomelli & autres outils)
const manifest = {
  format: 'H360 asset manifest',
  version: 1,
  generated: data.generated,
  language: sources.site.lang || 'fr',
  site: sources.site,
  brand: sources.brand,
  categories,
  stats: data.stats,
  howToUse: [
    'Chaque entrée décrit un visuel : title (titre), caption (légende réutilisable), tags, fichier (chemin relatif au site), dimensions, poids.',
    'Les légendes sont en français et libres de réutilisation pour les supports H360.',
    'site.base_url renseigné ⇒ les fichiers sont aussi exposés via « url ».',
  ],
  items: items.map((i) => ({
    slug: i.slug,
    category: i.category,
    kind: i.kind,
    title: i.title,
    caption: i.caption,
    alt: i.alt,
    tags: i.tags,
    usage: i.usage,
    date: i.date,
    credit: i.credit,
    file: i.file,
    url: sources.site.base_url ? `${sources.site.base_url.replace(/\/$/, '')}/${i.file}` : '',
    thumb: i.thumb,
    width: i.width,
    height: i.height,
    bytes: i.bytes,
    duration: i.duration,
    durationHuman: i.durationHuman,
    videoRes: i.videoRes,
    project: i.project,
    sourceRef: i.sourceRef,
  })),
};
writeFileSync(join(ROOT, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

/* --------------------------------------------- injection dans index.html */

const byCat = (id) => items.filter((i) => i.category === id);
const catLabel = new Map(categories.map((c) => [c.id, c.label]));

const cardsHtml = catOrder.map((cat) => byCat(cat).map((it) => {
  const searchBlob = [it.title, it.caption, it.tags.join(' '), it.alt].join(' ').toLowerCase();
  const badge = it.kind === 'video' && it.durationHuman
    ? `<span class="card-badge">▶ ${esc(it.durationHuman)}</span>` : '';
  return `        <article class="card" data-slug="${escAttr(it.slug)}" data-category="${escAttr(it.category)}" data-kind="${escAttr(it.kind)}" data-search="${escAttr(searchBlob)}">
          <a class="card-media" href="${escAttr(it.file)}" data-lightbox="${escAttr(it.slug)}" aria-label="Agrandir : ${escAttr(it.title)}">
            <img src="${escAttr(it.thumb)}" alt="${escAttr(it.alt)}" loading="lazy" width="${it.width}" height="${it.height}">
            ${badge}
          </a>
          <div class="card-body">
            <div class="card-meta">
              <span class="chip">${esc(catLabel.get(it.category) || it.category)}</span>
              <span class="card-dims">${it.width} × ${it.height}</span>
            </div>
            <h3 class="card-title"><a href="${escAttr(it.file)}" data-lightbox="${escAttr(it.slug)}">${esc(it.title)}</a></h3>
            <p class="card-caption">${esc(it.caption)}</p>
            <div class="card-actions">
              <a class="btn btn-ghost btn-sm" href="${escAttr(it.file)}" download>Télécharger</a>
              <button type="button" class="btn btn-ghost btn-sm" data-copy-caption="${escAttr(it.slug)}">Copier la légende</button>
            </div>
          </div>
        </article>`;
}).join('\n')).join('\n');

const statsHtml = [
  `<span class="stat"><strong>${data.stats.items}</strong> visuels</span>`,
  `<span class="stat"><strong>${data.stats.videos}</strong> couvertures vidéo</span>`,
  `<span class="stat"><strong>${data.stats.categories}</strong> catégories</span>`,
  `<span class="stat stat-dim">Mise à jour&nbsp;: ${esc(data.stats.updatedHuman)}</span>`,
].join('\n        ');

const indexPath = join(ROOT, 'index.html');
if (existsSync(indexPath)) {
  let html = readFileSync(indexPath, 'utf8');
  html = html.replace(/(<!-- GALLERY:START -->)[\s\S]*?(<!-- GALLERY:END -->)/,
    (_m, a, b) => `${a}\n${cardsHtml}\n        ${b}`);
  html = html.replace(/(<!-- STATS:START -->)[\s\S]*?(<!-- STATS:END -->)/,
    (_m, a, b) => `${a}\n        ${statsHtml}\n        ${b}`);
  // Compteurs de filtre (pills) — les valeurs sont aussi dans galerie.js, mais
  // on pré-remplit le squelette « Tout » pour un rendu sans JS.
  html = html.replace(/(<!-- COUNT:ALL:START -->)[\s\S]*?(<!-- COUNT:ALL:END -->)/,
    (_m, a, b) => `${a}${data.stats.items}${b}`);
  writeFileSync(indexPath, html);
  console.log('✓ index.html : grille + statistiques injectées');
} else {
  warnings.push('index.html absent — grille non injectée (créez-le puis relancez).');
}

/* ------------------------------------------------------ OG image + favicons */

const logoBlanc = join(ROOT, '..', 'BRANDING', 'logo', '2026-09-24_logo-h360_blanc_v1.png');
const logoFondBleu = join(ROOT, '..', 'BRANDING', 'logo', '2026-09-24_logo-h360_fond-bleu_v1.png');
if (existsSync(logoBlanc)) {
  sh('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x1665C0:s=1200x630',
    '-i', logoBlanc, '-filter_complex', '[1:v]scale=380:-1[lg];[0:v][lg]overlay=(W-w)/2:(H-h)/2',
    '-frames:v', '1', join(ROOT, 'assets', 'og-cover.png')]);
  console.log('✓ assets/og-cover.png');
}
if (existsSync(logoFondBleu)) {
  sh('convert', [logoFondBleu, '-resize', '32x32', join(ROOT, 'assets', 'favicon-32.png')]);
  sh('convert', [logoFondBleu, '-resize', '180x180', join(ROOT, 'assets', 'favicon-180.png')]);
  console.log('✓ favicons');
}

/* ------------------------------------------------------------ police locale */

const fontSrc = resolve(ROOT, '../../../onboarding-videos/publicite-h360-business/shared/fonts/inter-var.woff2');
const fontDst = join(ROOT, 'assets', 'fonts', 'inter-var.woff2');
if (existsSync(fontSrc)) {
  mkdirSync(dirname(fontDst), { recursive: true });
  if (!existsSync(fontDst)) { copyFileSync(fontSrc, fontDst); console.log('✓ police Inter copiée'); }
}

/* ------------------------------------------------------ robots + sitemap */

const base = (sources.site.base_url || '').replace(/\/$/, '');
let robots = 'User-agent: *\nAllow: /\n\n' +
  '# Inventaires lisibles par les outils et assistants IA :\n' +
  '# /asset-manifest.json — /data/galerie.json — /llms.txt\n';
if (base) {
  robots += `\nSitemap: ${base}/sitemap.xml\n`;
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `  <url><loc>${base}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n` +
    '</urlset>\n';
  writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);
  console.log('✓ sitemap.xml');
} else {
  robots = robots.replace('# /asset-manifest.json — /data/galerie.json — /llms.txt\n',
    '# /asset-manifest.json — /data/galerie.json — /llms.txt\n' +
    '# (Renseignez site.base_url dans tools/sources.json pour générer sitemap.xml)\n');
}
writeFileSync(join(ROOT, 'robots.txt'), robots);

/* ---------------------------------------------------------------- résumé */

console.log('');
console.log('── Galerie H360 — build terminé ─────────────────────────');
console.log(`  Visuels : ${items.length} (${data.stats.videos} covers vidéo)`);
console.log(`  Médias  : media/ · miniatures media/thumbs/`);
console.log(`  Données : data/galerie.json · data/galerie.js · asset-manifest.json`);
const totalBytes = items.reduce((a, i) => a + i.bytes, 0);
console.log(`  Poids total médias : ${humanBytes(totalBytes)}`);
if (warnings.length) {
  console.log(`  ⚠ ${warnings.length} avertissement(s) :`);
  warnings.forEach((w) => console.log(`    - ${w}`));
  process.exitCode = warnings.some((w) => !w.startsWith('index.html')) ? 1 : 0;
} else {
  console.log('  ✓ Aucun avertissement.');
}

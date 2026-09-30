/* ==========================================================================
   Galerie H360 — interactions (filtres, recherche, lightbox, copie)
   Vanilla JS — aucune dépendance. Le site reste lisible sans JavaScript.
   ========================================================================== */
(function () {
  'use strict';

  var DATA = window.H360_GALERIE;
  var grid = document.getElementById('grid');
  if (!grid) return;

  /* ------------------------------------------------------------- utilitaires */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function flashButton(btn, label) {
    if (!btn) return;
    var original = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', original);
    btn.textContent = label || 'Copié ✓';
    btn.classList.add('is-copied');
    window.setTimeout(function () {
      btn.textContent = original;
      btn.classList.remove('is-copied');
    }, 1600);
  }

  if (!DATA || !DATA.items) {
    console.warn('Galerie H360 : données absentes (data/galerie.js) — exécutez tools/build.mjs.');
    return;
  }

  var itemsBySlug = {};
  DATA.items.forEach(function (it) { itemsBySlug[it.slug] = it; });
  var catLabels = {};
  (DATA.categories || []).forEach(function (c) { catLabels[c.id] = c.label; });

  /* ------------------------------------------------------------ date pied de page */

  var genDate = document.getElementById('genDate');
  if (genDate && DATA.generatedHuman) genDate.textContent = DATA.generatedHuman;

  /* ------------------------------------------------------------------- filtres */

  var pillsBox = document.getElementById('pills');
  var searchInput = document.getElementById('search');
  var resultCount = document.getElementById('resultCount');
  var emptyState = document.getElementById('emptyState');
  var activeCat = 'all';
  var activeQuery = '';

  if (pillsBox && DATA.categories) {
    pillsBox.innerHTML = '';
    var allPill = document.createElement('button');
    allPill.type = 'button';
    allPill.className = 'pill is-active';
    allPill.setAttribute('data-cat', 'all');
    allPill.setAttribute('aria-pressed', 'true');
    allPill.innerHTML = 'Tout <span class="pill-n">' + DATA.stats.items + '</span>';
    pillsBox.appendChild(allPill);

    DATA.categories.forEach(function (cat) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pill';
      b.setAttribute('data-cat', cat.id);
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = cat.label + ' <span class="pill-n">' + cat.count + '</span>';
      pillsBox.appendChild(b);
    });

    pillsBox.addEventListener('click', function (ev) {
      var pill = ev.target.closest('.pill');
      if (!pill) return;
      activeCat = pill.getAttribute('data-cat');
      $all('.pill', pillsBox).forEach(function (p) {
        var active = p === pill;
        p.classList.toggle('is-active', active);
        p.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      applyFilters();
    });
  }

  if (searchInput) {
    var debounce = null;
    searchInput.addEventListener('input', function () {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(function () {
        activeQuery = searchInput.value.trim().toLowerCase();
        applyFilters();
      }, 140);
    });
  }

  function cardMatches(card, tokens) {
    for (var i = 0; i < tokens.length; i++) {
      if (card.getAttribute('data-search').indexOf(tokens[i]) === -1) return false;
    }
    return true;
  }

  function applyFilters() {
    var cards = $all('.card', grid);
    var tokens = activeQuery ? activeQuery.split(/\s+/) : [];
    var visible = 0;

    cards.forEach(function (card) {
      var okCat = activeCat === 'all' || card.getAttribute('data-category') === activeCat;
      var okQuery = tokens.length === 0 || cardMatches(card, tokens);
      var show = okCat && okQuery;
      card.hidden = !show;
      if (show) visible++;
    });

    if (resultCount) {
      resultCount.hidden = false;
      resultCount.textContent = visible + (visible > 1 ? ' visuels affichés' : ' visuel affiché')
        + (activeCat !== 'all' && catLabels[activeCat] ? ' · ' + catLabels[activeCat] : '');
    }
    if (emptyState) emptyState.hidden = visible !== 0;
    closeLightbox();
  }

  /* ----------------------------------------------------------------- lightbox */

  var lb = document.getElementById('lightbox');
  var lbImage = document.getElementById('lbImage');
  var lbCat = document.getElementById('lbCat');
  var lbTitle = document.getElementById('lbTitle');
  var lbCaption = document.getElementById('lbCaption');
  var lbNote = document.getElementById('lbNote');
  var lbTags = document.getElementById('lbTags');
  var lbMeta = document.getElementById('lbMeta');
  var lbDownload = document.getElementById('lbDownload');
  var lbCopyCaption = document.getElementById('lbCopyCaption');
  var lbCopyBlock = document.getElementById('lbCopyBlock');
  var currentSlug = null;

  function visibleSlugs() {
    return $all('.card:not([hidden])', grid).map(function (c) { return c.getAttribute('data-slug'); });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function openLightbox(slug) {
    var it = itemsBySlug[slug];
    if (!it || !lb) return;
    currentSlug = slug;

    lbImage.src = it.file;
    lbImage.alt = it.alt || it.title;
    lbCat.textContent = catLabels[it.category] || it.category;
    lbTitle.textContent = it.title;
    lbCaption.textContent = it.caption;
    lbNote.textContent = it.note || '';
    lbNote.hidden = !it.note;

    lbTags.innerHTML = (it.tags || []).map(function (t) {
      return '<span class="lb-tag">' + escapeHtml(t) + '</span>';
    }).join('');

    var meta = [];
    meta.push(['Type', it.kind === 'video' ? 'Couverture vidéo' : 'Image']);
    if (it.kind === 'video') {
      if (it.durationHuman) meta.push(['Vidéo', it.durationHuman + (it.videoRes ? ' · ' + it.videoRes : '')]);
      if (it.project) meta.push(['Projet source', it.project]);
    }
    meta.push(['Format', it.width + ' × ' + it.height + ' px']);
    meta.push(['Poids', it.bytesHuman]);
    if (it.dateHuman) meta.push(['Date', it.dateHuman]);
    if (it.usage) meta.push(['Usage conseillé', it.usage]);
    meta.push(['Fichier galerie', '<code>' + escapeHtml(it.file) + '</code>']);
    meta.push(['Crédit', it.credit]);

    lbMeta.innerHTML = meta.map(function (row) {
      return '<dt>' + escapeHtml(row[0]) + '</dt><dd>' + row[1] + '</dd>';
    }).join('');

    lbDownload.href = it.file;
    lbDownload.setAttribute('download', it.file.split('/').pop());

    lb.hidden = false;
    document.body.classList.add('lb-open');

    var closeBtn = $('.lb-close', lb);
    if (closeBtn) closeBtn.focus();
  }

  function closeLightbox() {
    if (!lb || lb.hidden) return;
    lb.hidden = true;
    document.body.classList.remove('lb-open');
    currentSlug = null;
  }

  function stepLightbox(dir) {
    var slugs = visibleSlugs();
    if (!slugs.length || !currentSlug) return;
    var idx = slugs.indexOf(currentSlug);
    if (idx === -1) idx = 0;
    var next = (idx + dir + slugs.length) % slugs.length;
    openLightbox(slugs[next]);
  }

  grid.addEventListener('click', function (ev) {
    var trigger = ev.target.closest('[data-lightbox]');
    if (!trigger) return;
    ev.preventDefault();
    openLightbox(trigger.getAttribute('data-lightbox'));
  });

  if (lb) {
    $all('[data-lb-close]', lb).forEach(function (el) {
      el.addEventListener('click', closeLightbox);
    });
    var prevBtn = $('.lb-prev', lb);
    var nextBtn = $('.lb-next', lb);
    if (prevBtn) prevBtn.addEventListener('click', function () { stepLightbox(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { stepLightbox(1); });
  }

  document.addEventListener('keydown', function (ev) {
    if (!lb || lb.hidden) return;
    if (ev.key === 'Escape') closeLightbox();
    else if (ev.key === 'ArrowLeft') stepLightbox(-1);
    else if (ev.key === 'ArrowRight') stepLightbox(1);
  });

  /* -------------------------------------------------------------- copies */

  function pomelliBlock(it) {
    var lines = [];
    lines.push('Visuel H360 — ' + it.title);
    lines.push('Catégorie : ' + (catLabels[it.category] || it.category));
    if (it.kind === 'video') {
      lines.push('Type : couverture vidéo' + (it.durationHuman ? ' (vidéo : ' + it.durationHuman + ')' : ''));
    }
    lines.push('Légende : ' + it.caption);
    if (it.tags && it.tags.length) lines.push('Tags : ' + it.tags.join(', '));
    lines.push('Fichier : ' + it.file + ' (' + it.width + ' × ' + it.height + ' px, ' + it.bytesHuman + ')');
    return lines.join('\n');
  }

  // Boutons « Copier la légende » des cartes
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-copy-caption]');
    if (!btn) return;
    var it = itemsBySlug[btn.getAttribute('data-copy-caption')];
    if (!it) return;
    copyText(it.caption).then(function (ok) {
      flashButton(btn, ok ? 'Copié ✓' : 'Copie impossible');
    });
  });

  if (lbCopyCaption) {
    lbCopyCaption.addEventListener('click', function () {
      var it = itemsBySlug[currentSlug];
      if (!it) return;
      copyText(it.caption).then(function (ok) { flashButton(lbCopyCaption, ok ? 'Copié ✓' : 'Copie impossible'); });
    });
  }
  if (lbCopyBlock) {
    lbCopyBlock.addEventListener('click', function () {
      var it = itemsBySlug[currentSlug];
      if (!it) return;
      copyText(pomelliBlock(it)).then(function (ok) { flashButton(lbCopyBlock, ok ? 'Copié ✓' : 'Copie impossible'); });
    });
  }

  // Pastilles de couleur → copie du code hexadécimal
  $all('[data-copy-hex]').forEach(function (el) {
    el.addEventListener('click', function () {
      var hex = el.getAttribute('data-copy-hex');
      copyText(hex).then(function (ok) {
        el.classList.toggle('is-copied', ok);
        window.setTimeout(function () { el.classList.remove('is-copied'); }, 1400);
      });
    });
  });

  /* ------------------------------------------------------- brief de marque */

  var copyBrief = document.getElementById('copyBrief');
  if (copyBrief) {
    copyBrief.addEventListener('click', function () {
      var b = DATA.brand || {};
      var base = /^https?:/.test(window.location.protocol)
        ? window.location.href.replace(/[#?].*$/, '')
        : '(URL de la galerie une fois publiée)';
      var cats = (DATA.categories || []).map(function (c) { return c.label + ' (' + c.count + ')'; }).join(' · ');

      var lines = [
        'BRIEF DE MARQUE — H360',
        '',
        'Positionnement : ' + (b.about || ''),
        '',
        'Signatures :',
        '• « ' + (b.tagline || '') + ' »',
        '• « ' + (b.promise || '') + ' »',
        '• Appel à l’action : ' + (b.cta || ''),
        '',
        'Couleurs : ' + (b.colors || []).map(function (c) { return c.name + ' ' + c.hex; }).join(' · '),
        'Typographie : ' + (b.fonts || ''),
        '',
        'Galerie visuelle : ' + base,
        'Inventaire complet : ' + base + 'asset-manifest.json',
        'Visuels disponibles : ' + DATA.stats.items + ' — ' + cats,
        '',
        'Règles logo : trois versions (fond clair → couleur, fond sombre → blanc, fond incontrôlé → fond bleu). Ne jamais déformer, recolorer ou ajouter d’effet.'
      ];
      copyText(lines.join('\n')).then(function (ok) {
        flashButton(copyBrief, ok ? 'Brief copié ✓' : 'Copie impossible');
      });
    });
  }

  /* ------------------------------------------------------------------- init */

  applyFilters();
})();

'use strict';
// The Metro (2011) skin, from dashboard 2.0.15574 (the later Metro dashboards, up to 17559, change only details: a
// brighter green, a third row of small tiles at home, a focused tile that pops; so there is one Metro view) (skins/metro-v1/assets): the lowercase pivot of section names along
// the top, and under it a grid of square green tiles, two rows high, filled column by column. ←/→ walk the columns and,
// past the first or last one, change section (as LB/RB do); ↑/↓ move inside a column. Game covers are portrait, so the
// library's tiles keep the grid's height and take the cover's width. Measured on a 1280×720 capture, in vw/vh.
(function (root) {
  const A = 'skins/metro-v1/assets/';
  const ICONS = { console: 'icon-console', settings: 'icon-settings', folder: 'icon-folder', profiles: 'icon-profiles', games: 'icon-games', download: 'icon-download', more: 'icon-advanced', themes: 'icon-themes', sound: 'icon-sound', camera: 'icon-camera', family: 'icon-family', desktop: 'icon-desktop' };
  const ROWS = 2, TOP = 30.8, TILE = 20.83, GAP = .42, LEFT = 14.7, RIGHT = 85.3, COVER = .72; // TILE and GAP in vh
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function img(className, src) { const node = el('img', className); node.alt = ''; node.draggable = false; if (src) node.src = src; return node; }
  function createMetroSkin() {
    let reduced = false, parts = {}, added = [], view = null, scroll = 0, onResize = null;
    const body = () => document.body;
    function build() {
      const rootNode = el('div', 'mt-root'); rootNode.id = 'metro-root';
      parts.pivot = el('div', 'mt-pivot');
      parts.grid = el('div', 'mt-grid');
      parts.caption = el('div', 'mt-caption'); parts.captionTitle = el('div', 'mt-caption-title'); parts.captionText = el('div', 'mt-caption-text'); parts.caption.append(parts.captionTitle, parts.captionText);
      parts.legend = el('div', 'mt-legend');
      rootNode.append(img('mt-background', `${A}background.jpg`), parts.pivot, parts.grid, parts.caption, parts.legend);
      document.body.prepend(rootNode);
      added = [rootNode];
    }
    function tile(item, kind) {
      const card = el('div', `mt-tile${kind === 'rail' ? ' mt-cover-tile' : ''}`);
      if (kind === 'rail') {
        const cover = img('mt-cover', item.art || `${A}boxart.jpg`);
        cover.onerror = () => { cover.onerror = null; cover.src = `${A}boxart.jpg`; card.classList.add('mt-no-art'); };
        card.append(cover);
        if (!item.art) { card.classList.add('mt-no-art'); card.append(el('div', 'mt-label', item.title)); }
      } else {
        card.append(img('mt-icon', `${A}${ICONS[item.icon] || 'icon-settings'}.png`), el('div', 'mt-label', item.title));
      }
      return card;
    }
    // Columns of ROWS tiles; the grid is centred when it fits between the pivot's margins, and otherwise scrolls just
    // enough to keep the focused column inside them.
    function layout() {
      if (!view) return;
      const vw = innerWidth / 100, vh = innerHeight / 100, size = TILE * vh, gap = GAP * vh;
      const width = view.kind === 'rail' ? size * COVER : size, step = width + gap;
      const cards = [...parts.grid.children], columns = Math.ceil(cards.length / ROWS), total = columns * step - gap;
      const left = LEFT * vw, right = RIGHT * vw, column = Math.floor(view.index / ROWS);
      if (total <= right - left) scroll = (innerWidth - total) / 2;
      else {
        const x = scroll + column * step;
        if (x < left) scroll = left - column * step;
        if (x + width > right) scroll = right - width - column * step;
        scroll = Math.min(left, Math.max(right - total, scroll));
      }
      cards.forEach((card, position) => {
        const x = scroll + Math.floor(position / ROWS) * step, y = TOP * vh + (position % ROWS) * (size + gap);
        card.style.width = `${width}px`; card.style.height = `${size}px`;
        card.style.transform = `translate(${x}px, ${y}px)`;
        card.classList.toggle('active', position === view.index);
        card.style.visibility = x > innerWidth || x + width < 0 ? 'hidden' : '';
      });
    }
    function captions() {
      const { items, index, caption, kind } = view, item = items[index], game = kind !== 'tiles' && !caption.empty;
      parts.captionTitle.textContent = caption.empty ? caption.title : kind === 'rail' ? item?.title || '' : '';
      parts.captionText.textContent = caption.empty ? caption.subtitle : kind === 'rail' ? item?.badge || '' : caption.subtitle;
      body()?.classList.toggle('empty-library', !!caption.empty);
      body()?.classList.toggle('section-tiles', kind === 'tiles');
      const key = (letter, text) => { const span = el('span', 'mt-key'); span.append(img('', `${A}button-${letter}.png`), el('span', '', text)); return span; };
      parts.legend.replaceChildren(key('a', 'Select'), ...(game ? [key('x', 'Game settings'), key('y', 'Options')] : []));
    }
    return {
      name: 'metro-v1',
      label: 'Metro (2011-2012)',
      since: 2011,
      about: { name: 'Metro', years: '2011–2012', blurb: 'The Metro redesign: a grid of covers under a lowercase header, in the style of Windows Phone.' },
      axis: 'grid',
      wrap: false, // the pivot stops at both ends, as on the original
      rows: () => ROWS,
      stylesheet: 'skins/metro-v1/metro-v1.css',
      boot: 'kinect',
      mount() {
        if (typeof document.body?.prepend !== 'function') return; // no real page to build in
        build(); onResize = () => layout(); addEventListener('resize', onResize);
        document.body.classList.add('metro');
      },
      unmount() {
        if (onResize) removeEventListener('resize', onResize);
        added.forEach(node => node.remove()); added = []; parts = {}; view = null;
        if (!document.body?.classList) return;
        document.body.classList.remove('metro', 'section-tiles', 'empty-library');
      },
      setMotion(value) { reduced = !!value; body()?.classList.toggle('reduce-motion', reduced); },
      // The pivot: every section by name, lowercase, the open one in white.
      showSections({ sections, active }) {
        if (!parts.pivot) return;
        parts.pivot.replaceChildren(...sections.map((section, index) => el('span', `mt-pivot-item${index === active ? ' open' : ''}`, section.label.toLowerCase())));
      },
      renderRail(section, items, index, caption, { direction = null } = {}) {
        if (!parts.grid) return;
        view = { items, index, caption, kind: section.kind };
        scroll = LEFT * innerWidth / 100;
        parts.grid.replaceChildren(...items.map(item => tile(item, section.kind)));
        body()?.classList.add('mt-still'); layout(); parts.grid.offsetWidth; body()?.classList.remove('mt-still');
        captions();
        const from = direction === 'left' || direction === 'up' ? -6 : 6;
        if (!reduced) parts.grid.animate?.([{ opacity: 0, transform: `translateX(${from}vw)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 320, easing: 'cubic-bezier(.2,.75,.25,1)' });
      },
      focusRail(section, items, index, caption) {
        if (!view) return;
        view = { items, index, caption, kind: section.kind };
        layout(); captions();
      },
      relayout: layout,
      setLaunch(visible, title = '') {
        document.getElementById('launch-overlay').classList.toggle('hidden', !visible);
        document.getElementById('launch-title').textContent = title;
      },
      applyTheme(state) {
        document.querySelectorAll('.controller-button').forEach(glyph => { const url = state.buttons?.[glyph.getAttribute('aria-label')]; glyph.classList.toggle('native-glyph', !!url); glyph.querySelector('img').src = url || 'assets/controller-buttons.jpg'; });
        const launchLogo = document.querySelector('#launch-overlay .brand-logo');
        if (launchLogo) { launchLogo.classList.remove('native-launch-orb'); launchLogo.replaceChildren(); }
      }
    };
  }
  root.NXE = root.NXE || {};
  root.NXE.createMetroSkin = createMetroSkin;
  if (root.NXE.skins) root.NXE.skins.register(createMetroSkin());
  if (typeof module !== 'undefined') module.exports = { createMetroSkin };
})(typeof window !== 'undefined' ? window : globalThis);

'use strict';
// The Kinect (2010) skin, from dashboard 2.0.13604 (skins/kinect/assets): the green "aura" with its white floor, the
// channel names stacked above the row (the ones already passed fade upward), and a row of white tiles with the green
// swoosh. The focused tile is the first one, full size; the rest wait at 78% to its right and the one before peeks
// in at the left edge. Measured on a 1280×720 capture of the original and kept in vw/vh.
(function (root) {
  const A = 'skins/kinect/assets/';
  // Settings tiles name a role; these are the matching pictograms of the 13604 dashboard (the grey 192 px tile icons,
  // and a few white ones from its menus, darkened to match).
  const ICONS = { console: 'icon-settings', settings: 'icon-settings', folder: 'icon-folder', profiles: 'icon-profiles', games: 'icon-gamelib', download: 'icon-internet', more: 'icon-advanced', themes: 'icon-themes', sound: 'icon-musiclib', camera: 'icon-picturelib', family: 'icon-consolecontrols', desktop: 'icon-pc' };
  const LIGHT = new Set(['icon-folder', 'icon-advanced', 'icon-themes', 'icon-pc', 'icon-internet']);
  const LEFT = 11.33, WIDTH = 32.66, TOP = 32.36, HEIGHT = 44.44, SMALL = .78, GAP = .4, LINE = 4.7;
  // Game covers are portrait, so their tiles are too: the ones waiting are narrow (a cover and a corner of the swoosh) and
  // only the focused one opens out to the full tile, with the cover on the left and the whole swoosh on the right.
  const COVER_WIDTH = 30, NARROW = .74; // focused tile width (vw); narrow tile width as a fraction of its height
  // The swoosh, drawn over a 418×320 tile: bands curving from the top right corner down to the bottom edge.
  const SWOOSH = `<svg class="kn-swoosh" viewBox="0 0 418 320" preserveAspectRatio="none" aria-hidden="true">
    <path d="M352 0 Q420 175 222 320 L418 320 L418 0 Z" fill="#c6e86a" opacity=".55"/>
    <path d="M368 0 Q428 185 250 320 L418 320 L418 0 Z" fill="#86c934"/>
    <path d="M386 0 Q436 195 290 320 L418 320 L418 0 Z" fill="#d4ec3a"/>
    <path d="M398 0 Q444 200 322 320 L418 320 L418 0 Z" fill="#9bd336"/>
    <path d="M408 0 Q450 210 360 320 L418 320 L418 0 Z" fill="#5fb526"/>
    <path d="M414 0 Q452 220 396 320 L418 320 L418 0 Z" fill="#8ccc2c"/>
  </svg>`;
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function img(className, src) { const node = el('img', className); node.alt = ''; node.draggable = false; if (src) node.src = src; return node; }
  // Where the tile at a distance from the focused one goes, and its size.
  function place(offset) {
    if (offset === 0) return { x: LEFT, scale: 1 };
    const small = WIDTH * SMALL;
    if (offset < 0) return { x: LEFT - GAP - small * -offset - GAP * (-offset - 1), scale: SMALL };
    return { x: LEFT + WIDTH + GAP + (offset - 1) * (small + GAP), scale: SMALL };
  }
  function createKinectSkin() {
    let reduced = false, parts = {}, added = [], view = null, onResize = null;
    const body = () => document.body;
    function build() {
      const rootNode = el('div', 'kn-root'); rootNode.id = 'kinect-root';
      const aura = img('kn-aura', `${A}background.jpg`), floor = img('kn-floor', `${A}floor.png`);
      parts.channels = el('div', 'kn-channels');
      parts.row = el('div', 'kn-row');
      parts.empty = el('div', 'kn-empty hidden'); parts.emptyTitle = el('div', 'kn-empty-title'); parts.emptyText = el('div', 'kn-empty-text'); parts.empty.append(parts.emptyTitle, parts.emptyText);
      parts.legend = el('div', 'kn-legend');
      const orb = el('div', 'kn-orb'); orb.append(img('', `${A}orb.png`));
      rootNode.append(aura, floor, parts.channels, parts.row, parts.empty, parts.legend, orb);
      document.body.prepend(rootNode);
      added = [rootNode];
    }
    function picture(item, kind) {
      if (item.art) {
        const cover = img('kn-cover', item.art);
        cover.onerror = () => { cover.onerror = null; cover.className = 'kn-icon'; cover.src = `${A}icon-disc.png`; };
        return cover;
      }
      const name = kind === 'tiles' ? ICONS[item.icon] || 'icon-settings' : 'icon-disc';
      if (!LIGHT.has(name)) return img('kn-icon', `${A}${name}.png`);
      // A white menu pictogram gets the grey gradient of the tile icons: the picture is only its shape.
      const shape = el('div', 'kn-icon kn-shape'); shape.style.webkitMaskImage = shape.style.maskImage = `url("${A}${name}.png")`; // set here, so the path is the page's
      return shape;
    }
    function tile(item, kind) {
      const card = el('div', `kn-tile${kind === 'rail' ? ' kn-portrait' : ''}`), face = el('div', 'kn-face');
      face.innerHTML = SWOOSH;
      face.append(picture(item, kind), el('div', 'kn-label', item.title));
      if (item.badge) face.append(el('div', 'kn-badge', item.badge));
      card.append(face, el('div', 'kn-shadow'));
      return card;
    }
    function layout() {
      if (!view) return;
      const { index, kind } = view;
      if (kind === 'rail') return layoutPortrait(index);
      [...parts.row.children].forEach((card, position) => {
        card.style.width = card.style.height = '';
        const offset = position - index, visible = offset >= -1 && offset <= 4;
        card.classList.toggle('active', offset === 0);
        card.classList.toggle('before', offset < 0);
        // Tiles far from the focus wait just off screen, so they slide in from the right place.
        const { x, scale } = place(Math.max(-2, Math.min(offset, 5)));
        card.style.transform = `translate(${x}vw, ${TOP + HEIGHT * (1 - scale) / 2}vh) scale(${scale})`;
        card.style.opacity = visible ? '' : '0';
        card.style.zIndex = String(20 - Math.abs(offset));
      });
    }
    // Portrait tiles in pixels: the focused one wide, the rest narrow, all centred on the same line.
    function layoutPortrait(index) {
      const vw = innerWidth / 100, vh = innerHeight / 100, h0 = HEIGHT * vh, h1 = h0 * SMALL, w0 = COVER_WIDTH * vw, w1 = h1 * NARROW, gap = GAP * vw;
      [...parts.row.children].forEach((card, position) => {
        const offset = position - index, near = Math.max(-2, Math.min(offset, 14));
        const [w, h] = offset === 0 ? [w0, h0] : [w1, h1];
        const x = near === 0 ? LEFT * vw : near > 0 ? LEFT * vw + w0 + gap + (near - 1) * (w1 + gap) : LEFT * vw + near * (w1 + gap);
        card.classList.toggle('active', offset === 0); card.classList.toggle('before', offset < 0);
        card.style.width = `${w}px`; card.style.height = `${h}px`;
        card.style.transform = `translate(${x}px, ${TOP * vh + (h0 - h) / 2}px)`;
        card.style.opacity = offset >= -1 && x < innerWidth ? '' : '0';
        card.style.zIndex = String(20 - Math.abs(offset));
      });
    }
    function legend() {
      const { caption, kind } = view, game = kind !== 'tiles' && !caption.empty;
      const key = (letter, text) => { const span = el('span', 'kn-key'); span.append(img('', `${A}button-${letter}.png`), el('span', '', text)); return span; };
      parts.legend.replaceChildren(key('a', 'Select'), ...(game ? [key('x', 'Game settings'), key('y', 'Options')] : []));
    }
    function captions() {
      const { caption } = view;
      parts.empty.classList.toggle('hidden', !caption.empty);
      parts.emptyTitle.textContent = caption.empty ? caption.title : '';
      parts.emptyText.textContent = caption.empty ? caption.subtitle : '';
      body()?.classList.toggle('empty-library', !!caption.empty);
      body()?.classList.toggle('section-tiles', view.kind === 'tiles');
      legend();
    }
    return {
      name: 'kinect',
      label: 'Kinect (2010-2011)',
      since: 2010,
      about: { name: 'Kinect', years: '2010–2011', blurb: 'The ribbon dashboard: big white tiles with green ribbons, made for a controller or a wave of the hand.' },
      axis: 'vertical',
      stylesheet: 'skins/kinect/kinect.css',
      boot: 'kinect',
      mount() {
        if (typeof document.body?.prepend !== 'function') return; // no real page to build in
        build(); onResize = () => layout(); addEventListener('resize', onResize);
        document.body.classList.add('kinect');
      },
      unmount() {
        if (onResize) removeEventListener('resize', onResize);
        added.forEach(node => node.remove()); added = []; parts = {}; view = null;
        if (!document.body?.classList) return;
        document.body.classList.remove('kinect', 'section-tiles', 'empty-library');
      },
      setMotion(value) { reduced = !!value; body()?.classList.toggle('reduce-motion', reduced); },
      // The channels already passed stack upward and fade; the open one sits right above the row. ↓ brings the next
      // one up into its place, as on the original (the list wraps, and no name is shown twice).
      showSections({ sections, active, direction = null }) {
        if (!parts.channels) return;
        const count = sections.length, above = Math.min(count - 1, 3), names = [];
        for (let step = above; step >= 1; step--) names.push(el('div', `kn-channel kn-back-${step}`, sections[(active - step + count) % count].label));
        names.push(el('div', 'kn-channel kn-open', sections[active]?.label || ''));
        parts.channels.replaceChildren(...names);
        if (direction && !reduced) parts.channels.animate?.([{ transform: `translateY(${direction === 'down' ? LINE : -LINE}vh)`, opacity: .4 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.75,.25,1)' });
      },
      renderRail(section, items, index, caption, { direction = null } = {}) {
        if (!parts.row) return;
        view = { items, index, caption, kind: section.kind };
        parts.row.replaceChildren(...items.map(item => tile(item, section.kind)));
        body()?.classList.add('kn-still'); layout(); parts.row.offsetWidth; body()?.classList.remove('kn-still');
        captions();
        if (!reduced) parts.row.animate?.([{ opacity: 0, transform: direction ? `translateY(${direction === 'down' ? 9 : -9}vh)` : 'translateX(3vw)' }, { opacity: 1, transform: 'translate(0)' }], { duration: 360, easing: 'cubic-bezier(.2,.75,.25,1)' });
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
      // Everything is the skin's own; the button glyphs of the screens come from the theme state (the Kinect legends).
      applyTheme(state) {
        document.querySelectorAll('.controller-button').forEach(glyph => { const url = state.buttons?.[glyph.getAttribute('aria-label')]; glyph.classList.toggle('native-glyph', !!url); glyph.querySelector('img').src = url || 'assets/controller-buttons.jpg'; });
        const launchLogo = document.querySelector('#launch-overlay .brand-logo');
        if (launchLogo) { launchLogo.classList.add('native-launch-orb'); launchLogo.replaceChildren(img('', `${A}orb.png`)); }
      }
    };
  }
  root.NXE = root.NXE || {};
  root.NXE.createKinectSkin = createKinectSkin;
  if (root.NXE.skins) root.NXE.skins.register(createKinectSkin());
  if (typeof module !== 'undefined') module.exports = { createKinectSkin };
})(typeof window !== 'undefined' ? window : globalThis);

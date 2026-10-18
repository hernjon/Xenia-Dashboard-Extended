'use strict';
// The Blades (2005) skin, drawn with the original dashboard's own pieces (skins/blades/assets, from the MC360 skin):
// curved blade edges, runners, the animated swirl tinted by the open blade's colour, the whitewash glass, the
// glossy highlight that links the focused row to its description, the tray pill and the A/B/X/Y hints.
// Everything is placed on the original 720×576 grid (MC360 PAL16x9 Home/GamesHome), scaled to the window:
// heights follow the window, x positions are stretched to its width exactly as the 16:9 dashboard did.
(function (root) {
  const A = 'skins/blades/assets/';
  // The original blade colours, in order: games green, media blue, system purple (orange was the Live blade).
  const COLORS = { library: 'green', xenia: 'blue', dashboard: 'purple' };
  const SPARE = ['orange', 'green', 'blue', 'purple'];
  const TINT = { green: '#5dc43a', blue: '#4b8fd6', purple: '#8a6cc4', orange: '#e08a2a' };
  // Settings tiles name a role; these are the matching MC360 pictograms.
  const ICONS = { console: 'icon-system', settings: 'icon-system', folder: 'icon-folder', profiles: 'icon-profile', games: 'icon-games', download: 'icon-update', more: 'icon-custom', themes: 'icon-appearance', sound: 'icon-music', camera: 'icon-pictures', family: 'icon-locked', desktop: 'icon-power' };
  const ROWS = 5, FRAMES = 61, HOME_X = 53; // GamesHome draws its blade at x=53; content offsets are relative to it
  const SIZES = { 1: [3, 132], 2: [2, 140], 3: [1, 148] }; // distance from the open blade -> edge texture size, label y
  // Blade textures are 128 px wide and drawn 80 units wide. BODY_CENTRE is the middle column (in texture pixels) of the
  // silver body over the rows where the name is drawn: (first + last column with alpha above 8%) / 2, measured on
  // skins/blades/assets/blade-*.png.
  const TEXTURE_UNITS = 80 / 128;
  const BODY_CENTRE = { header: 75.5, 'size1-left': 76.5, 'size2-left': 73.5, 'size3-left': 71.5, 'size1-right': 46.5, 'size2-right': 48.5, 'size3-right': 49.5 };
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function img(className, src) { const node = el('img', className); node.alt = ''; node.draggable = false; if (src) node.src = src; return node; }
  function createBladesSkin() {
    let refs = {}, reduced = false, kx = 1, stage = null, parts = {}, blades = new Map(), order = [], active = null;
    let view = null, shift = 0, swirlTimer = 0, frame = 1, onResize = null, added = [];
    const body = () => document.body;
    const colorOf = (id, index) => COLORS[id] || SPARE[index % SPARE.length];
    // Places a node on the 720×576 grid. Textures stretch with the width like the original; pictures that must keep
    // their proportions (covers, icons) pass keep = true and only move.
    function put(node, x, y, w, h, keep = false) {
      node.style.left = `${x * kx}px`; node.style.top = `${y}px`;
      if (w !== undefined) node.style.width = `${keep ? w : w * kx}px`;
      if (h !== undefined) node.style.height = `${h}px`;
    }
    function fit() {
      const width = 576 * innerWidth / innerHeight;
      kx = width / 720;
      stage.style.width = `${width}px`; stage.style.transform = `scale(${innerHeight / 576})`;
      layout(false);
    }
    // The order of the original window: background, content, runners, blades, hazes.
    function build() {
      const rootNode = el('div', 'bl-root'); rootNode.id = 'blades-root';
      stage = el('div', 'bl-stage'); rootNode.append(stage);
      const back = el('div', 'bl-layer bl-back');
      parts.swirl = img('bl-piece bl-swirl', `${A}swirl/01.png`);
      parts.tint = img('bl-piece bl-tint');
      parts.glass = ['top-left', 'top-middle', 'top-right', 'bottom-left', 'bottom-middle', 'bottom-right'].map(name => img('bl-piece bl-glass', `${A}glass-${name}.png`));
      parts.wash = ['left', 'middle', 'right'].map(name => img('bl-piece bl-wash', `${A}wash-${name}.png`));
      back.append(parts.swirl, parts.tint, ...parts.wash, ...parts.glass);
      const content = el('div', 'bl-layer bl-content');
      parts.content = content;
      parts.title = el('div', 'bl-title');
      parts.card = el('div', 'bl-card'); parts.card.append(img('bl-card-face', `${A}gamecard_home-focus.png`));
      parts.cardHead = el('div', 'bl-card-head'); parts.cardThumb = el('div', 'bl-card-thumb'); parts.cardText = el('div', 'bl-card-text');
      parts.card.append(parts.cardHead, parts.cardThumb, parts.cardText);
      parts.dividers = Array.from({ length: ROWS + 1 }, () => img('bl-piece bl-divider', `${A}divider.png`));
      parts.shadow = img('bl-piece bl-highlight-shadow'); parts.highlight = img('bl-piece bl-highlight');
      parts.rows = Array.from({ length: ROWS }, () => { const row = el('div', 'bl-row'); row.append(el('div', 'bl-row-icon'), el('span', 'bl-row-text')); return row; });
      parts.logo = el('div', 'bl-logo'); parts.logoShadow = img('bl-piece bl-logo-shadow', `${A}home_logoshadow.png`);
      parts.text = el('div', 'bl-text');
      parts.pill = img('bl-piece bl-pill', `${A}dvdtrayeject-nofocus.png`); parts.pillText = el('div', 'bl-pill-text');
      parts.keys = Object.fromEntries(['y', 'x', 'b', 'a'].map(key => [key, img('bl-piece bl-key')]));
      parts.keyText = Object.fromEntries(['y', 'x', 'a'].map(key => [key, el('div', `bl-key-text bl-key-${key}`)]));
      content.append(parts.title, parts.card, ...parts.dividers, parts.shadow, parts.highlight, ...parts.rows, parts.logoShadow, parts.logo, parts.text, parts.pill, parts.pillText, ...Object.values(parts.keys), ...Object.values(parts.keyText));
      parts.runners = ['left', 'right'].map(side => img('bl-piece bl-runner', `${A}runner-${side}.png`));
      parts.bladeLayer = el('div', 'bl-layer bl-blades');
      parts.hazes = [img('bl-piece bl-haze'), img('bl-piece bl-haze')];
      stage.append(back, content, ...parts.runners, parts.bladeLayer, ...parts.hazes);
      document.body.prepend(rootNode);
      added = [rootNode];
    }
    function bladeX(index) {
      const at = order.indexOf(active), count = order.length;
      return index <= at ? 18 + 35 * index : 633 - 35 * (count - 1 - index);
    }
    // Positions the blades, background and content for the open blade.
    // The right-hand side. A game's cover is big (the original's 104×128 box was made for a small logo) and sits on the line, with
    // the title and the hint right under it; a settings tile keeps the small pictogram and the text in the original place.
    function placeRight() {
      const big = view?.kind === 'rail';
      parts.logo.classList.toggle('bl-logo-big', big);
      parts.text.classList.toggle('bl-text-center', big); // the note under a cover is centred on the cover; a tile's description is not
      // The name is already in the yellow box and in the list, and the hint in the pill, so a game's cover gets all the height and
      // only a note such as "2 discs" goes under it.
      // The cover ends on the same line as the list: the sixth divider, 194 + 40 × 5 = 394.
      if (big) { put(parts.logo, 392 + shift, 84, 205, 310); put(parts.logoShadow, 378 + shift, 384, 232, 16); put(parts.text, 392 + shift, 399, 205, 24); }
      else { put(parts.logo, 440 + shift, 83, 104, 128); put(parts.logoShadow, 378 + shift, 186, 232, 16); put(parts.text, 390 + shift, 205, 210, 200); }
    }
    function layout(animate = true) {
      if (!stage || !active) return;
      body()?.classList.toggle('bl-still', !animate);
      const at = order.indexOf(active), count = order.length, x = bladeX(at), dx = x - HOME_X, color = colorOf(active, at);
      document.documentElement.style.setProperty('--blade-color', TINT[color]);
      order.forEach((id, index) => {
        const { edge, label } = blades.get(id), distance = Math.abs(index - at), bx = bladeX(index);
        const [size, ly] = index === at ? [null, 120] : SIZES[Math.min(distance, 3)];
        edge.src = index === at ? `${A}blade-header.png` : `${A}blade-size${size}-${index < at ? 'left' : 'right'}.png`;
        put(edge, bx, -50, 80, 676);
        // The name is centred on the blade's silver body, measured from each texture (see BODY_CENTRE), so every blade
        // in every position follows one rule instead of a hand-tuned offset.
        const key = index === at ? 'header' : `size${size}-${index < at ? 'left' : 'right'}`;
        put(label, bx + BODY_CENTRE[key] * TEXTURE_UNITS, ly);
        // The names on the right sit a little left of the box centre; in a narrow window the blades get thinner but the letters do not, so they step back further.
        label.style.marginLeft = index > at ? `${-(4 + 6 * Math.max(0, 1 - kx / (1024 / 720)))}px` : ''; // 1024 / 720 is the 16:9 stretch: 4 px back there, up to 10 in a narrow window
        label.classList.toggle('open', index === at);
      });
      put(parts.swirl, x, 0, 610, 576); put(parts.tint, x, 0, 610, 576); parts.tint.src = `${A}bg-${color}-alpha.png`;
      [[52, 0, 16], [68, 0, 492], [560, 0, 16], [52, 512, 16], [68, 512, 492], [560, 512, 16]].forEach(([ox, y, w], i) => put(parts.glass[i], x + ox, y, w, 64));
      [[42, 32], [74, 453], [527, 64]].forEach(([ox, w], i) => put(parts.wash[i], x + ox, 0, w, 576));
      put(parts.runners[0], -61, -50, 128, 676); put(parts.runners[1], 665, -50, 128, 676);
      const right = at < count - 1 ? bladeX(at + 1) : null;
      parts.hazes[0].src = `${A}haze-${color}-left.png`; parts.hazes[1].src = `${A}haze-${color}-right.png`;
      put(parts.hazes[0], x - 91, 350, 150, 228); put(parts.hazes[1], right === null ? 660 : right + 17, 350, 150, 228);
      // Content, on GamesHome's grid moved with the open blade.
      put(parts.title, 137 + dx, 42);
      put(parts.card, 130 + dx, 77, 250, 125);
      parts.dividers.forEach((line, i) => put(line, 135 + dx, 194 + 40 * i, 235, 1));
      put(parts.highlight, 112 + dx, 180, 281, 270); put(parts.shadow, 112 + dx, 180, 281, 270);
      parts.rows.forEach((row, i) => put(row, 145 + dx, 200 + 40 * i, 235, 30));
      shift = dx; placeRight();
      put(parts.pill, 121 + dx, 413, 492, 71); put(parts.pillText, 191 + dx, 413, 400, 71);
      // The button hints sit 7 units lower than the original's (505 / 525) so they clear the curved top edge of the bottom band.
      const HINT = 7;
      // The button pictures are square (64 × 64) and stay square whatever the window shape (keep = true: they only move).
      put(parts.keys.y, 160 + dx, 505 + HINT, 21, 21, true); put(parts.keys.x, 147 + dx, 525 + HINT, 21, 21, true);
      put(parts.keys.b, 550 + dx, 505 + HINT, 21, 21, true); put(parts.keys.a, 563 + dx, 525 + HINT, 21, 21, true);
      put(parts.keyText.x, 172 + dx, 526 + HINT); put(parts.keyText.y, 185 + dx, 506 + HINT); put(parts.keyText.a, 545 + dx, 526 + HINT);
      if (!animate) requestAnimationFrame?.(() => body()?.classList.remove('bl-still'));
    }
    function picture(item, kind) {
      const url = item?.art || (kind === 'tiles' ? `${A}${ICONS[item?.icon] || 'icon-system'}.png` : `${A}icon-games.png`);
      const node = img(item?.art ? 'bl-cover' : 'bl-icon', url);
      node.onerror = () => { node.onerror = null; node.className = 'bl-icon'; node.src = `${A}icon-games.png`; };
      return node;
    }
    // Fills the five visible rows around the focused item, the highlight on its slot, and the description.
    function fill(swap) {
      const { items, index, caption, kind } = view, total = items.length;
      const start = Math.max(0, Math.min(index - 2, total - ROWS)), slot = index - start;
      parts.title.textContent = caption.heading;
      parts.rows.forEach((row, i) => {
        const item = items[start + i];
        row.classList.toggle('hidden', !item); row.classList.toggle('selected', !!item && start + i === index);
        row.children[0].replaceChildren(...(item ? [picture(item, kind)] : []));
        row.children[1].textContent = item ? item.title : '';
      });
      parts.highlight.classList.toggle('hidden', !total); parts.shadow.classList.toggle('hidden', !total);
      if (total) { parts.highlight.src = `${A}highlight-${slot + 1}.png`; parts.shadow.src = `${A}highlight-${slot + 1}-shadow.png`; }
      const item = items[index];
      parts.cardHead.textContent = caption.title;
      parts.cardThumb.replaceChildren(picture(item, kind));
      parts.cardText.textContent = caption.counter;
      placeRight();
      parts.logo.classList.toggle('bl-logo-cover', !!item?.art); // a real cover sits on the line; a pictogram stays centred
      parts.logo.replaceChildren(...(item ? [picture(item, kind)] : []));
      parts.text.textContent = kind === 'tiles' ? caption.subtitle : item?.badge || '';
      parts.pillText.textContent = kind === 'tiles' ? 'Press A to open' : caption.empty ? 'Xenia Settings › Folders' : caption.subtitle;
      const game = kind !== 'tiles' && !caption.empty;
      parts.keys.a.src = `${A}button-a.png`; parts.keys.b.src = `${A}button-b-off.png`;
      parts.keys.x.src = `${A}button-x${game ? '' : '-off'}.png`; parts.keys.y.src = `${A}button-y${game ? '' : '-off'}.png`;
      parts.keyText.a.textContent = 'Select'; parts.keyText.x.textContent = game ? 'Game settings' : ''; parts.keyText.y.textContent = game ? 'Options' : '';
      body()?.classList.toggle('empty-library', !!caption.empty);
      body()?.classList.toggle('section-tiles', kind === 'tiles');
      if (refs.title) refs.title.textContent = caption.title;
      if (swap && !reduced) [parts.text, parts.logo].forEach(node => node.animate?.([{ opacity: .3 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' }));
    }
    function animateSwirl() {
      clearInterval(swirlTimer);
      if (reduced || !parts.swirl) return;
      // The original multiimage: 61 frames, one every 70 ms.
      swirlTimer = setInterval(() => { frame = frame % FRAMES + 1; parts.swirl.src = `${A}swirl/${String(frame).padStart(2, '0')}.png`; }, 70);
    }
    return {
      name: 'blades',
      label: 'Blades (2005-2008)',
      since: 2005,
      about: { name: 'Blades', years: '2005–2008', blurb: 'The launch dashboard: curved blades, an animated green background and the original blade sounds.' },
      axis: 'horizontal',
      wrap: false, // the original's blades stop at both ends
      stylesheet: 'skins/blades/blades.css',
      boot: 'classic',
      mount(elements) {
        refs = elements;
        if (typeof document.body?.prepend !== 'function') return; // no real page to build in
        build();
        onResize = () => fit(); addEventListener('resize', onResize);
        for (let n = 1; n <= FRAMES; n++) { const preload = new Image(); preload.src = `${A}swirl/${String(n).padStart(2, '0')}.png`; }
        fit(); animateSwirl();
        document.body.classList.add('blades');
      },
      unmount() {
        clearInterval(swirlTimer); if (onResize) removeEventListener('resize', onResize);
        added.forEach(node => node.remove()); added = []; stage = null; parts = {}; blades = new Map(); order = []; active = null; view = null;
        if (!document.body?.classList) return;
        document.body.classList.remove('blades', 'section-tiles', 'empty-library');
        document.documentElement.style.removeProperty('--blade-color');
      },
      setMotion(value) { reduced = !!value; body()?.classList.toggle('reduce-motion', reduced); animateSwirl(); },
      showSections({ sections, active: at }) {
        if (!stage) return;
        const ids = sections.map(section => section.id);
        for (const [id, blade] of blades) if (!ids.includes(id)) { blade.edge.remove(); blade.label.remove(); blades.delete(id); }
        sections.forEach(section => {
          let blade = blades.get(section.id);
          if (!blade) { blade = { edge: img('bl-piece bl-edge'), label: el('div', 'bl-blade-label') }; blades.set(section.id, blade); }
          blade.label.textContent = section.label.toLowerCase();
          parts.bladeLayer.append(blade.edge, blade.label); // page order = section order, later blades on top
        });
        order = ids; active = ids[at] ?? null;
        layout(true);
      },
      renderRail(section, items, index, caption, { direction = null } = {}) {
        if (!stage) return;
        view = { items, index, caption, kind: section.kind };
        fill(false);
        if (direction && !reduced) parts.content.animate?.([{ opacity: 0, transform: `translateX(${direction === 'left' || direction === 'up' ? -30 : 30}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 260, easing: 'cubic-bezier(.2,.75,.25,1)' });
      },
      focusRail(section, items, index, caption, { swap = false } = {}) {
        if (!view) return;
        view = { items, index, caption, kind: section.kind };
        fill(swap);
      },
      relayout: () => stage && fit(),
      setLaunch(visible, title = '') {
        document.getElementById('launch-overlay').classList.toggle('hidden', !visible);
        document.getElementById('launch-title').textContent = title;
      },
      // Nothing to take from a theme pack: every picture is the skin's own.
      applyTheme() {
        document.querySelectorAll('.controller-button').forEach(glyph => { glyph.classList.remove('native-glyph'); glyph.querySelector('img').src = 'assets/controller-buttons.jpg'; });
        const launchLogo = document.querySelector('#launch-overlay .brand-logo'); if (launchLogo) { launchLogo.classList.remove('native-launch-orb'); launchLogo.textContent = 'X'; }
      }
    };
  }
  root.NXE = root.NXE || {};
  root.NXE.createBladesSkin = createBladesSkin;
  if (root.NXE.skins) root.NXE.skins.register(createBladesSkin());
  if (typeof module !== 'undefined') module.exports = { createBladesSkin };
})(typeof window !== 'undefined' ? window : globalThis);

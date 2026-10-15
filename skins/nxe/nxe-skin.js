'use strict';
// The NXE (2008) skin, from dashboard 2.0.7371 itself and a capture of it. The pictures come from the NXE theme pack (wallpapers, the dashboard's own tile textures
// and glossy pictograms, legends, orb); the channels passed stack above the open one and shrink as they fade, the
// tiles recede to the right like a deck and the one before leans out at the left edge. Game covers are portrait, so
// game tiles are too (the cover fills them). Measured on an 852×480 capture, kept in vw/vh.
(function (root) {
  const SCALES = [1, .745, .59, .49, .41, .35], OVERLAPS = [.994, .978, .78, .637, .554];
  const LEFT = 7.4, TOP = 34.4, WIDTH = 32.7, HEIGHT = 44.1, COVER = .72;
  // Each settings tile: the dashboard slot texture it sits on and its pictogram (a glossy 3D one where the dashboard
  // has it, else the white menu pictogram of the pack).
  const TILES = {
    console: ['settings', 'settings'], settings: ['settings', 'settings'], games: ['games', 'games'], sound: ['music', 'music'],
    camera: ['photos', 'photos'], more: ['settings', null], folder: ['blank', null], profiles: ['blank', null],
    download: ['blank', null], themes: ['photos', null], family: ['blank', null], desktop: ['blank', null]
  };
  // The orb floats over the floor and, every few seconds, drops a ripple that opens out and fades, like a drop on water
  // (the dashboard does it live, with its ripple effect; there is no video). Each wave is two rings, the second trailing.
  const CORNER = `<svg class="nv-ripples" viewBox="0 0 210 100" aria-hidden="true"><g fill="none" stroke="#c9d4cc" stroke-width="1.6">
    <ellipse class="nv-wave" cx="105" cy="54" rx="92" ry="34"/><ellipse class="nv-wave nv-wave-2" cx="105" cy="54" rx="92" ry="34"/>
    <ellipse class="nv-wave nv-wave-3" cx="105" cy="54" rx="92" ry="34"/></g></svg><div class="nv-orb-shadow"></div>`;
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function img(className, src) { const node = el('img', className); node.alt = ''; node.draggable = false; if (src) node.src = src; return node; }
  function createNxeSkin() {
    let reduced = false, parts = {}, added = [], view = null, theme = {}, onResize = null;
    const body = () => document.body;
    function build() {
      const rootNode = el('div', 'nv-root'); rootNode.id = 'nxe-root';
      parts.wallpaper = img('nv-wallpaper');
      parts.floor = el('div', 'nv-floor'); parts.horizon = img('nv-horizon'); parts.floor.append(parts.horizon);
      parts.channels = el('div', 'nv-channels');
      parts.row = el('div', 'nv-row');
      parts.counter = el('div', 'nv-counter');
      parts.empty = el('div', 'nv-empty hidden'); parts.emptyTitle = el('div', 'nv-empty-title'); parts.emptyText = el('div', 'nv-empty-text'); parts.empty.append(parts.emptyTitle, parts.emptyText);
      parts.legend = el('div', 'nv-legend');
      const corner = el('div', 'nv-corner'); corner.innerHTML = CORNER; parts.orb = img('nv-orb'); corner.append(parts.orb);
      rootNode.append(parts.wallpaper, parts.floor, parts.row, parts.channels, parts.counter, parts.empty, parts.legend, corner);
      document.body.prepend(rootNode);
      added = [rootNode];
    }
    const scene = () => theme.scene || {};
    function face(item, kind) {
      const node = el('div', 'nv-face');
      if (kind === 'rail' && item.art) {
        const cover = img('nv-cover', item.art);
        cover.onerror = () => { cover.onerror = null; node.replaceWith(face({ ...item, art: null }, kind)); };
        node.append(cover, el('div', 'nv-shade'));
      } else {
        const [texture, glossy] = kind === 'rail' ? ['games', 'disc'] : TILES[item.icon] || ['blank', null];
        const url = scene().tiles?.[texture] || scene().tiles?.blank;
        if (url) node.style.backgroundImage = `url("${url}")`;
        const picture = glossy && scene().glossy?.[glossy] || theme.icons?.[item.icon] || theme.icons?.settings;
        if (picture) node.append(img(glossy && scene().glossy?.[glossy] ? 'nv-glossy' : 'nv-icon', picture));
      }
      node.append(el('div', 'nv-label', item.title));
      return node;
    }
    function tile(item, kind) {
      const card = el('div', `nv-tile${kind === 'rail' ? ' nv-portrait' : ''}`), front = face(item, kind);
      const reflection = front.cloneNode(true); reflection.classList.add('nv-reflection'); reflection.setAttribute('aria-hidden', 'true');
      card.append(front, reflection);
      return card;
    }
    // The deck: the focused tile full size at the left, each next one smaller and partly behind the one before, all on
    // one centre line; the one before leans out, larger and faded, at the left edge.
    function layout() {
      if (!view) return;
      const vw = innerWidth / 100, vh = innerHeight / 100, h0 = HEIGHT * vh, w0 = view.kind === 'rail' ? h0 * COVER : WIDTH * vw;
      const centre = (TOP + HEIGHT / 2) * vh, cards = [...parts.row.children];
      cards.forEach(card => { card.style.width = `${w0}px`; card.style.height = `${h0}px`; });
      cards.forEach((card, position) => {
        const offset = position - view.index;
        card.classList.toggle('active', offset === 0); card.classList.toggle('before', offset === -1);
        let x, scale, opacity = 1;
        // A landscape tile leans out larger, as on the original; a portrait cover stays its size, just clear of the focus.
        if (offset < 0) { scale = view.kind === 'rail' ? 1 : 1.2; x = offset !== -1 ? -w0 * 2 : view.kind === 'rail' ? LEFT * vw - w0 - 1.2 * vw : LEFT * vw * 2.7 - w0 * scale; opacity = offset === -1 ? .5 : 0; }
        else if (offset > 5) { scale = SCALES[5]; x = innerWidth + 20; opacity = 0; }
        else {
          scale = SCALES[offset]; x = LEFT * vw;
          for (let step = 0; step < offset; step++) x += w0 * SCALES[step] * OVERLAPS[step];
        }
        card.style.transform = `translate(${x}px, ${centre - h0 * scale / 2}px) scale(${scale})`;
        card.style.opacity = String(opacity);
        card.style.zIndex = String(20 - Math.abs(offset));
      });
    }
    function captions() {
      const { items, index, caption, kind } = view, game = kind !== 'tiles' && !caption.empty;
      parts.counter.textContent = items.length ? `${index + 1} of ${items.length}${items[index]?.badge ? ` · ${items[index].badge}` : ''}` : '';
      parts.empty.classList.toggle('hidden', !caption.empty);
      parts.emptyTitle.textContent = caption.empty ? caption.title : ''; parts.emptyText.textContent = caption.empty ? caption.subtitle : '';
      body()?.classList.toggle('empty-library', !!caption.empty);
      body()?.classList.toggle('section-tiles', kind === 'tiles');
      const key = (letter, text) => { const span = el('span', 'nv-key'), glyph = theme.buttons?.[letter.toUpperCase()]; if (glyph) span.append(img('', glyph)); span.append(el('span', '', text)); return span; };
      parts.legend.replaceChildren(key('a', 'Select'), ...(game ? [key('x', 'Game settings'), key('y', 'Options')] : []));
    }
    return {
      name: 'nxe',
      label: 'NXE (2008-2010)',
      since: 2008,
      about: { name: 'NXE', years: '2008–2010', blurb: 'The New Xbox Experience: cover-flow on the horizon, glossy tiles and the floating orb.' },
      axis: 'vertical',
      stylesheet: 'skins/nxe/nxe.css',
      boot: 'classic',
      mount() {
        if (typeof document.body?.prepend !== 'function') return; // no real page to build in
        build(); onResize = () => layout(); addEventListener('resize', onResize);
        document.body.classList.add('nxe');
      },
      unmount() {
        if (onResize) removeEventListener('resize', onResize);
        added.forEach(node => node.remove()); added = []; parts = {}; view = null;
        if (!document.body?.classList) return;
        document.body.classList.remove('nxe', 'section-tiles', 'empty-library');
      },
      setMotion(value) { reduced = !!value; body()?.classList.toggle('reduce-motion', reduced); },
      // Only the channels already passed are listed, above the open one, each smaller and fainter; ↓ brings the next one
      // up into place (the list wraps, and no name is shown twice).
      showSections({ sections, active, direction = null }) {
        if (!parts.channels) return;
        const count = sections.length, above = Math.min(count - 1, 4), names = [];
        for (let step = above; step >= 1; step--) names.push(el('div', `nv-channel nv-back-${step}`, sections[(active - step + count) % count].label));
        const open = el('div', 'nv-channel nv-open'); open.append(el('span', 'nv-marker'), el('span', '', sections[active]?.label || ''));
        parts.channels.replaceChildren(...names, open);
        if (direction && !reduced) parts.channels.animate?.([{ transform: `translateY(${direction === 'down' ? 4 : -4}vh)`, opacity: .4 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.75,.25,1)' });
      },
      renderRail(section, items, index, caption, { direction = null } = {}) {
        if (!parts.row) return;
        view = { items, index, caption, kind: section.kind };
        parts.row.replaceChildren(...items.map(item => tile(item, section.kind)));
        body()?.classList.add('nv-still'); layout(); parts.row.offsetWidth; body()?.classList.remove('nv-still');
        captions();
        if (!reduced) parts.row.animate?.([{ opacity: 0, transform: direction ? `translateY(${direction === 'down' ? 9 : -9}vh)` : 'translateX(3vw)' }, { opacity: 1, transform: 'translate(0)' }], { duration: 380, easing: 'cubic-bezier(.2,.75,.25,1)' });
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
      // The NXE theme pack: the chosen wallpaper, the horizon glow, the channel marker, the orb and the legends.
      applyTheme(state, { status = () => {} } = {}) {
        theme = state;
        if (!parts.wallpaper) return;
        const background = state.backgrounds?.find(b => b.id === state.selected) || state.backgrounds?.[0];
        parts.wallpaper.classList.toggle('hidden', !background);
        if (background) { parts.wallpaper.onerror = () => { parts.wallpaper.classList.add('hidden'); status('Imported background unavailable. Using the fallback background.'); }; parts.wallpaper.src = background.url; }
        parts.horizon.classList.toggle('hidden', !scene().horizon); if (scene().horizon) parts.horizon.src = scene().horizon;
        if (scene().marker) document.documentElement.style.setProperty('--nv-marker', `url("${scene().marker}")`);
        parts.orb.classList.toggle('hidden', !scene().menuOrb); if (scene().menuOrb) parts.orb.src = scene().menuOrb;
        document.querySelectorAll('.controller-button').forEach(glyph => { const url = state.buttons?.[glyph.getAttribute('aria-label')]; glyph.classList.toggle('native-glyph', !!url); glyph.querySelector('img').src = url || 'assets/controller-buttons.jpg'; });
        const launchLogo = document.querySelector('#launch-overlay .brand-logo');
        if (launchLogo) { launchLogo.classList.toggle('native-launch-orb', !!scene().menuOrb); launchLogo.replaceChildren(...(scene().menuOrb ? [img('', scene().menuOrb)] : [])); }
        if (view) { parts.row.replaceChildren(...view.items.map(item => tile(item, view.kind))); body()?.classList.add('nv-still'); layout(); parts.row.offsetWidth; body()?.classList.remove('nv-still'); }
      }
    };
  }
  root.NXE = root.NXE || {};
  root.NXE.createNxeSkin = createNxeSkin;
  if (root.NXE.skins) root.NXE.skins.register(createNxeSkin());
  if (typeof module !== 'undefined') module.exports = { createNxeSkin };
})(typeof window !== 'undefined' ? window : globalThis);

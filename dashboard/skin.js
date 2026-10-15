'use strict';
// Layer 3 plumbing: a skin is everything about how the dashboard LOOKS and MOVES (layout,
// transitions, backgrounds, launch screen). The app only talks to a skin through this contract,
// so another dashboard (Blades, Metro...) is a new skin and nothing else has to be redone.
(function (root) {
  const REQUIRED = {
    mount: 'receives the DOM elements the skin draws into',
    showSections: 'draws the vertical list of section names around the active one',
    applyTheme: 'applies backgrounds, icons, button glyphs and scene art',
    setMotion: 'turns transitions on or off',
    renderRail: 'draws a section\'s items from scratch',
    focusRail: 'moves focus to an item and updates its caption',
    setLaunch: 'shows or hides the "starting game" screen'
  };
  // Optional, with these defaults: `label` (name shown in settings), `axis` ('vertical': sections stacked, items sideways;
  // 'horizontal': the reverse; 'grid': Metro, items in columns of `rows(kind)` tiles, sections side by side), `wrap` (true: moving past the last section lands on the first; false: it stops), `since` (the year of the dashboard it recreates, used to list the views in release order), `boot` (the id of its startup video in BOOTS), `stylesheet` (the skin's CSS file, swapped in when the skin is chosen) and `unmount()`
  // (remove what `mount` added to the page).
  const AXES = ['vertical', 'horizontal', 'grid'];
  // The startup videos, named by the dashboards they belong to; a skin picks one with `boot` (its id). New views reuse the latest one until they get their own.
  const BOOTS = [
    { id: 'classic', label: 'Blades / NXE (2005-2011)', video: 'skins/nxe/assets/boot.webm' },
    { id: 'kinect', label: 'Kinect / Metro (2011-2012)', video: 'skins/kinect/assets/boot.webm' }
  ];
  function createSkinRegistry() {
    const skins = new Map();
    let active = null;
    return {
      register(skin) {
        if (!skin || typeof skin.name !== 'string' || !skin.name) throw Error('A skin needs a name');
        const missing = Object.keys(REQUIRED).filter(method => typeof skin[method] !== 'function');
        if (missing.length) throw Error(`Skin ${skin.name} is missing: ${missing.join(', ')}`);
        if (skin.axis !== undefined && !AXES.includes(skin.axis)) throw Error(`Skin ${skin.name} has an unknown axis`);
        if (skin.stylesheet !== undefined && !/^skins\/[a-z][a-z0-9-]*\/[\w.-]+\.css$/.test(skin.stylesheet)) throw Error(`Skin ${skin.name} has an invalid stylesheet`);
        if (skin.wrap !== undefined && typeof skin.wrap !== 'boolean') throw Error(`Skin ${skin.name}: wrap must be true or false`);
        if (skin.since !== undefined && !(Number.isInteger(skin.since) && skin.since >= 2000 && skin.since <= 2100)) throw Error(`Skin ${skin.name} has an invalid release year`);
        if (skin.boot !== undefined && !BOOTS.some(boot => boot.id === skin.boot)) throw Error(`Skin ${skin.name} has an invalid boot video`);
        if (skin.rows !== undefined && typeof skin.rows !== 'function') throw Error(`Skin ${skin.name}: rows must be a function`);
        if (skin.about !== undefined && !(skin.about && ['name', 'years', 'blurb'].every(key => typeof skin.about[key] === 'string' && skin.about[key]))) throw Error(`Skin ${skin.name}: about needs a name, years and a blurb`);
        if (skin.unmount !== undefined && typeof skin.unmount !== 'function') throw Error(`Skin ${skin.name}: unmount must be a function`);
        skins.set(skin.name, skin);
        return this;
      },
      use(name) { const skin = skins.get(name); if (!skin) throw Error(`Unknown skin ${name}`); active = skin; return skin; },
      get(name) { return skins.get(name) || null; },
      get active() { return active; },
      // Oldest dashboard first (`since`), so every list of views reads in release order; views without a year go last.
      names: () => [...skins.values()].sort((a, b) => (a.since ?? 9999) - (b.since ?? 9999)).map(skin => skin.name)
    };
  }
  root.NXE = root.NXE || {};
  root.NXE.createSkinRegistry = createSkinRegistry;
  root.NXE.boots = BOOTS;
  root.NXE.skins = root.NXE.skins || createSkinRegistry();
  if (typeof module !== 'undefined') module.exports = { createSkinRegistry, REQUIRED, BOOTS };
})(typeof window !== 'undefined' ? window : globalThis);

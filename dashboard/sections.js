'use strict';
// Layer 1 of the dashboard: WHAT it contains. A section describes its items and what the
// buttons do with them; it knows nothing about how it is drawn (that is the skin's job).
(function (root) {
  const KINDS = new Set(['rail', 'tiles', 'list']);
  // rail  = a horizontal run of big items (the Game Library cover flow)
  // tiles = a horizontal run of tiles that open a screen (System, Xenia, Dashboard...)
  // list  = a plain run of rows (a skin whose items run vertically, such as a blade, draws it as it likes)
  // These say what the items ARE; which way they run on screen is the skin's decision.
  function createSectionRegistry() {
    const sections = new Map();
    const ordered = () => [...sections.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    return {
      register(section) {
        if (!section || typeof section.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(section.id)) throw Error('A section needs a lowercase id');
        if (sections.has(section.id)) throw Error(`Section ${section.id} is already registered`);
        if (typeof section.label !== 'string' || !section.label) throw Error(`Section ${section.id} needs a label`);
        if (!KINDS.has(section.kind)) throw Error(`Section ${section.id} has an unknown kind`);
        if (typeof section.items !== 'function') throw Error(`Section ${section.id} needs items()`);
        for (const hook of ['activate', 'menu', 'alt', 'back', 'caption']) if (section[hook] !== undefined && typeof section[hook] !== 'function') throw Error(`Section ${section.id}: ${hook} must be a function`);
        sections.set(section.id, { order: 100, ...section });
        return this;
      },
      get: id => sections.get(id) || null,
      list: ordered,
      ids: () => ordered().map(section => section.id)
    };
  }
  root.NXE = root.NXE || {};
  root.NXE.createSectionRegistry = createSectionRegistry;
  if (typeof module !== 'undefined') module.exports = { createSectionRegistry };
})(typeof window !== 'undefined' ? window : globalThis);

'use strict';
// Layer 2 of the dashboard: HOW focus moves. A pure state machine (no DOM, no drawing) shared by
// every skin: left/right inside a section, up/down between sections, and the action buttons.
// It answers each input with an effect describing what happened; the app and skin react to it.
(function (root) {
  const JUMP = 5;
  // Which keys move between the items of a section and which between the sections depends on the skin: with the
  // sections stacked vertically (NXE) the items run sideways; with the sections side by side (blades) it is the reverse.
  // LB/RB jump through items on every skin; LT/RT change section on every skin (see dispatch).
  const ITEM_KEYS = { vertical: { left: -1, right: 1, lb: -JUMP, rb: JUMP }, horizontal: { up: -1, down: 1, lb: -JUMP, rb: JUMP }, grid: {} };
  const SECTION_KEYS = { vertical: { up: -1, down: 1 }, horizontal: { left: -1, right: 1 }, grid: { lb: -1, rb: 1 } };
  // 'grid' (Metro): a section's items fill columns of `rows(id)` tiles, top to bottom then left to right. ↑/↓ move
  // inside a column, ←/→ to the next column and, past the first or last one, to the next section, as do LB/RB.
  function gridMove(action, from, total, rows) {
    const row = from % rows, column = Math.floor(from / rows), columns = Math.ceil(total / rows);
    if (action === 'up') return row > 0 ? from - 1 : from;
    if (action === 'down') return row < rows - 1 && from + 1 < total ? from + 1 : from;
    const next = column + (action === 'right' ? 1 : -1);
    if (next < 0 || next >= columns) return null; // off the edge: the section changes
    return Math.min(next * rows + row, total - 1);
  }
  function createNavigator({ sections, count, axis = 'vertical', wrap = true, rows = () => 1 }) {
    if (!SECTION_KEYS[axis]) throw Error(`Unknown navigation axis ${axis}`);
    const positions = new Map();
    let current = null;
    // Sections may register after the navigator exists, so the first one is picked on first use.
    const resolve = () => { if (current === null || !sections.get(current)) current = sections.ids()[0] ?? null; return current; };
    const total = id => Math.max(0, Number(count(id)) | 0), total_ = total;
    const clamp = (id, index) => Math.max(0, Math.min(total(id) - 1, index | 0));
    const navigator = {
      get axis() { return axis; },
      get wrap() { return wrap; },
      setWrap(value) { wrap = value !== false; },
      setAxis(value) { if (!SECTION_KEYS[value]) throw Error(`Unknown navigation axis ${value}`); axis = value; },
      setRows(value) { rows = typeof value === 'function' ? value : () => 1; },
      rows: (id = resolve()) => Math.max(1, Number(rows(id)) | 0),
      get section() { return resolve(); },
      index: (id = resolve()) => positions.get(id) ?? 0,
      setIndex(id, index) { positions.set(id, clamp(id, index)); return positions.get(id); },
      reclamp(id = resolve()) { return navigator.setIndex(id, navigator.index(id)); },
      focusSection(id) { if (!sections.get(id)) throw Error(`Unknown section ${id}`); current = id; },
      // stay: the section may not change (choosing a disc of a multi-disc game).
      dispatch(action, { stay = false } = {}) {
        const id = resolve();
        if (id === null) return null;
        if (axis === 'grid' && ['up', 'down', 'left', 'right'].includes(action)) {
          const from = navigator.index(id), total = total_(id);
          const to = total ? gridMove(action, from, total, navigator.rows(id)) : null;
          if (to === from) return null;
          if (to !== null) { positions.set(id, to); return { type: 'move', section: id, from, to, delta: to - from }; }
          if (stay) return null;
          return navigator.dispatch(action === 'left' ? 'lb' : 'rb');
        }
        if (stay && action in SECTION_KEYS[axis]) return null;
        if (action in ITEM_KEYS[axis]) {
          const from = navigator.index(id), to = clamp(id, from + ITEM_KEYS[axis][action]);
          if (to === from) return null;
          positions.set(id, to);
          return { type: 'move', section: id, from, to, delta: ITEM_KEYS[axis][action] };
        }
        // LT / RT change section on every view, whatever its axis: the previous or the next one.
        const step = action === 'lt' ? -1 : action === 'rt' ? 1 : SECTION_KEYS[axis][action];
        if (step !== undefined && (action === 'lt' || action === 'rt' || action in SECTION_KEYS[axis])) {
          if (stay && (action === 'lt' || action === 'rt')) return null;
          // With wrap on (NXE) the list is a ring: down from the last section lands on the first, up from the first on the
          // last. With wrap off (blades) the ends stop, as on the original.
          const list = sections.list();
          if (list.length < 2) return null;
          const at = list.findIndex(section => section.id === id) + step;
          if (!wrap && (at < 0 || at >= list.length)) return null;
          const next = list[(at + list.length) % list.length];
          current = next.id;
          const sideways = axis !== 'vertical';
          return { type: 'section', from: id, to: next.id, direction: action === 'lt' || action === 'rt' ? (sideways ? { lt: 'left', rt: 'right' } : { lt: 'up', rt: 'down' })[action] : { lb: 'left', rb: 'right' }[action] || action };
        }
        if (action === 'a') return { type: 'activate', section: id, index: navigator.index(id) };
        if (action === 'y') return { type: 'menu', section: id, index: navigator.index(id) };
        if (action === 'x') return { type: 'alt', section: id, index: navigator.index(id) };
        if (action === 'b') return { type: 'back', section: id };
        return null;
      }
    };
    return navigator;
  }
  root.NXE = root.NXE || {};
  root.NXE.createNavigator = createNavigator;
  if (typeof module !== 'undefined') module.exports = { createNavigator, JUMP };
})(typeof window !== 'undefined' ? window : globalThis);

'use strict';
// The timeline where a view is chosen: one line with a mark per dashboard, a big preview and a caption of the one in focus.
// The same component runs in the install wizard (on its neutral screen) and in Dashboard Settings › View.
(function (root) {
  const viewsFromRegistry = registry => registry.names().map(name => {
    const skin = registry.get(name), about = skin.about || {};
    return { name, label: about.name || skin.label || name, years: about.years || '', blurb: about.blurb || '', preview: `assets/views/${name}.jpg` };
  });
  function createViewPicker({ document, host, views, current = null, onChoose, onBack, onFocus }) {
    if (!Array.isArray(views) || !views.length) throw Error('The view picker needs at least one view');
    let focus = Math.max(0, views.findIndex(view => view.name === current));
    const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
    const stage = el('div', 'vp-stage'), preview = el('img', 'vp-preview'), name = el('div', 'vp-name'), blurb = el('div', 'vp-blurb'), line = el('div', 'vp-line');
    preview.alt = ''; preview.onerror = () => { preview.className = 'vp-preview vp-missing'; };
    stage.append(preview);
    function draw() {
      const view = views[focus];
      preview.className = 'vp-preview'; preview.src = view.preview;
      name.textContent = view.years ? `${view.label} · ${view.years}` : view.label;
      blurb.textContent = view.blurb;
      line.replaceChildren(...views.map((entry, index) => {
        const mark = el('div', `vp-mark${index === focus ? ' vp-focus' : ''}${entry.name === current ? ' vp-current' : ''}`);
        const track = el('div', 'vp-track'); track.append(el('div', 'vp-dot'));
        mark.append(el('div', 'vp-year', entry.years.slice(0, 4)), track, el('div', 'vp-label', entry.label));
        mark.addEventListener('click', () => { focus = index; draw(); onFocus?.(views[focus]); onChoose(entry.name); });
        return mark;
      }));
    }
    host.replaceChildren(stage, name, blurb, line);
    draw();
    return {
      get focus() { return focus; },
      input(action) {
        if (action === 'left' || action === 'right') {
          const next = Math.max(0, Math.min(views.length - 1, focus + (action === 'left' ? -1 : 1)));
          if (next === focus) return null;
          focus = next; draw(); onFocus?.(views[focus]); return 'move';
        }
        if (action === 'a') { onChoose(views[focus].name); return 'choose'; }
        if (action === 'b') { onBack?.(); return 'back'; }
        return null;
      },
      destroy() { host.replaceChildren(); }
    };
  }
  root.NXE = root.NXE || {};
  root.NXE.createViewPicker = createViewPicker;
  root.NXE.viewsFromRegistry = viewsFromRegistry;
  if (typeof module !== 'undefined') module.exports = { createViewPicker, viewsFromRegistry };
})(typeof window !== 'undefined' ? window : globalThis);

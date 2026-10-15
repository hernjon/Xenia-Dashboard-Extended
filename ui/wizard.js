'use strict';
// The install wizard's step runner: which step is on, how far along, back / skip, and the hand-back from the screens it opens
// (Updates, Folders, Covers). It draws nothing; each step's `enter` does.
(function (root) {
  function createWizard({ steps, onEnd }) {
    if (!Array.isArray(steps) || !steps.length) throw Error('A wizard needs steps');
    let index = -1, active = false, waiting = false;
    const applies = i => !steps[i].when || steps[i].when();
    const enter = () => { waiting = false; steps[index].enter(); };
    const wizard = {
      get active() { return active; },
      get step() { return active && index >= 0 ? steps[index].id : null; },
      progress() { const list = steps.map((_, i) => i).filter(applies); return { step: Math.max(1, list.indexOf(index) + 1), of: list.length }; },
      start() { active = true; index = -1; return wizard.next(); },
      next() {
        if (!active) return null;
        do index++; while (index < steps.length && !applies(index));
        if (index >= steps.length) return wizard.finish();
        enter(); return steps[index].id;
      },
      back() {
        if (!active) return false;
        let i = index; do i--; while (i >= 0 && !applies(i));
        if (i < 0) return false;
        index = i; enter(); return true;
      },
      open() { if (active) waiting = true; },
      // Called when any screen closes: moves on only if this wizard opened it; says whether it did.
      screenClosed() { if (active && waiting) { waiting = false; wizard.next(); return true; } return false; },
      reenter() { if (active && index >= 0) enter(); },
      skipAll() { return wizard.finish(); },
      finish() { if (!active) return null; active = false; waiting = false; index = -1; return onEnd(); }
    };
    return wizard;
  }
  root.NXE = root.NXE || {};
  root.NXE.createWizard = createWizard;
  if (typeof module !== 'undefined') module.exports = { createWizard };
})(typeof window !== 'undefined' ? window : globalThis);

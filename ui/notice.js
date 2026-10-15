'use strict';
// A notification in the style of the Xbox 360's "Achievement unlocked": a grey pill that slides in from the right at the top right of the screen,
// shows for a few seconds with the notification sound, and goes. Notices wait in a queue until the app is ready (not while the
// boot animation is playing) and are shown one after another. The same toast serves every view.
(function (root) {
  const ICON = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#0d0f0f"/><circle cx="50" cy="50" r="38" fill="none" stroke="#6b7777" stroke-width="9"/><path d="M50 12 A38 38 0 0 0 12 50" fill="none" stroke="#62c45a" stroke-width="9" stroke-linecap="butt"/><circle cx="50" cy="50" r="30" fill="#161a1a"/><rect x="45" y="25" width="10" height="26" rx="2" fill="#7fd873"/><polygon points="33,48 67,48 50,67" fill="#7fd873"/><path d="M32 74 H68" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/></svg>`;
  const DEFAULT_SECONDS = 5, GAP_MS = 500;
  function createNotices({ document: doc, sounds, timers } = {}) {
    let ready = false, showing = false, seconds = DEFAULT_SECONDS;
    const later = (work, ms) => (timers?.setTimeout ?? setTimeout)(work, ms); // looked up when needed, not when created
    const queue = [], seen = new Set();
    const element = () => doc.getElementById('toast');
    function next() {
      if (!ready || showing) return;
      const toast = element(), notice = queue.shift();
      if (!toast || !notice) return;
      showing = true;
      toast.replaceChildren();
      const icon = doc.createElement('span'); icon.className = 'toast-icon'; icon.innerHTML = ICON;
      const words = doc.createElement('span'); words.className = 'toast-words';
      const title = doc.createElement('span'); title.className = 'toast-title'; title.textContent = notice.title;
      const text = doc.createElement('span'); text.className = 'toast-text'; text.textContent = notice.text;
      words.append(title, text); toast.append(icon, words);
      toast.classList.remove('hidden'); void toast.offsetWidth; toast.classList.add('show');
      sounds?.play('notify');
      later(() => {
        toast.classList.remove('show');
        later(() => { toast.classList.add('hidden'); showing = false; next(); }, 500 + GAP_MS);
      }, seconds * 1000);
    }
    return {
      // How long each one stays up, 0 to 5 seconds; at 0 notifications are off (nothing shows, nothing sounds).
      setSeconds(value) { if (typeof value === 'number' && value >= 0 && value <= 5) seconds = value; },
      get seconds() { return seconds; },
      // A notice with the same id is shown once only.
      post(notice) {
        if (!notice || typeof notice.title !== 'string' || typeof notice.text !== 'string') return false;
        if (seconds === 0) return false;
        if (notice.id) { if (seen.has(notice.id)) return false; seen.add(notice.id); }
        queue.push({ title: notice.title.slice(0, 80), text: notice.text.slice(0, 160) }); next(); return true;
      },
      // Called when the boot animation is over (or there is none).
      start() { ready = true; next(); },
      get pending() { return queue.length + (showing ? 1 : 0); },
      get showing() { return showing; }
    };
  }
  root.NXE = root.NXE || {};
  root.NXE.createNotices = createNotices;
  if (typeof module !== 'undefined') module.exports = { createNotices, DEFAULT_SECONDS };
})(typeof window !== 'undefined' ? window : globalThis);

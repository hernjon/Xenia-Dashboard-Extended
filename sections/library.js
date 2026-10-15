'use strict';
// The Game Library section: items are the scanned games (or, inside a multi-disc game, its discs).
// All wording lives here so every skin shows the same captions.
(function (root) {
  function registerLibrarySection(registry, ctx) {
    registry.register({
      id: 'library', label: 'Game Library', kind: 'rail', order: 10,
      items() {
        const disc = ctx.disc();
        return ctx.games().map(game => ({
          id: game.id, title: game.title, game,
          art: game.cover_art_path && !game.uses_fallback_art ? game.cover_art_path : null,
          badge: disc ? game.title : game.discs ? `${game.discs.length} discs` : null
        }));
      },
      caption(items, index) {
        const disc = ctx.disc(), item = items[index];
        return {
          title: item?.title || 'No Games Found',
          heading: disc ? `${disc.game.title} · Choose disc` : 'Game Library',
          subtitle: disc ? 'A: Launch selected disc · B: Return to Game Library' : item?.game.discs ? 'Press A to Choose Disc' : ctx.total() ? 'Press A to Launch' : ctx.xeniaReady && !ctx.xeniaReady() ? 'No Xenia yet: install it in Xenia Settings › Updates' : 'Choose your ROM folder in Xenia Settings › Folders',
          counter: items.length ? `${index + 1} of ${items.length}${disc ? ' discs' : ''}` : '0 games',
          empty: !ctx.total()
        };
      },
      activate: item => ctx.launch(item.game),
      menu: item => ctx.options(item.game),
      alt: item => ctx.settings(item.game),
      back: () => ctx.leaveDiscs()
    });
  }
  root.NXE = root.NXE || {};
  root.NXE.registerLibrarySection = registerLibrarySection;
  if (typeof module !== 'undefined') module.exports = { registerLibrarySection };
})(typeof window !== 'undefined' ? window : globalThis);

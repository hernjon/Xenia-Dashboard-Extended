'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadDashboard } = require('./helpers/dashboard');

function harness({ firstRun = true, games = [], pinRequired = false, xeniaError = 'Xenia has not created xenia-edge.config.toml yet. Start any game once, then come back.' } = {}) {
  class Element {
    constructor(t) { this.tagName = t; this.className = ''; this.children = []; this.textContent = ''; this.style = { removeProperty() {}, setProperty() {} }; const classes = new Set(); this.classList = { toggle: (c, on) => { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); }, add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) }; }
    append(...c) { this.children.push(...c); } replaceChildren(...c) { this.children = c; } setAttribute() {} addEventListener() {} cloneNode() { return new Element(this.tagName); } querySelectorAll() { return []; } scrollIntoView() {}
    find(cls) { if (this.className.split(' ').includes(cls)) return this; for (const child of this.children) { const hit = child.find?.(cls); if (hit) return hit; } return null; }
  }
  const byId = {}, document = { body: new Element('body'), getElementById: id => byId[id] ||= new Element('div'), createElement: t => new Element(t) };
  const calls = [], locks = [];
  const state = { skin: 'nxe', backgrounds: [], selected: null, buttons: {} };
  const api = {
    wizardState: async () => ({ first_run: firstRun }), wizardBegin: async () => { calls.push('begin'); return { session: firstRun }; }, wizardEnd: async () => { calls.push('end'); return true; },
    setSkin: async name => { calls.push(['skin', name]); return { ...state, skin: name }; }, getAdminAccess: async () => ({ pin_required: pinRequired }), unlockAdmin: async () => true, lockAdmin: async () => { locks.push('lock'); },
    coverSources: async () => [{ id: 'launchbox', label: 'LaunchBox', needs_download: true, ready: false }, { id: 'xenia-manager', label: 'Xenia Manager', needs_download: false, ready: true }],
    prepareCoverSource: async id => { calls.push(['prepare', id]); }, autoCovers: async (mode, all) => { calls.push(['covers', mode, all]); return { games: [{ id: 'g', title: 'G' }], downloaded: 3, missing: 1 }; },
    getXeniaSettings: async () => { throw new Error(xeniaError); },
    getLibrary: async () => ({ games, xenia_ready: false }), getSettings: async () => ({ locked_sections: [], rom_directories: [], games: [] })
  };
  const context = vm.createContext({ window: { electronAPI: api, addEventListener() {}, matchMedia: () => ({ matches: false }), uiSounds: { play() {}, configure() {} } }, document, requestAnimationFrame() {}, navigator: {}, setTimeout, clearTimeout });
  loadDashboard(vm, context, 'gamesList=[];xeniaReady=false;renderCarousel();');
  const run = code => vm.runInContext(code, context);
  const settle = () => new Promise(resolve => setImmediate(resolve)).then(() => new Promise(resolve => setImmediate(resolve)));
  return { run, byId, calls, locks, settle };
}

test('on a first run the wizard begins with the neutral View picker and holds the wizard session', async () => {
  const { run, byId, calls, settle } = harness();
  run('wizardPending=true;maybeStartWizard()');
  await settle();
  assert.deepEqual(calls, ['begin']);
  assert.equal(run('mode'), 'wizard-view');
  assert.equal(byId['wizard-stage'].classList.contains('hidden'), false, 'the neutral screen is up');
  assert.equal(run('viewPicker.focus'), 0, 'neutral: it starts on the oldest, not on the default view');
  run("input('b')");
  assert.equal(byId['guide-title'].textContent, 'Skip setup?', 'B on the first step asks, it does not leave a dead screen');
});

test('it does not start unasked when it is not a first run, or while the boot animation plays', async () => {
  const { run, calls, settle } = harness({ firstRun: false });
  run('wizardPending=false;maybeStartWizard()');
  await settle();
  assert.deepEqual(calls, []);
  const second = harness();
  second.run('bootOn=true;wizardPending=true;maybeStartWizard()');
  await second.settle();
  assert.deepEqual(second.calls, [], 'waits for the boot animation');
  second.run('bootOn=false;maybeStartWizard()');
  await second.settle();
  assert.deepEqual(second.calls, ['begin']);
});

test('choosing a view applies it, hides the neutral screen and moves on to the Xenia step in that view', async () => {
  const { run, byId, calls, settle } = harness();
  run('wizardPending=true;maybeStartWizard()'); await settle();
  run("input('right');input('a')"); await settle();
  assert.deepEqual(calls.at(-1), ['skin', 'nxe']);
  assert.equal(byId['wizard-stage'].classList.contains('hidden'), true);
  assert.equal(byId['guide-title'].textContent, 'Set up Xenia');
  assert.match(byId['guide-text'].textContent, /Setup · step 2 of 3/, 'no games yet: three steps');
  assert.deepEqual(byId['guide-buttons'].children.map(b => b.textContent), ['Install or choose Xenia', 'Skip this step', 'Skip setup']);
});

test('B on a step goes back, Skip this step moves on, Skip setup ends the wizard and shows the dashboard', async () => {
  const { run, byId, calls, settle } = harness();
  run('wizardPending=true;maybeStartWizard()'); await settle();
  run("input('right');input('a')"); await settle();       // NXE chosen (the Blades skin needs more DOM than this fake has)
  run("input('b')");                                      // back from the Xenia card
  assert.equal(run('mode'), 'wizard-view', 'back returns to the picker');
  run("input('a')"); await settle();
  run("input('down');input('a')");                         // Skip this step
  assert.equal(byId['guide-title'].textContent, 'Choose your game folders');
  run("input('down');input('down');input('a')"); await settle(); // Skip setup
  assert.equal(calls.at(-1), 'end');
  assert.equal(run('wizardRun'), null);
  assert.equal(run('mode'), 'library');
});

test('the covers step appears only when the folders step found games', async () => {
  const { run, byId, settle } = harness();
  run('wizardPending=true;maybeStartWizard()'); await settle();
  run("input('right');input('a')"); await settle();
  run("gamesList=[{id:'g',title:'G'}]");
  run("input('down');input('a')");                         // skip Xenia
  run("input('down');input('a')");                         // skip folders
  assert.equal(byId['guide-title'].textContent, 'Download covers');
  assert.match(byId['guide-text'].textContent, /step 4 of 4/);
});

test('the covers step does it all inside the wizard: data, then covers, then Continue', async () => {
  const { run, byId, calls, settle } = harness();
  run('wizardPending=true;maybeStartWizard()'); await settle();
  run("input('right');input('a')"); await settle();
  run("gamesList=[{id:'g',title:'G'}]");
  run("input('down');input('a')"); run("input('down');input('a')");       // skip Xenia and folders
  run("input('a')"); await settle();                                      // Download covers
  assert.deepEqual(calls.slice(-2), [['prepare', 'launchbox'], ['covers', 'launchbox', false]], 'the data first, then only the games without a cover');
  assert.equal(run('mode'), 'dialog', 'it never left the wizard for the covers screen');
  assert.equal(byId['guide-title'].textContent, 'Covers');
  assert.match(byId['guide-text'].textContent, /3 covers downloaded · 1 not found/);
  run("input('a')"); await settle();                                      // Continue: it was the last step
  assert.equal(calls.at(-1), 'end');
});

test('SELECT / the Guide never opens over the wizard, and the wizard stays in charge', async () => {
  const { run, byId, settle } = harness();
  run('wizardPending=true;maybeStartWizard()'); await settle();
  assert.equal(run('canOpenGuide()'), false);
  run('openGuide()');
  assert.equal(run('mode'), 'wizard-view', 'the neutral picker is still the screen');
  assert.equal(run("document.getElementById('guide-title').textContent"), '', 'no Guide window');
  run("input('right');input('a')"); await settle();
  run('openGuide()');
  assert.equal(byId['guide-title'].textContent, 'Set up Xenia', 'nor over a setup card');
});

test('closing the window during the wizard asks to skip it instead of jumping to the next card', async () => {
  const { run, byId, settle } = harness();
  run('wizardPending=true;maybeStartWizard()'); await settle();
  run('handleCloseRequest()');
  assert.equal(byId['guide-title'].textContent, 'Skip setup?');
  run("input('b')");                                       // back to the picker
  run("input('right');input('a')"); await settle();
  run("mode='library';wizardRun.open()");                  // a screen the wizard opened is on
  run('handleCloseRequest()');
  assert.equal(run('wizardRun.step'), 'xenia', 'it does not advance');
});

test('cancelling the PIN on a re-run puts the card back instead of counting the step as done', async () => {
  const { run, byId, settle } = harness({ firstRun: false, pinRequired: true });
  run('startWizard(true)'); await settle();
  run("input('a')"); await settle();                      // view chosen
  assert.equal(byId['guide-title'].textContent, 'Set up Xenia');
  run("input('a')"); await settle();                      // Install or choose Xenia -> the PIN pad
  assert.equal(run('mode'), 'pin');
  run("input('b')"); await settle();                      // B on the PIN pad
  assert.equal(run('wizardRun.step'), 'xenia', 'still on the Xenia step');
  assert.equal(byId['guide-title'].textContent, 'Set up Xenia', 'the card is back');
});

test('the wizard keeps the admin session while it runs (a closed screen does not lock it)', async () => {
  const { run, locks, settle } = harness({ firstRun: false });
  run('startWizard(true)'); await settle();
  run("input('a')"); await settle();
  run('closeModal()');
  assert.deepEqual(locks, [], 'nothing was locked in the middle of the wizard');
  run('wizardRun.skipAll()'); await settle();
  assert.deepEqual(locks, ['lock'], 'a re-run locks once, when it ends');
});

test('a Xenia that never ran: with no PIN the reason shows on the library, not on a PIN pad', async () => {
  const { run, byId, settle } = harness();
  run("unlockSection='xenia';entryAfterUnlock=()=>openXenia(null);openPin()"); await settle();
  assert.equal(run('mode'), 'dialog', 'no PIN pad: a window says what to do');
  assert.equal(byId['guide-title'].textContent, 'Start Xenia once');
});

test('with no Xenia set up, opening its settings offers to set one up, and the answer goes to the Updates screen', async () => {
  const { run, byId, settle } = harness({ xeniaError: "Error invoking remote method 'xenia:settings': Error: Install or choose a Xenia in Xenia Settings › Updates first." });
  run("unlockSection='xenia';entryAfterUnlock=()=>openXenia(null);openPin()"); await settle();
  assert.equal(byId['guide-title'].textContent, 'Xenia is not set up');
  assert.doesNotMatch(byId['guide-text'].textContent, /Error invoking/);
  assert.deepEqual(byId['guide-buttons'].children.map(b => b.textContent), ['Set up Xenia', 'Not now']);
});

test('right after installing a Xenia that has not run yet, a pop-up says to start it once; never when its settings exist', async () => {
  const { run, byId, settle } = harness();
  run("updatesView={configured:'/x/xenia',config_ready:true};explainFirstRun()"); await settle(); await new Promise(r => setTimeout(r, 5));
  assert.notEqual(byId['guide-title']?.textContent, 'Start Xenia once', 'settings exist: nothing to say');
  run("updatesView={configured:'/x/xenia',config_ready:false};explainFirstRun()"); await settle(); await new Promise(r => setTimeout(r, 5));
  assert.equal(byId['guide-title'].textContent, 'Start Xenia once');
  assert.match(byId['guide-text'].textContent, /Profiles or Advanced/);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fakeDocument } = require('./helpers/fake-dom');
const { createViewPicker, viewsFromRegistry } = require('../ui/view-picker');
const { createSkinRegistry } = require('../dashboard/skin');

const VIEWS = [
  { name: 'blades', label: 'Blades', years: '2005–2008', blurb: 'The launch dashboard.', preview: 'assets/views/blades.jpg' },
  { name: 'nxe', label: 'NXE', years: '2008–2010', blurb: 'The New Xbox Experience.', preview: 'assets/views/nxe.jpg' },
  { name: 'kinect', label: 'Kinect', years: '2010–2011', blurb: 'The ribbons.', preview: 'assets/views/kinect.jpg' }
];
function setup(extra = {}) {
  const document = fakeDocument(), host = document.createElement('div'), log = [];
  const picker = createViewPicker({ document, host, views: VIEWS, current: null, onChoose: name => log.push(['choose', name]), onBack: () => log.push(['back']), onFocus: view => log.push(['focus', view.name]), ...extra });
  return { picker, host, log };
}
const texts = node => [node.textContent, ...node.children.flatMap(texts)].filter(Boolean);

test('the picker starts on the first view, or on the current one', () => {
  assert.equal(setup().picker.focus, 0);
  assert.equal(setup({ current: 'kinect' }).picker.focus, 2);
  assert.equal(setup({ current: 'gone' }).picker.focus, 0, 'a view that no longer exists');
});

test('← and → move along the timeline and stop at the ends; A chooses; B goes back', () => {
  const { picker, log } = setup();
  assert.equal(picker.input('left'), null, 'nothing before the first');
  assert.equal(picker.input('right'), 'move'); assert.equal(picker.input('right'), 'move');
  assert.equal(picker.input('right'), null, 'nothing after the last');
  assert.equal(picker.focus, 2);
  assert.equal(picker.input('a'), 'choose');
  assert.equal(picker.input('b'), 'back');
  assert.equal(picker.input('up'), null, 'other keys do nothing');
  assert.deepEqual(log, [['focus', 'nxe'], ['focus', 'kinect'], ['choose', 'kinect'], ['back']]);
});

test('the caption names the view in focus with its years and blurb, and the line lists every year', () => {
  const { picker, host } = setup();
  assert.ok(texts(host).some(text => text.includes('Blades') && text.includes('2005–2008')));
  assert.ok(texts(host).includes('The launch dashboard.'));
  picker.input('right');
  assert.ok(texts(host).includes('The New Xbox Experience.'));
  assert.ok(!texts(host).includes('The launch dashboard.'), 'the blurb follows the focus');
  for (const view of VIEWS) assert.ok(texts(host).includes(view.label), `${view.label} is on the line`);
});

test('a preview that cannot be loaded leaves the text in place and the picker working', () => {
  const { picker, host } = setup();
  const image = host.find('vp-preview');
  assert.ok(image, 'there is a preview image');
  image.onerror();
  assert.ok(texts(host).includes('The launch dashboard.'));
  assert.equal(picker.input('right'), 'move');
});

test('a picker with no views is refused, and destroy empties the host', () => {
  const document = fakeDocument();
  assert.throws(() => createViewPicker({ document, host: document.createElement('div'), views: [], onChoose() {}, onBack() {} }), /at least one view/);
  const { picker, host } = setup();
  picker.destroy();
  assert.deepEqual(host.children, []);
});

test('the timeline is built from the registry in release order, using about when a skin has it', () => {
  const registry = createSkinRegistry(), base = { mount() {}, showSections() {}, applyTheme() {}, setMotion() {}, renderRail() {}, focusRail() {}, setLaunch() {} };
  registry.register({ ...base, name: 'late', label: 'Late (2011)', since: 2011, about: { name: 'Late', years: '2011', blurb: 'b' } });
  registry.register({ ...base, name: 'early', label: 'Early (2005)', since: 2005 });
  const views = viewsFromRegistry(registry);
  assert.deepEqual(views.map(view => view.name), ['early', 'late']);
  assert.deepEqual({ ...views[0] }, { name: 'early', label: 'Early (2005)', years: '', blurb: '', preview: 'assets/views/early.jpg' }, 'a skin without about still appears');
  assert.equal(views[1].label, 'Late'); assert.equal(views[1].years, '2011');
});

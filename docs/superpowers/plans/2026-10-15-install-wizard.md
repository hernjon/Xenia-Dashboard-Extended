# Install wizard and View picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-run, controller-driven install wizard (view → Xenia → ROM folders → covers) whose first step is a neutral timeline View picker that is also the *Dashboard Settings › View* screen, plus the rename of "Look" to "View" everywhere the user reads it.

**Architecture:** Pure logic in two small modules (`src/wizard-state.js` for the first-run rule, `ui/wizard.js` for the step runner), one reusable DOM component (`ui/view-picker.js`), and thin glue in `ui/renderer.js`. Steps 2–4 reuse the existing Updates / Folders / Covers screens through `enterFromDashboard()`; a `closeModal()` hook hands control back to the runner. The main process grants a restricted, in-memory admin session (scopes `xenia` and `dashboard`) only while a first-run wizard is active.

**Tech Stack:** Electron (main + classic-script renderer), `node:test` run through `ELECTRON_RUN_AS_NODE` on the desktop, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-15-install-wizard-design.md`

## Global Constraints

- Everything the user reads says **View**, never "Look": UI, README, docs, errors (`Invalid view`). Code identifiers and the saved `skin` key do not change (existing `library.json` files keep working).
- Steps after the view are exactly: **Xenia**, **ROM folders**, **Covers** (covers only when games were found). No PIN step.
- The wizard opens by itself only when `isFirstRun(library)` is true: no `wizard_done`, no saved `skin`, no `xenia_executable`, no ROM directories. Existing installs never see it unasked.
- The wizard session covers only the scopes `xenia` and `dashboard`, lives in memory only while the wizard runs, and is closed by `wizard:end`.
- No new Microsoft artwork: the neutral screen uses plain CSS (grey, white text, no green, no skin art, no skin sounds).
- Version 1.0.0 (`package.json` line 4 and `package-lock.json` lines 3 and 9). One delivery, committed by the owner with `!` (the auto-mode classifier blocks commits that contain Microsoft assets); every commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Tests: `npm test` = `node --test "test/**/*.test.js"`, 203 passing before this work. On the LXC there is no `node`; run them with `bash /tmp/claude-1000/-home-claude/675a06e0-9320-4f6a-8661-f6d935dc1567/scratchpad/t.sh` (tars the repo to the desktop and runs `ELECTRON_RUN_AS_NODE=1 electron --test`), then `ssh desktop 'cd /tmp/xd-t && ELECTRON_RUN_AS_NODE=1 ~/.local/opt/xenia-dashboard/node_modules/electron/dist/electron --test "test/**/*.test.js" 2>&1 | grep -E "^ℹ (tests|pass|fail)"'` for the exact count. Below this is written as **Run the tests**.

## Review Focus

1. **Quit in the middle of the wizard after choosing a view** → the skin is saved, so `first_run` is false on the next start and the wizard does not come back (the user can run it from Dashboard Settings). Must not crash; pinned in Task 2.
2. **`wizard:begin` called twice, or after the wizard ended / on a configured install** → twice is harmless; after the end or when configured it must fail with the normal "session expired" error. Pinned in Task 2.
3. **ROM step finds no games** → the covers step disappears and the progress strip says "of 3", not "of 4". Pinned in Task 6.
4. **A preview image is missing** → the picker still shows name, years and blurb and keeps working. Pinned in Task 5.
5. **B on step 1** must not leave the user stuck on a dark screen: it asks "Skip setup?" and both answers lead somewhere. Pinned in Task 7.
6. **A skin registered without `about`** (a future skin) still appears in the timeline using its `label`. Pinned in Task 4/5.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/wizard-state.js` (new) | `isFirstRun(library)`, `markDone(library)` — pure |
| `src/main.js` (modify) | wizard session flag, `wizard:state/begin/end`, startup marking, `Invalid view` |
| `src/preload.js` (modify) | `wizardState`, `wizardBegin`, `wizardEnd` |
| `src/local-assets.js` (modify) | serve `ui/view-picker.js`, `ui/wizard.js`, `ui/wizard.css`, `assets/views/<skin>.jpg` |
| `dashboard/skin.js` (modify) | validate the optional `about` of a skin |
| `skins/*/*-skin.js` (modify) | `about = { name, years, blurb }` |
| `assets/views/*.jpg` (new) | the four previews (1280×720) |
| `ui/view-picker.js` (new) | timeline component + `viewsFromRegistry` |
| `ui/wizard.js` (new) | step runner |
| `ui/wizard.css` (new) | neutral screen + picker styling |
| `ui/renderer.js`, `index.html`, `sections/settings.js` (modify) | glue, the View screen, the Install Wizard tile |
| `test/wizard-state.test.js`, `test/view-picker.test.js`, `test/wizard.test.js`, `test/wizard-flow.test.js`, `test/vocabulary.test.js` (new) | tests |
| `docs/*`, `README.md`, `tools/ui-preview/server.js` (modify) | vocabulary, manual tests, screenshots |

---

### Task 1: First-run rule (`src/wizard-state.js`)

**Files:**
- Create: `src/wizard-state.js`
- Test: `test/wizard-state.test.js`

**Interfaces:**
- Produces: `isFirstRun(library) → boolean`, `markDone(library) → library copy with wizard_done: true`, `configured(library) → boolean`.

- [ ] **Step 1: Write the failing test** — create `test/wizard-state.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isFirstRun, markDone, configured } = require('../src/wizard-state');

const fresh = { rom_directory: '', rom_directories: [], xenia_executable: '', games: [] };

test('a brand-new library is a first run; any one thing configured is not', () => {
  assert.equal(isFirstRun(fresh), true);
  assert.equal(isFirstRun({ ...fresh, skin: 'nxe' }), false, 'a saved view');
  assert.equal(isFirstRun({ ...fresh, xenia_executable: '/x/xenia' }), false, 'a Xenia');
  assert.equal(isFirstRun({ ...fresh, rom_directories: ['/roms'] }), false, 'a ROM folder');
  assert.equal(isFirstRun({ ...fresh, rom_directory: '/roms' }), false, 'an old single ROM folder');
  assert.equal(isFirstRun({ ...fresh, wizard_done: true }), false, 'the wizard already ran');
});

test('an unreadable or odd library is never a reason to open the wizard', () => {
  assert.equal(isFirstRun(null), false);
  assert.equal(isFirstRun(undefined), false);
  assert.equal(isFirstRun({}), true, 'an empty object has nothing configured');
  assert.equal(configured({ rom_directories: 'nope' }), false);
});

test('markDone adds the flag and keeps everything else', () => {
  const done = markDone({ ...fresh, skin: 'blades' });
  assert.equal(done.wizard_done, true);
  assert.equal(done.skin, 'blades');
  assert.equal(fresh.wizard_done, undefined, 'the input is not changed');
});
```

- [ ] **Step 2: Run the test to verify it fails** — Run the tests. Expected: FAIL, `Cannot find module '../src/wizard-state'`.

- [ ] **Step 3: Write the implementation** — create `src/wizard-state.js`:

```js
'use strict';
// The install wizard opens by itself only on a library nobody has configured yet. Any one setting counts as configured,
// so an existing install never sees it unasked (it can still be run from Dashboard Settings).
const configured = library => Boolean(library && (
  library.skin || library.xenia_executable || library.rom_directory ||
  (Array.isArray(library.rom_directories) && library.rom_directories.length)
));
const isFirstRun = library => library != null && !library.wizard_done && !configured(library);
const markDone = library => ({ ...library, wizard_done: true });
module.exports = { isFirstRun, markDone, configured };
```

- [ ] **Step 4: Run the tests** — Expected: all pass (206 total: 203 + 3).

---

### Task 2: Main process — session, IPC, startup, preload

**Files:**
- Modify: `src/main.js` (near lines 6–30 requires, 188–195 sessions, 284–290 startup, after the `admin:skin` handler ~363)
- Modify: `src/preload.js`
- Test: `test/admin.test.js` (append)

**Interfaces:**
- Consumes: `isFirstRun`, `markDone` from Task 1.
- Produces IPC: `wizard:state → { first_run: boolean }`; `wizard:begin → { session: boolean }` (true on a first run, false when the caller already holds the `dashboard` session; otherwise throws the normal "Admin session expired" error); `wizard:end → true` (closes the wizard session, saves `wizard_done`). Preload: `electronAPI.wizardState()`, `wizardBegin()`, `wizardEnd()`.

- [ ] **Step 1: Write the failing test** — append to `test/admin.test.js`:

```js
test('the install wizard: a first run is detected, opens a limited session without the PIN, and ends it', async () => {
  const h = await mainHarness(false, 'none', {}, { executable: '' });
  assert.equal((await h.invoke('wizard:state')).first_run, true);
  assert.equal((await h.invoke('admin:access', 'xenia')).pin_required, true, 'before it begins, the PIN is asked');
  await assert.rejects(h.untrusted('wizard:begin'), /Untrusted/);
  assert.deepEqual({ ...(await h.invoke('wizard:begin')) }, { session: true });
  assert.deepEqual({ ...(await h.invoke('wizard:begin')) }, { session: true }, 'asking twice is harmless');
  for (const section of ['xenia', 'dashboard']) assert.equal((await h.invoke('admin:access', section)).pin_required, false, section);
  assert.equal((await h.invoke('admin:access')).pin_required, true, 'the all-access scope still needs the PIN');
  assert.ok(await h.invoke('admin:settings'), 'the Folders screen opens without a PIN');
  assert.equal((await h.invoke('admin:skin', 'blades')).skin, 'blades', 'the first step saves the chosen view');
  assert.equal((await h.invoke('wizard:state')).first_run, false, 'a library with a view is no longer a first run');
  assert.ok(await h.invoke('admin:settings'), 'the session outlives that: it ends only with the wizard');
  assert.equal(await h.invoke('wizard:end'), true);
  await assert.rejects(h.invoke('admin:settings'), /session expired/, 'the wizard session is gone');
  assert.equal((await h.invoke('admin:access', 'xenia')).pin_required, true);
  await assert.rejects(h.invoke('wizard:begin'), /session expired/, 'a finished install cannot reopen the session');
});

test('an install that is already configured never starts the wizard by itself, and re-running it needs the Dashboard session', async () => {
  const h = await mainHarness();
  assert.equal((await h.invoke('wizard:state')).first_run, false);
  await assert.rejects(h.invoke('wizard:begin'), /session expired/, 'a locked, configured install cannot open the session');
  await h.invoke('admin:unlock', '1234', 'dashboard');
  assert.deepEqual({ ...(await h.invoke('wizard:begin')) }, { session: false }, 're-running from Dashboard Settings opens no extra session');
  assert.equal((await h.invoke('admin:access', 'xenia')).pin_required, true, 'and the PIN is still asked for Xenia');
  assert.equal(await h.invoke('wizard:end'), true);
});

test('choosing an unknown view is refused with a message that says view', async () => {
  const h = await mainHarness();
  await h.invoke('admin:unlock', '1234', 'dashboard');
  await assert.rejects(h.invoke('admin:skin', 'metro'), /Invalid view/);
});
```

- [ ] **Step 2: Run the tests to verify they fail** — Expected: FAIL on the three new tests (`wizard:state` handler missing, `Invalid view` message).

- [ ] **Step 3: Implement in `src/main.js`.**

Add next to the other `require` lines (after `const {readAsset,appFile}=require('./local-assets');`):

```js
const wizardState=require('./wizard-state');
```

Replace the session helpers (the `adminSessions`/`sessionValid` lines and `pinRequiredFor`):

```js
const adminSessions=new Map();
// A first-run wizard holds a restricted session (xenia and dashboard scopes only) until wizard:end.
let wizardSession=false;
const sessionValid=key=>Date.now() <= (adminSessions.get(key) ?? 0) || (wizardSession && SECTION_IDS.includes(key));
```

```js
function pinRequiredFor(scope){if(wizardSession&&SECTION_IDS.includes(scope))return false;return library.admin_pin_required!==false&&(scope==='*'||lockedSections().includes(scope));}
```

At startup, right after `library = await scanner.loadLibrary(libraryFile);` add:

```js
    // An install that already has settings never gets the wizard unasked; remember that so a later reset of one setting does not bring it back.
    if(!library.wizard_done&&!wizardState.isFirstRun(library))library={...library,wizard_done:true};
```

Change the error text in `admin:skin` from `'Invalid look'` to `'Invalid view'`, then add after that handler:

```js
    // The install wizard. On a first run it opens a session for the Xenia and Dashboard screens without asking the PIN of a
    // fresh install; run again later (from the unlocked Dashboard Settings) it opens nothing extra.
    handle('wizard:state',()=>({first_run:wizardState.isFirstRun(library)}));
    handle('wizard:begin',()=>{
      if(wizardState.isFirstRun(library)||wizardSession){wizardSession=true;return {session:true};}
      requireAdmin('dashboard');return {session:false};
    });
    handle('wizard:end',()=>serialized(async()=>{
      if(wizardSession){wizardSession=false;for(const id of SECTION_IDS)adminSessions.delete(id);}
      const next=wizardState.markDone(library);await scanner.saveLibrary(libraryFile,next);library=next;return true;
    }));
```

In `src/preload.js` add, next to `setSkin`:

```js
  wizardState: () => ipcRenderer.invoke('wizard:state'),
  wizardBegin: () => ipcRenderer.invoke('wizard:begin'),
  wizardEnd: () => ipcRenderer.invoke('wizard:end'),
```

Also change the three existing `Invalid look` expectations in `test/admin.test.js` (the `/Invalid look/` regexes inside the test titled *the look (skin) is changed from the Dashboard section…*) to `/Invalid view/` and rename that test's title to `the view (skin) is changed from the Dashboard section; only views that exist are accepted`.

- [ ] **Step 4: Run the tests** — Expected: all pass (209 total).

---

### Task 3: Vocabulary — Look becomes View

**Files:**
- Create: `test/vocabulary.test.js`
- Modify: every file the new test reports (user-visible strings, comments, docs)

**Interfaces:** none; this task only changes words. Identifiers (`lookLabel`, `lookChoices`, `offerBootOfLook`, `key:'look'`, `skin`, `admin:skin`) stay.

- [ ] **Step 1: Write the failing test** — create `test/vocabulary.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

// "View" is the user's word for a whole dashboard style (Blades, NXE, Kinect, Metro). "look" as a noun for that is gone;
// the verb ("how it looks", "looks like", "look at") is fine.
const FILES = [
  'README.md', 'docs/ARCHITECTURE.md', 'docs/MANUAL-TESTS.md', 'docs/NXE-ASSETS.md', 'docs/ROADMAP.md',
  'index.html', 'sections/settings.js', 'ui/renderer.js', 'ui/notice.js', 'ui/ui-sounds.js', 'ui/covers-ui.js',
  'src/main.js', 'src/nxe.js', 'dashboard/skin.js', 'dashboard/navigation.js', 'dashboard/sections.js',
  'skins/blades/blades-skin.js', 'skins/nxe/nxe-skin.js', 'skins/kinect/kinect-skin.js', 'skins/metro-v1/metro-v1-skin.js'
];
const VERB = /\b(looks? like|looks? at|looks? up|looks again|looks and moves|how (it|the dashboard) looks|dashboard looks|download looks|a screen looks)\b/gi;

test('no user-visible text or documentation calls a dashboard style a "look"', () => {
  const found = [];
  for (const file of FILES) {
    fs.readFileSync(path.join(root, file), 'utf8').split('\n').forEach((line, index) => {
      if (/\blooks?\b/i.test(line.replace(VERB, ''))) found.push(`${file}:${index + 1}: ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(found, [], 'say "view" instead of "look" in:\n' + found.join('\n'));
});

test('the error for an unknown view says view', () => {
  assert.match(fs.readFileSync(path.join(root, 'src/main.js'), 'utf8'), /Error\('Invalid view'\)/);
});
```

- [ ] **Step 2: Run the tests to verify the first one fails** — Expected: FAIL, listing every `file:line` that still says look.

- [ ] **Step 3: Replace the noun** in each listed line, working through the report until it is empty. Rules: noun "look(s)" for a style → "view(s)"; "Look" row/title → "View"; "the Look and, where the look has them, its wallpapers" → "the View and, where the view has them, its wallpapers"; "dashboard's own look" → "dashboard's own style"; "A saved look that no longer exists falls back to NXE" → "A saved view …"; the Dashboard Settings tile label changes from **Themes** to **View** (`sections/settings.js`: `tile('themes', 'View', 'Its view and wallpaper', 'themes')`; the tile id stays `themes` so `dashboard:themes` and the tests keep working) and the screen title in `renderThemes()` (`modal('Themes', …)`) becomes `modal('View', …)`; row label `Look: ${lookLabel(skin.name)}` → `View: ${lookLabel(skin.name)}`; in the choice dialog for the boot animation, "Follow the theme" → "Follow the view", `follows the theme, …` → `follows the view, …`, and its help text ("Follow the theme plays the one of the look in use; or pick one to keep it with any look.") → ("Follow the view plays the one of the view in use; or pick one to keep it with any view."); in the README the heading "Four eras…" paragraph "Pick a look in *Dashboard Settings*" → "Pick a view in *Dashboard Settings › View*", "A look is only a skin" → "A view is only a skin", "## Every screen, in every look" → "## Every screen, in every view", "the four looks" → "the four views", and the image alt text "NXE look" → "NXE view". In `docs/ROADMAP.md` line 63 ("choose the look") becomes "choose the view" (the wizard entry is rewritten in Task 8).

Update the tests that assert the old words: in `test/dashboard.test.js` change `assert.equal(byId['guide-title'].textContent, 'Look')` flow later in Task 7 (leave it for now; it still passes because Task 3 does not change the choice dialog title yet — `openChoice({title:'Look'…` becomes `title:'View'` in Task 7 together with the picker).

- [ ] **Step 4: Run the tests** — Expected: all pass (211 total), vocabulary test green.

---

### Task 4: View metadata and previews

**Files:**
- Modify: `dashboard/skin.js` (validation), `skins/blades/blades-skin.js:173-175`, `skins/nxe/nxe-skin.js:97-99`, `skins/kinect/kinect-skin.js:114-116`, `skins/metro-v1/metro-v1-skin.js:71-73`, `src/local-assets.js`
- Create: `assets/views/blades.jpg`, `assets/views/nxe.jpg`, `assets/views/kinect.jpg`, `assets/views/metro-v1.jpg`
- Test: `test/dashboard.test.js` (append)

**Interfaces:**
- Produces: each skin may carry `about = { name: string, years: string, blurb: string }` (all non-empty strings); `appFile('assets/views/<skin>.jpg')` is true.

- [ ] **Step 1: Write the failing test** — append to `test/dashboard.test.js`:

```js
test('every view describes itself for the timeline, and its preview is served and packaged', () => {
  const { createBladesSkin } = require('../skins/blades/blades-skin'), { createNxeSkin } = require('../skins/nxe/nxe-skin');
  const { createKinectSkin } = require('../skins/kinect/kinect-skin'), { createMetroSkin } = require('../skins/metro-v1/metro-v1-skin');
  const { appFile } = require('../src/local-assets');
  const { createSkinRegistry } = require('../dashboard/skin');
  for (const skin of [createBladesSkin(), createNxeSkin(), createKinectSkin(), createMetroSkin()]) {
    for (const key of ['name', 'years', 'blurb']) assert.ok(typeof skin.about?.[key] === 'string' && skin.about[key].length > 4, `${skin.name}.about.${key}`);
    const preview = `assets/views/${skin.name}.jpg`;
    assert.ok(fs.existsSync(path.join(__dirname, '..', preview)), `${preview} exists`);
    assert.ok(appFile(preview) && packaged(preview), `${preview} is served and packaged`);
  }
  assert.equal(appFile('assets/views/../x.jpg'), false);
  assert.equal(appFile('assets/views/nxe.png'), false);
  const registry = createSkinRegistry(), base = { name: 'x', mount() {}, showSections() {}, applyTheme() {}, setMotion() {}, renderRail() {}, focusRail() {}, setLaunch() {} };
  registry.register(base);
  assert.throws(() => registry.register({ ...base, name: 'y', about: { name: 'Y' } }), /about/, 'an incomplete description is refused');
  assert.throws(() => registry.register({ ...base, name: 'z', about: 'text' }), /about/);
  registry.register({ ...base, name: 'w', about: { name: 'W', years: '2013', blurb: 'A new one' } });
});
```

- [ ] **Step 2: Run the tests to verify it fails** — Expected: FAIL (`about` missing).

- [ ] **Step 3: Implement.**

In `dashboard/skin.js`, after the `rows` check in `register` add:

```js
        if (skin.about !== undefined && !(skin.about && ['name', 'years', 'blurb'].every(key => typeof skin.about[key] === 'string' && skin.about[key]))) throw Error(`Skin ${skin.name}: about needs a name, years and a blurb`);
```

Add one line after each skin's `since:`:

```js
      about: { name: 'Blades', years: '2005–2008', blurb: 'The launch dashboard: curved blades, an animated green background and the original blade sounds.' },
```
```js
      about: { name: 'NXE', years: '2008–2010', blurb: 'The New Xbox Experience: cover-flow on the horizon, glossy tiles and the floating orb.' },
```
```js
      about: { name: 'Kinect', years: '2010–2011', blurb: 'The ribbon dashboard: big white tiles with green ribbons, made for a controller or a wave of the hand.' },
```
```js
      about: { name: 'Metro', years: '2011–2012', blurb: 'The Metro redesign: a grid of covers under a lowercase header, in the style of Windows Phone.' },
```

In `src/local-assets.js` add the new files to `APP_FILES` (`'ui/view-picker.js','ui/wizard.js','ui/wizard.css'`) and the preview pattern:

```js
// The previews of the views (the timeline in the install wizard and in Dashboard Settings › View).
const VIEW_PREVIEW=/^assets\/views\/[a-z][a-z0-9-]*\.jpg$/;
const appFile=file=>APP_FILES.has(file)||(SKIN_ASSET.test(file)&&!file.includes('..'))||VIEW_PREVIEW.test(file);
```

Create the previews from the README screenshots (run on the LXC; ffmpeg lives on the desktop):

```bash
cd ~/projects/xenia-dashboard && mkdir -p assets/views
for pair in blades:blades nxe:nxe kinect:kinect metro:metro-v1; do
  src=${pair%%:*}; dst=${pair##*:}
  scp -q docs/screenshots/$src-library.jpg desktop:/tmp/pv-$src.jpg
  ssh desktop "ffmpeg -nostdin -loglevel error -y -i /tmp/pv-$src.jpg -vf scale=1280:720 -q:v 4 /tmp/pv-out-$dst.jpg"
  scp -q desktop:/tmp/pv-out-$dst.jpg assets/views/$dst.jpg
done
ls -la assets/views
```
Expected: four files, each roughly 100–250 KB.

- [ ] **Step 4: Run the tests** — Expected: all pass (212 total). The existing `dashboard.test.js` check that every script/CSS in `index.html` is served still passes because `index.html` is not changed yet.

---

### Task 5: The View picker component (`ui/view-picker.js`)

**Files:**
- Create: `ui/view-picker.js`
- Test: `test/view-picker.test.js`

**Interfaces:**
- Produces (browser global `NXE`): `NXE.createViewPicker({ document, host, views, current, onChoose, onBack, onFocus }) → { input(action) → 'move'|'choose'|'back'|null, get focus() → number, destroy() }` where `views = [{ name, label, years, blurb, preview }]`; `current` is a view name or `null` (focus starts on it, or on the first view); `NXE.viewsFromRegistry(registry) → views` (release order, preview = `assets/views/<name>.jpg`, falls back to `label` when a skin has no `about`).
- The module also exports them with `module.exports` for the tests.

- [ ] **Step 1: Write the failing test** — create `test/view-picker.test.js`:

```js
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
  assert.ok(texts(host).includes('Blades'));
  assert.ok(texts(host).some(text => text.includes('2005–2008')));
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
```

- [ ] **Step 2: Run the tests to verify they fail** — Expected: FAIL, `Cannot find module '../ui/view-picker'`.

- [ ] **Step 3: Write the implementation** — create `ui/view-picker.js`:

```js
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
        mark.append(el('div', 'vp-year', entry.years.slice(0, 4)), el('div', 'vp-dot'), el('div', 'vp-label', entry.label));
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
```

Note for the fake DOM: `image.onerror()` in the test runs the handler assigned above; `host.find('vp-preview')` matches because the element's `className` is `'vp-preview'` (the fake `find` splits `className`).

- [ ] **Step 4: Run the tests** — Expected: all pass (218 total).

---

### Task 6: The step runner (`ui/wizard.js`) and the neutral stylesheet

**Files:**
- Create: `ui/wizard.js`, `ui/wizard.css`
- Test: `test/wizard.test.js`

**Interfaces:**
- Produces: `NXE.createWizard({ steps, onEnd }) → { active, step, progress() → {step, of}, start(), next(), back() → boolean, open(), screenClosed(), skipAll(), finish() }`. A step is `{ id: string, when?: () => boolean, enter: () => void }`. `open()` marks that a screen was opened for the current step; `screenClosed()` (called by `closeModal()`) moves on only if one was open. `back()` returns `false` from the first applicable step. `onEnd()` is called once when the wizard finishes or is skipped.

- [ ] **Step 1: Write the failing test** — create `test/wizard.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWizard } = require('../ui/wizard');

function build({ games = () => true } = {}) {
  const log = [];
  const steps = [
    { id: 'view', enter: () => log.push('view') },
    { id: 'xenia', enter: () => log.push('xenia') },
    { id: 'folders', enter: () => log.push('folders') },
    { id: 'covers', when: games, enter: () => log.push('covers') }
  ];
  let ended = 0;
  return { wizard: createWizard({ steps, onEnd: () => { ended++; log.push('end'); } }), log, ended: () => ended };
}

test('the steps run in order and the wizard ends after the last one', () => {
  const { wizard, log, ended } = build();
  assert.equal(wizard.active, false);
  wizard.start();
  assert.deepEqual(log, ['view']); assert.equal(wizard.active, true); assert.equal(wizard.step, 'view');
  wizard.next(); wizard.next(); wizard.next();
  assert.deepEqual(log, ['view', 'xenia', 'folders', 'covers']);
  wizard.next();
  assert.deepEqual(log.slice(-1), ['end']); assert.equal(wizard.active, false); assert.equal(ended(), 1);
});

test('the covers step is left out when no games were found, and the progress counts only the steps that apply', () => {
  let games = false;
  const { wizard, log } = build({ games: () => games });
  wizard.start();
  assert.deepEqual({ ...wizard.progress() }, { step: 1, of: 3 });
  wizard.next(); assert.deepEqual({ ...wizard.progress() }, { step: 2, of: 3 });
  wizard.next(); assert.deepEqual({ ...wizard.progress() }, { step: 3, of: 3 });
  wizard.next();
  assert.deepEqual(log, ['view', 'xenia', 'folders', 'end'], 'no covers step');
  games = true;
  const again = build({ games: () => games });
  again.wizard.start();
  assert.deepEqual({ ...again.wizard.progress() }, { step: 1, of: 4 }, 'with games there are four');
});

test('back returns to the previous step, skipping steps that do not apply, and refuses at the first', () => {
  let games = false;
  const { wizard, log } = build({ games: () => games });
  wizard.start(); wizard.next(); wizard.next();
  assert.equal(wizard.back(), true); assert.equal(wizard.step, 'xenia');
  assert.equal(wizard.back(), true); assert.equal(wizard.step, 'view');
  assert.equal(wizard.back(), false, 'nothing before the first step');
  assert.deepEqual(log, ['view', 'xenia', 'folders', 'xenia', 'view']);
});

test('a screen that closes moves on only if the wizard opened it', () => {
  const { wizard, log } = build();
  wizard.start();
  wizard.screenClosed();
  assert.deepEqual(log, ['view'], 'a screen the wizard did not open changes nothing');
  wizard.next(); wizard.open(); wizard.screenClosed();
  assert.deepEqual(log, ['view', 'xenia', 'folders']);
  wizard.screenClosed();
  assert.deepEqual(log, ['view', 'xenia', 'folders'], 'one close, one step');
});

test('skipping ends it at once, once; and an ended wizard ignores everything', () => {
  const { wizard, log, ended } = build();
  wizard.start(); wizard.next();
  wizard.skipAll(); wizard.skipAll();
  assert.equal(ended(), 1); assert.equal(wizard.active, false);
  assert.equal(wizard.next(), null); assert.equal(wizard.back(), false);
  wizard.open(); wizard.screenClosed();
  assert.deepEqual(log, ['view', 'xenia', 'end']);
});

test('a wizard without steps is refused', () => {
  assert.throws(() => createWizard({ steps: [], onEnd() {} }), /needs steps/);
});
```

- [ ] **Step 2: Run the tests to verify they fail** — Expected: FAIL, `Cannot find module '../ui/wizard'`.

- [ ] **Step 3: Write the implementation** — create `ui/wizard.js`:

```js
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
      screenClosed() { if (active && waiting) { waiting = false; wizard.next(); } },
      skipAll() { return wizard.finish(); },
      finish() { if (!active) return null; active = false; waiting = false; index = -1; return onEnd(); }
    };
    return wizard;
  }
  root.NXE = root.NXE || {};
  root.NXE.createWizard = createWizard;
  if (typeof module !== 'undefined') module.exports = { createWizard };
})(typeof window !== 'undefined' ? window : globalThis);
```

Create `ui/wizard.css` (neutral: no skin art, no green; the picker classes are also used inside Dashboard Settings, where they inherit the skin's colours through `currentColor`):

```css
/* The install wizard's own screen and the View picker. Deliberately plain: it belongs to no dashboard. */
#wizard-stage { position:fixed; inset:0; z-index:40; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2.2vh; padding:4vh 6vw; background:#15181b; color:#e9ecef; text-align:center; }
#wizard-stage.hidden { display:none; }
.wz-title { margin:0; font-size:var(--fs-title); font-weight:600; }
.wz-sub { margin:0; font-size:var(--fs-text); color:#aab2b9; max-width:70vw; }
.wz-help { margin:0; font-size:var(--fs-help); color:#8e979e; }
.wz-host { width:min(78vw, 140vh); }
.vp-stage { width:100%; aspect-ratio:16/9; max-height:52vh; margin:0 auto; background:#0c0e10; border:1px solid #ffffff22; overflow:hidden; display:flex; align-items:center; justify-content:center; }
.vp-preview { width:100%; height:100%; object-fit:contain; }
.vp-preview.vp-missing { visibility:hidden; }
.vp-name { margin-top:1.6vh; font-size:var(--fs-row); font-weight:600; }
.vp-blurb { margin:.4vh auto 0; max-width:60vw; min-height:2.6em; font-size:var(--fs-text); opacity:.8; }
.vp-line { position:relative; display:flex; justify-content:space-between; margin:2.4vh auto 0; width:80%; }
.vp-line::before { content:''; position:absolute; left:6%; right:6%; top:calc(var(--fs-small) * 1.6); height:2px; background:currentColor; opacity:.25; }
.vp-mark { position:relative; flex:1; display:flex; flex-direction:column; align-items:center; gap:.6vh; opacity:.55; cursor:default; }
.vp-year { font-size:var(--fs-small); }
.vp-dot { width:1.6vh; height:1.6vh; border-radius:50%; background:currentColor; opacity:.7; }
.vp-label { font-size:var(--fs-text); }
.vp-mark.vp-current .vp-label::after { content:' ✓'; }
.vp-mark.vp-focus { opacity:1; }
.vp-mark.vp-focus .vp-dot { width:2.4vh; height:2.4vh; opacity:1; box-shadow:0 0 0 .5vh #ffffff44; }
.vp-mark.vp-focus .vp-label { font-weight:700; }
```

- [ ] **Step 4: Run the tests** — Expected: all pass (224 total).

---

### Task 7: Renderer glue — the View screen, the wizard flow, the Install Wizard tile

**Files:**
- Modify: `index.html`, `ui/renderer.js`, `sections/settings.js`
- Test: `test/wizard-flow.test.js` (new); `test/dashboard.test.js` (update the *Look* assertions; update the Dashboard Settings tile ids test)

**Interfaces:**
- Consumes: `NXE.createViewPicker`, `NXE.viewsFromRegistry` (Task 5), `NXE.createWizard` (Task 6), `api.wizardState/Begin/End` (Task 2), existing `showDialog`, `enterFromDashboard`, `useSkin`-via-`applyTheme`, `renderCarousel`, `showSectionColumn`, `keepRow`, `renderThemes`.
- Produces (globals in the renderer script): `startWizard(rerun)`, `wizardRun` (the runner or `null`), `maybeStartWizard()`; mode `'wizard-view'` for the neutral picker and `'views'` for the picker inside Dashboard Settings.

- [ ] **Step 1: Update the existing tests that name the old choice dialog.** In `test/dashboard.test.js`:
  - In the Dashboard Settings tile-ids test (around line 180) the tile list becomes `['themes', 'sound', 'covers', 'security', 'wizard', 'exit']` and the Dashboard section counter text becomes `'1 of 6'` where it said `'1 of 5'`; the Themes tile title assertion (if any) reads `'View'`.
  - Replace the block that starts at `run("mode='themes';selected=0;activateTheme()");` and asserts `'Look'` with:

```js
    run("mode='themes';selected=0;activateTheme()");
    assert.equal(run('mode'), 'views', 'the View row opens the timeline');
    assert.equal(run('viewPicker.focus'), 1, 'it starts on the view in use (NXE)');
    run("input('left');input('a')");
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => new Promise(resolve => setImmediate(resolve))).then(() => {
    assert.deepEqual(calls.at(-1), ['skin', 'blades']);
```
  and keep the following assertions about the boot-animation question unchanged except that the step which re-opened the choice (`activateTheme();input('a')` after `themeState={...themeState,boot_animation:'kinect'}`) becomes `run("themeState={...themeState,boot_animation:'kinect'};mode='themes';selected=0;activateTheme();input('a')");` (the picker starts on the view in use, and A on it re-chooses it, which still offers the boot-animation question).

- [ ] **Step 2: Write the failing flow test** — create `test/wizard-flow.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadDashboard } = require('./helpers/dashboard');

function harness({ firstRun = true, games = [] } = {}) {
  class Element {
    constructor(t) { this.tagName = t; this.className = ''; this.children = []; this.textContent = ''; this.style = { removeProperty() {}, setProperty() {} }; const classes = new Set(); this.classList = { toggle: (c, on) => { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); }, add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) }; }
    append(...c) { this.children.push(...c); } replaceChildren(...c) { this.children = c; } setAttribute() {} addEventListener() {} cloneNode() { return new Element(this.tagName); } querySelectorAll() { return []; } scrollIntoView() {}
    find(cls) { if (this.className.split(' ').includes(cls)) return this; for (const child of this.children) { const hit = child.find?.(cls); if (hit) return hit; } return null; }
  }
  const byId = {}, document = { body: new Element('body'), getElementById: id => byId[id] ||= new Element('div'), createElement: t => new Element(t) };
  const calls = [];
  const state = { skin: 'nxe', backgrounds: [], selected: null, buttons: {} };
  const api = {
    wizardState: async () => ({ first_run: firstRun }), wizardBegin: async () => { calls.push('begin'); return { session: firstRun }; }, wizardEnd: async () => { calls.push('end'); return true; },
    setSkin: async name => { calls.push(['skin', name]); return { ...state, skin: name }; }, getAdminAccess: async () => ({ pin_required: false }), unlockAdmin: async () => true, lockAdmin: async () => {},
    getLibrary: async () => ({ games, xenia_ready: false }), getSettings: async () => ({ locked_sections: [], rom_directories: [], games: [] })
  };
  const context = vm.createContext({ window: { electronAPI: api, addEventListener() {}, matchMedia: () => ({ matches: false }), uiSounds: { play() {} } }, document, requestAnimationFrame() {}, navigator: {}, setTimeout, clearTimeout });
  loadDashboard(vm, context, 'gamesList=[];renderCarousel();');
  const run = code => vm.runInContext(code, context);
  const settle = () => new Promise(resolve => setImmediate(resolve)).then(() => new Promise(resolve => setImmediate(resolve)));
  return { run, byId, calls, settle };
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
  run("input('a')"); await settle();                       // first view chosen
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
  run("input('a')"); await settle();
  run("gamesList=[{id:'g',title:'G'}]");
  run("input('down');input('a')");                         // skip Xenia
  run("input('down');input('a')");                         // skip folders
  assert.equal(byId['guide-title'].textContent, 'Download covers');
  assert.match(byId['guide-text'].textContent, /step 4 of 4/);
});
```

- [ ] **Step 3: Run the tests to verify they fail** — Expected: FAIL (`maybeStartWizard is not defined` and the updated dashboard assertions).

- [ ] **Step 4: Implement.**

`index.html`: add `<link rel="stylesheet" href="ui/wizard.css">` right after the `ui/notice.css` link; add `<div id="wizard-stage" class="hidden"></div>` just before `<div id="guide-dialog" …>`; add `<script src="ui/view-picker.js"></script>` and `<script src="ui/wizard.js"></script>` right after `<script src="ui/notice.js"></script>`.

`sections/settings.js`: in the Dashboard tiles insert, before `tile('exit', …)`:

```js
        tile('wizard', 'Install Wizard', 'Set up the view, Xenia, your folders and covers again', 'settings'),
```

`ui/renderer.js`:

1. Add to `DASHBOARD_ENTRIES` (it keeps the PIN flow of the other tiles):

```js
  'dashboard:wizard':()=>startWizard(true),
```

2. Replace the Look branch in `activateTheme` (the line that starts `if(row.key==='look')return openChoice({title:'Look',…`) with:

```js
  if(row.key==='look')return openViewPicker();
```

and add, next to `offerBootOfLook`:

```js
// Dashboard Settings › View: the same timeline as the install wizard, drawn in the panel of the view in use.
let viewPicker=null;
function openViewPicker(){
  mode='views';selected=0;modal('View','← →: browse · A: apply · B: return');
  const host=node('div','vp-host');content.replaceChildren(host);
  viewPicker=NXE.createViewPicker({document,host,views:NXE.viewsFromRegistry(NXE.skins),current:skin.name,
    onFocus:()=>window.uiSounds?.play('focus'),onBack:()=>renderThemes(),
    onChoose:async name=>{renderThemes();await keepRow(()=>api.setSkin(name),renderThemes);offerBootOfLook();}});
}
```

and in `input(action)` add, right after `if(mode==='dialog')return dialogInput(action);`:

```js
  if(mode==='wizard-view'||mode==='views'){viewPicker?.input(action);return;}
```

3. The wizard glue (append after the Dashboard Settings code, before the keyboard handler):

```js
// ---- The install wizard (first run, or Dashboard Settings › Install Wizard) ----
const wizardStage=document.getElementById('wizard-stage');
let wizardRun=null,wizardRerun=false,wizardChosen=false,wizardPending=false;
const showStage=on=>wizardStage.classList.toggle('hidden',!on);
const wizardStrip=()=>{const p=wizardRun.progress();return `Setup · step ${p.step} of ${p.of}`;};
function wizardView(){
  mode='wizard-view';showStage(true);
  const host=node('div','wz-host');
  wizardStage.replaceChildren(node('h1','wz-title','Choose how your dashboard looks'),node('p','wz-sub','Four dashboards from the Xbox 360 years, oldest first. You can change it later in Dashboard Settings › View.'),host,node('p','wz-help','← → browse · A choose · B back'));
  viewPicker=NXE.createViewPicker({document,host,views:NXE.viewsFromRegistry(NXE.skins),current:wizardRerun||wizardChosen?skin.name:null,
    onChoose:chooseWizardView,onBack:askSkipSetup});
}
async function chooseWizardView(name){
  if(busy)return;busy=true;
  try{applyTheme(await api.setSkin(name));wizardChosen=true;showStage(false);mode='library';}
  catch(error){status(error.message);busy=false;return;}
  busy=false;window.uiSounds?.play('select');wizardRun.next();
}
function askSkipSetup(){
  showDialog({title:'Skip setup?',text:'You can run the Install Wizard again from Dashboard Settings.',
    buttons:[{label:'Continue setup',run:wizardView},{label:'Skip setup',run:()=>wizardRun.skipAll()}],onCancel:wizardView});
}
function wizardCard({title,text,primary,onPrimary}){
  showDialog({title,text:`${wizardStrip()} — ${text}`,
    buttons:[{label:primary,run:onPrimary},{label:'Skip this step',run:()=>wizardRun.next()},{label:'Skip setup',run:()=>wizardRun.skipAll()}],
    onCancel:()=>wizardRun.back()});
}
const WIZARD_STEPS=[
  {id:'view',enter:()=>wizardView()},
  {id:'xenia',enter:()=>wizardCard({title:'Set up Xenia',text:xeniaReady?'Xenia is set up. You can change it or keep it.':'Install Xenia, or choose a copy you already have.',
    primary:xeniaReady?'Change Xenia':'Install or choose Xenia',onPrimary:()=>{wizardRun.open();enterFromDashboard('xenia:updates');}})},
  {id:'folders',enter:()=>wizardCard({title:'Choose your game folders',text:'Pick the folders where your games are. The library is read when you leave the screen.',
    primary:'Choose game folders',onPrimary:()=>{wizardRun.open();enterFromDashboard('xenia:locations');}})},
  {id:'covers',when:()=>gamesList.length>0,enter:()=>wizardCard({title:'Download covers',text:`${gamesList.length} games found. Download their covers now?`,
    primary:'Download covers',onPrimary:()=>{wizardRun.open();enterFromDashboard('dashboard:covers');}})}
];
async function endWizard(){
  showStage(false);mode='library';
  try{await api.wizardEnd();}catch(error){status(error.message);}
  if(wizardRerun)api.lockAdmin().catch(()=>{});
  wizardRun=null;
  try{const library=await api.getLibrary();gamesList=library.games;xeniaReady=library.xenia_ready!==false;}catch{/* the library stays as it was */}
  showSectionColumn();renderCarousel();
}
async function startWizard(rerun=false){
  wizardRerun=rerun;wizardChosen=false;
  try{await api.wizardBegin();}catch(error){status(error.message);return;}
  document.body.classList.remove('modal-open');document.getElementById('overlay').classList.add('hidden');
  wizardRun=NXE.createWizard({steps:WIZARD_STEPS,onEnd:endWizard});wizardRun.start();
}
// The wizard waits for the boot animation; the page asks again when it ends.
function maybeStartWizard(){if(wizardPending&&!booting()){wizardPending=false;startWizard(false);}}
```

4. Hooks:
   - At the end of `closeModal()` (after `api.lockAdmin().catch(()=>{});`) add `wizardRun?.screenClosed();`.
   - In `endBoot()` add `maybeStartWizard();` as the last statement.
   - In `handleCloseRequest()` add first: `if(wizardRun?.active&&mode==='wizard-view')return askSkipSetup();`.
   - In the `DOMContentLoaded` handler, just before `new GamepadWheelController();` add:
     `try{wizardPending=!!(await api.wizardState()).first_run;}catch{/* an old main process: no wizard */}maybeStartWizard();`

5. Strings: change `modal('Themes', …)` in `renderThemes` to `modal('View', …)` if Task 3 has not already.

- [ ] **Step 5: Run the tests** — Expected: all pass (229 total: 224 + 5 flow tests; the edited dashboard tests still pass).

---

### Task 8: Docs, screenshots, manual tests, release prep

**Files:**
- Modify: `tools/ui-preview/server.js`, `README.md`, `docs/ARCHITECTURE.md`, `docs/MANUAL-TESTS.md`, `docs/ROADMAP.md`, `package.json`, `package-lock.json`
- Create: `docs/screenshots/wizard-view.jpg`, `docs/screenshots/wizard-xenia.jpg`, `docs/screenshots/settings-view.jpg`

- [ ] **Step 1: Teach the preview tool the wizard.** In `tools/ui-preview/server.js` add to `api` (next to `setSkin`):

```js
  wizardState: () => ({ first_run: Boolean(args['first-run']) }),
  wizardBegin: () => ({ session: true }),
  wizardEnd: () => true,
```
and mention `[--first-run 1]` in the usage comment at the top.

- [ ] **Step 2: Screenshots** (the preview rig, as for the README: `bash <scratchpad>/serve.sh` restarts the server on the desktop; add `--first-run 1` to its command line first). Take three shots at 1920×1080 with `bash <scratchpad>/tour.sh <skin> <dir> …`:
  - `wizard-view.jpg`: `nxe` skin, steps `'eval:startWizard(false)' 'wait:1500' 'pad:right' 'wait:600' 'shot:wizard-view'` (the neutral timeline, second view in focus).
  - `wizard-xenia.jpg`: `kinect` skin, `'eval:startWizard(false)' 'wait:1200' 'eval:chooseWizardView("kinect")' 'wait:1500' 'shot:wizard-xenia'` (step 2 card in the chosen view).
  - `settings-view.jpg`: `blades` skin, `'pad:rt' 'pad:rt' 'wait:900' 'pad:right' 'pad:right' 'pad:a' 'wait:1200' 'shot:settings-view'` is only a guess at the path to *Dashboard Settings › View*; use `'eval:openViewPicker()'` after `'pad:rt' 'pad:rt'` if the tile order differs.
  Convert to JPG with the same `ffmpeg -q:v 3` command used for the other screenshots, copy into `docs/screenshots/`, and open each image to check that it shows what its name says and nothing personal.

- [ ] **Step 3: Documents.**
  - `README.md`: in "Four eras…" add a subsection **First run** with `wizard-view.jpg` and one sentence ("On a new install the Install Wizard opens by itself: you pick a view on a timeline of the Xbox 360 dashboards, then set up Xenia, your game folders and the covers. Run it again from *Dashboard Settings › Install Wizard*."), the `wizard-xenia.jpg` image under it, and `settings-view.jpg` under the line that tells where to pick a view. Add the wizard to the "Made for the couch" list. Keep the vocabulary test green (View, never Look).
  - `docs/ARCHITECTURE.md`: new section **Install wizard and View picker**: the three units (`ui/view-picker.js`, `ui/wizard.js`, `src/wizard-state.js`), the first-run rule, the restricted `wizardSession` in `src/main.js` (scopes `xenia`/`dashboard`, closed by `wizard:end`), the `closeModal()` hand-back, and where the preview images live (`assets/views/<skin>.jpg`, served through `VIEW_PREVIEW` in `src/local-assets.js`); a new skin adds `about` and a preview.
  - `docs/MANUAL-TESTS.md`: new section in the file's existing style (Portuguese): wizard on a fresh `userData` (`rm -rf ~/.config/'Xenia Dashboard'` on a test copy), cada view na linha do tempo, B no passo 1 ("Skip setup?"), pular cada passo, passo de capas só com jogos, refazer por *Dashboard Settings › Install Wizard* com Xenia já instalado, fechar o app no meio e reabrir (não volta sozinho), e *Dashboard Settings › View* trocando a view.
  - `docs/ROADMAP.md`: replace the Backlog entry "First-run install wizard" with a line under a new **Done** note `Install wizard and View picker — 1.0.0`, keeping Achievements and Family mode in "Next release".

- [ ] **Step 4: Version.** `package.json` line 4 and `package-lock.json` lines 3 and 9 → `1.0.0`.

- [ ] **Step 5: Run the tests** — Expected: all pass (229), including `test/vocabulary.test.js` and `test/package.test.js` (version agreement).

- [ ] **Step 6: Hand over the commit.** Write the message to `/tmp/claude-1000/-home-claude/675a06e0-9320-4f6a-8661-f6d935dc1567/scratchpad/msg.txt`:

```
1.0.0: install wizard, View picker (timeline), Look renamed to View

First run opens a neutral timeline to choose the view, then sets up Xenia,
the ROM folders and the covers in the chosen view. The same timeline is
Dashboard Settings > View, and the wizard can be re-run from Dashboard
Settings > Install Wizard. A restricted session (xenia and dashboard scopes)
lives only while the first-run wizard runs.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

and give the owner the usual command:
`! cd ~/projects/xenia-dashboard && git add -A && git commit -F <msg.txt> && git push origin HEAD && ssh desktop 'cd ~/.local/opt/xenia-dashboard && git fetch -q origin && git reset -q --hard origin/main'`

Then ask the owner to open the app once on the desktop; for a true first run, move `~/.config/NXE/library.json` aside (the app falls back to a fresh library) and put it back afterwards.

---

## Self-review

- **Spec coverage:** goal and Look→View (Task 3, 7); steps view/Xenia/folders/covers (7); timeline with preview (5, 6); neutral first screen, the view applied at once and next steps in it (7); same picker in Dashboard Settings (7); *Install Wizard* entry (7); first-run rule and `wizard_done` marking incl. existing installs (1, 2); restricted session (2); previews in `assets/` and served (4); view metadata (4); error handling: missing preview (5), failed install stays on the card because the Updates screen shows its own error and `closeModal` is the only way forward (7), no games → no covers step (6, 7), a throwing step reports through `status()` (7); testing list (1, 2, 3, 5, 6, 7); manual tests and docs (8); delivery 1.0.0 (8).
- **Placeholders:** none; the only judgement left to the executor is the path to the View screen for one screenshot (Task 8 step 2), with the exact fallback command given.
- **Type consistency:** `createViewPicker` / `viewsFromRegistry` / `createWizard` signatures match between Tasks 5, 6 and 7; IPC names `wizard:state|begin|end` and preload names `wizardState|Begin|End` match between Tasks 2 and 7; `views` entries `{name,label,years,blurb,preview}` are the same in the component, its test and the renderer.
- **Review Focus coverage:** items 1–2 in Task 2's tests, 3 in Task 6, 4 in Task 5, 5 in Task 7, 6 in Task 5/4.

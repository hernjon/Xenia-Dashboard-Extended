# Install wizard and View picker — design

Date: 2026-10-15 · Owner request · Status: draft for review

## Goal

A first-run, controller-driven setup that teaches the evolution of the Xbox 360 dashboard and gets a new
install working: pick the **View**, set up Xenia, choose the ROM folders, download covers. The same View
picker replaces the "Look" menu inside the dashboard, and the wizard can be run again from
*Dashboard Settings › Install Wizard*.

"Look" is renamed **View** everywhere the user reads it.

## Decisions already made (with the owner)

- Steps after the view: **Xenia**, **ROM folders**, **Covers**. No PIN step.
- The view picker is a **horizontal timeline with a large preview** (2005 Blades, 2008 NXE, 2010 Kinect,
  2011 Metro), ←/→ to move, A to choose, B to go back.
- The wizard opens **by itself only on a brand-new install**. Existing installs never see it unasked.
- In the wizard the picker is **neutral** (belongs to no view); once a view is chosen the next steps already
  use it.

## Out of scope

PIN and family-mode setup, notification settings, a wizard for game-level settings, translating the
wizard, renaming internal identifiers (`skin`, `admin:skin`, `THEME_PROVIDERS`, the saved `skin` key).

## Architecture

New units, each with one purpose:

| Unit | Purpose | Depends on |
|---|---|---|
| `ui/view-picker.js` | Timeline component. `createViewPicker({ views, current, onChoose, onBack, onFocus })` draws the line, the preview and the caption, and handles ←/→/A/B. No knowledge of the wizard or of any skin. | DOM only |
| `ui/wizard.js` | Step runner: a list of steps, `next()`, `back()`, `skip()`, the progress strip, and the hand-off to existing screens. | view-picker, the existing screens in `ui/renderer.js` (through a small `ctx`) |
| `ui/wizard.css` | The neutral look of the wizard's own screens (step 1 and the intro cards). | none |
| `src/wizard-state.js` | Pure functions: `isFirstRun(library)`, `markDone(library)`. | none |
| main-process IPC | `wizard:state` (is it a first run), `wizard:done`, `wizard:begin` / `wizard:end` (restricted admin session). | `wizard-state.js`, storage |

`ui/renderer.js` only gains the glue: the `wizard` object, one hook in `closeModal()` so a finished screen
hands control back to the wizard, and the *Install Wizard* entry. `dashboard/` (sections, navigator,
skin contract) is not touched; the wizard is not a section.

### View data

`dashboard/skin.js` already lists registered skins oldest first with `since`. Each skin gains a plain-data
`about = { years, blurb }` (for example `{ years: '2005–2008', blurb: 'The launch dashboard…' }`) and the
picker reads label, year and blurb from the registry, so a new skin appears in the timeline by registering.
Previews are the library screenshots, copied to `assets/views/<skin>.jpg` (the `docs/` folder is not
packaged) and served by the app protocol (`APP_FILES`, `build.files` already covers `assets/**/*`).

## Flow

```
first start ── isFirstRun? ─ no → normal dashboard
                  │ yes
                  ▼
 1 View      neutral timeline; A applies the view at once (useSkin) and continues
 2 Xenia     card: Install Xenia (Edge) · Use my own… · Skip   → existing Updates screen
 3 Folders   card: Choose ROM folders · Skip                    → existing Folders screen
 4 Covers    only if games were found: Download covers · Skip   → existing covers bulk download
 end         wizard:done → game library
```

- Steps 2–4 show a strip "Setup · step N of 4" in the chosen view's own style, under the screen's title.
- **B** goes back one step (from step 1 it asks "Skip setup?"). A **Skip setup** row exists on every card.
- Leaving a step: when the existing screen closes (`closeModal()`), the wizard moves to the next step.
- Re-running from *Dashboard Settings › Install Wizard* starts at step 1 with the current view highlighted;
  nothing is erased, steps that are already satisfied (a Xenia installed, folders set) show a "Done · change"
  action instead of an install button.
- The picker is also *Dashboard Settings › View* (replacing the "Look" row; wallpaper row stays). There the
  header is the view's own, not the neutral one, and A applies and returns.

### First run

`isFirstRun(library)` is true only when **all** hold: no `wizard_done`, no saved `skin`, no
`xenia_executable`, and no ROM directories. Any other combination never opens the wizard by itself.
`wizard_done` is written when the wizard ends (finished or skipped) and is also written for any library
that already has configuration, the first time the app saves it, so a later reset of one setting does not
bring the wizard back.

## Security: the PIN

A fresh install still has the initial PIN, and the Updates and Folders screens need an admin session.
`wizard:begin` opens a session limited to the scopes `xenia` and `dashboard`, only while
`isFirstRun` is true or an unlocked *Dashboard Settings* started the wizard; `wizard:end` (and quitting,
Alt+F4, closing the window) closes it. The session is not shared with the `*` scope and does not let any
other IPC through. When the wizard is re-run from Dashboard Settings the user is already unlocked, so no
extra session is opened.

## Rename Look → View

User-visible strings change: the Dashboard Settings row, the choice window title, `README.md`, `docs/`
(`ARCHITECTURE.md`, `MANUAL-TESTS.md`, `ROADMAP.md`), the error `Invalid look` → `Invalid view`, the
Dashboard Settings tile *Themes* → **View**, and the boot-animation texts ("follows the view").
Unchanged: code identifiers and the saved `skin` key, so existing `library.json` files keep working.

## Error handling

- A screenshot that fails to load falls back to the label and blurb (the picker still works).
- If the Xenia install fails, the existing Updates screen shows the error and the wizard stays on step 2
  (A retries, Skip continues).
- If the library scan finds no games, step 4 is omitted and the end card says where to add ROMs.
- Any thrown error in a step shows the shared sticky message and never ends the wizard silently.

## Testing

- `wizard-state`: first-run truth table (each of the four conditions flipped), `markDone`, an existing
  library is never a first run.
- Step runner: order, back, skip, step 4 omitted without games, "already done" rows when re-run.
- View picker (fake DOM): ←/→ clamp, focus callback, A chooses, B cancels, every registered skin appears
  in release order, a missing preview falls back to text.
- Security: `wizard:begin` refused when it is not a first run and the caller is locked; the session only
  carries `xenia` and `dashboard`; `wizard:end` closes it.
- Rename: a test that scans the user-visible strings (settings tiles, dialog titles, README) for the
  word "look" used as the old option name.
- Existing suites keep passing (203 today).
- Manual: new section in `docs/MANUAL-TESTS.md` (fresh `userData`, each view, skip at every step, re-run).

## Delivery

Single feature release **1.0.0** (wizard + picker + rename), in the usual order: spec → plan → tests
first → implementation → screenshots for the README (the picker and one wizard step) → commit by the owner.

# Changelog

All notable changes to Xenia Dashboard. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
versions follow [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-18

Windowed mode, a keyboard that works like the gamepad, and a first run that no longer leaves you stuck.

### Added
- **Windowed mode.** *Dashboard Settings › View › Window* switches the dashboard between fullscreen (the console way) and a
  normal window with a title bar, and **Alt + Enter** does the same from anywhere, with no PIN (it only changes the window).
  The switch is immediate: no restart, no start-up video, and you stay on the same screen. The window comes back at the size and
  place you left it, also after closing the app. It works with every view, and every view follows the shape of the window when you
  stretch it. Switching is refused while a game is running.
- **Keyboard like the gamepad.** **W A S D** move like the arrow keys, **Q / E** switch section like LT / RT (**Enter** is A and
  **Esc** is B, as before). While you type a PIN, a text or a search, those letters only type.
- **Install Wizard › Covers does the whole job in one step.** It downloads the source's data first (once, about 105 MB for
  LaunchBox), then the cover of every game that has none, with the progress on the wizard's own card, and ends with *Continue*.
  If something fails it offers *Try again* or *Skip this step*. You never leave the wizard for the covers screen.
- **"Xenia is not set up" window.** Opening Xenia's settings (System, Profiles, Advanced, a game's settings) with no Xenia chosen
  now asks, in the dashboard's own window, whether to set one up right now and takes you to the Updates screen.
- **"Start Xenia once" window.** Right after installing a Xenia that has never run, and whenever Profiles or Advanced are opened
  before it has, the dashboard explains that Xenia creates its configuration files the first time it runs.

### Changed
- **Game covers** is reordered: *Source*, *Update … data* (it was *Download … data*, and it now stays visible so the data can be
  refreshed), *Download covers* (every game; it was *Redownload all covers*), *Download missing covers*, *Rescan local cover
  images*, *Return*.
- **Xenia Settings › Updates** checks for a newer build by itself every time it opens or the channel changes, so the *Check for
  updates* button is gone. One row under *Channel* says where things stand: *Checking for updates…*, *Up to date ✓* (A checks
  again), *Update to …*, *Install …* (a first install) or *Could not check · try again*.
- Errors that used to appear as a line at the top of the screen when opening a Xenia screen now appear in a window, without the
  technical "Error invoking remote method…" prefix.

### Fixed
- **A PIN pad over an error.** On an install with no PIN, opening a Xenia screen flashed the PIN pad and, if Xenia could not be
  read, left the error written on top of it, which looked like a PIN request. With no PIN nothing is shown; if the screen cannot
  open, you land on the library with a window that says why.
- **A / B / X / Y icons squashed or oval** when the window was not 16:9, in the Blades legend; the icons of the other views can no
  longer be squeezed by a narrow window either. They stay round.
- **Blades:** the names on the right-hand blades sat a little to the right of the blade; they are now centred, in fullscreen and
  in a narrow window.
- **View timeline:** the circles of the view picker were not on the line (the focused one pushed the name down). They now sit on
  it, the focused one larger and centred, with the names at one height.

## [1.0.0] - 2026-10-15

The first release: a controller-first, Xbox 360-style dashboard that also configures the Xenia emulator.

- **Four views** of the console's dashboard through the years — Blades (2005), NXE (2008), Kinect (2010) and Metro (2011) — with
  the native sounds, start-up videos and wallpapers, and a timeline **View picker**.
- **Install Wizard** on the first run: view, Xenia, ROM folders and covers, each skippable, in the chosen view.
- **Xenia, configured like a real Xbox 360**: install and update Xenia (Edge, Canary), every Xenia setting (system and per game),
  community-optimized settings, patches, DLC and title updates, profiles and storage.
- **Game library** with portrait covers (LaunchBox, the Xenia Manager database or your own images), game details, achievements and
  profiles.
- **PIN protection and family mode** are opt-in (experimental), with a lock per section.
- Windows installer and portable build, and a Linux AppImage; the portable builds keep everything in one folder next to them.

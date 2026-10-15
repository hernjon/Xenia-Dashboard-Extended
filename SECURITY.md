# Security

## Review scope and result

A focused source, dependency, publication, and packaged-runtime review was completed on October 11, 2026 for NXE v1.9.0. No remote-control listener, telemetry uploader, arbitrary renderer command endpoint, or matching publication secrets were found in the reviewed application. This is not an independent penetration test or a guarantee that a host/emulator is safe.

## Protections

- Sandboxed renderer, context isolation, no renderer Node access, and a restricted preload bridge.
- Unsafe sandbox/TLS launch flags are rejected; debug-port switches are removed. App pages served from a fixed `nxe-app` file whitelist; arbitrary file pages, navigation, subframes, popups, and permissions are denied.
- Privileged IPC requires the exact current main frame and an active admin session. PIN failures are throttled; PIN-off is an explicit administrator preference.
- Local artwork/audio is limited by type, size, and allowed directory. Symlinks/path escapes and inherited-object asset keys are rejected. Cover IDs cannot create paths outside the cache.
- Configuration and cover updates use random, exclusive temporary files and atomic replacement; predictable existing temp files are not followed.
- Cover downloads use fixed HTTPS GitHub endpoints, bounded requests, validated IDs/JPEG signatures, and no redirects. The renderer's CSP blocks outbound fetches.
- Emulator launch uses saved paths, registered game IDs, argument arrays, and `shell: false`.
- The Windows helper uses an absolute OS PowerShell path, fixed numeric parameters, and a script integrity check.
- Packaged Electron disables RunAsNode, Node environment options, inspector CLI flags, and extra file-page privileges. ASAR-only loading and embedded integrity verification are enabled; integrity enforcement is supported on Windows/macOS.
- Unused import IPC endpoints and runtime decoder binaries are excluded. Asset-recovery tooling stays developer-only.

## Verification

35 regression tests passed. Packaged checks rejected private-file, traversal/prototype, unsupported-file, and unauthorized-admin requests. A renderer network probe produced zero HTTP requests, and an HTML-like ROM title did not execute markup. Disc navigation, cover correction/rescan, audio, and native handoff tests passed. Actual executable fuse settings were inspected. Standalone release boot also ignored a harmless NODE_OPTIONS preload attempt, kept the requested debug port closed, and explicitly refused --no-sandbox.

The full and production npm audits report zero known vulnerabilities as of the review date. Electron is 44.7.0. This does not cover unknown vulnerabilities or separately supplied Xenia/Wine/Proton/GPU drivers.

The tracked publication scan covered 733 files and 197 historical text blobs for common token/private-key patterns and the developer's home-directory path; no matches were found. Pattern-based scanning is not exhaustive. Configurations, credential files, logs, certificates, and environment files are excluded from future commits by ignore rules.

## 2.0 additions (made while the project was still called NXE)

The 2.0 features were added after the review above and keep its rules:

- New IPC (`xenia:*`) is admin-only, accepts calls only from the dashboard frame, and validates everything in the main process: settings must be keys that exist in the parsed Xenia config with the existing type (text choices must be listed), games must exist in the library, and title IDs are 8 hex digits read from game headers.
- Writes go only to Xenia's own folder (config, `config/<TITLEID>.config.toml`, `patches/`) through exclusive temporary files and atomic rename; symlinked targets are refused; nothing is written while a game runs.
- New network requests use the same bounded, redirect-free fetch as covers and fixed HTTPS hosts: `api.github.com` (patch listing) and `raw.githubusercontent.com` (patch files, x360db details). Patch file names are validated against the title ID before use.
- Game files are only read (ISO/XEX/STFS headers, profile Account and .gpd files); nothing from a game is executed. Account files are decrypted with the public retail key and HMAC-verified.

## Per-section admin sessions

Admin sessions are scoped in the main process: the Admin button and Start grant a full (`*`) session, and a section's tiles grant only that section's (`xenia` or `dashboard`). Every privileged IPC checks its own section, so a session obtained without a PIN for an unlocked section cannot touch the other one; unknown section names are rejected. `locked_sections` is stored in `library.json` (default both) and can only be changed from a Dashboard session. With PIN protection off nothing asks for a PIN, as before.

## No Admin panel

The Admin panel, its button and the Start/chord shortcuts were removed; every privileged screen is reached through a section tile and a section session. Locations (ROM folder, Xenia executable, runner) belong to the Xenia section; changing the PIN is a separate Dashboard-only call (`admin:set-pin`) and is no longer accepted as part of saving Locations. Leaving NXE asks for confirmation (SELECT) and then for the Dashboard session, so the PIN lock still protects it. Alt+F4 / a window-manager close follows the same rule: it quits directly only when nothing guards the Dashboard (PIN protection off or the Dashboard lock off), otherwise it opens the exit window, and it is ignored while a game runs. SIGTERM/SIGINT/SIGHUP always quit, so logging out never hangs.

## Installing Xenia (Xenia Settings › Updates)

The only downloads of executable code in the app. They start only when the user presses Install/Update, from fixed GitHub addresses (the release's own asset URL, validated against the repository and tag, and redirects allowed only to GitHub's `githubusercontent.com` hosts over HTTPS). The file must be the exact size announced, within a size limit, and match the SHA-256 GitHub publishes for that asset (a release without one is refused); a mismatch discards the file. Zip files are read by a strict in-house reader that rejects absolute or `..` paths, encrypted entries, Zip64, duplicates and bad CRCs, and nothing is executed during installation. Installs live under the app's data folder; the Xenia used by the dashboard changes only on a first install or when the user chooses it. `.7z` files (Canary on Windows) are opened by the bundled 7-Zip (`7zip-bin`, run with an argument list and no shell): the archive is listed and every path, link and size checked first, then unpacked into a scratch folder and only plain files are moved into place. Only archives whose SHA-256 matches the one GitHub publishes ever reach 7-Zip (the bundled build is 7-Zip 16.02, so this is another reason the checksum is mandatory). All calls need the Xenia section's admin session and are refused while a game is running.

## Community-optimized settings

Download only on request (Game menu › Optimized settings), from one fixed address (`raw.githubusercontent.com/xenia-manager/optimized-settings`, title ID validated as 8 hex digits, no redirects, size-limited). The file is treated as untrusted data: it is parsed by the same strict TOML reader as Xenia's own config and only keys that exist in the user's Xenia, with the same type and an allowed value, become changes; the user sees every change before pressing Apply, and the apply step downloads and re-checks the file in the main process instead of trusting the screen. Writes go only to that game's override file, atomically, and never while a game is running.

## Use and distribution

- Change the initial **1234** PIN before child/unattended use. Keep PIN protection enabled if users must not change settings or exit.
- Run under a limited account. The PIN is a UI lock, not OS authentication; anyone able to modify the app/profile or run programs as that same account already has broader host access.
- Install Xenia/runners from trusted sources and keep the OS, drivers, Electron, and dependencies updated. No emulator is bundled or certified by this review.
- Distribute the hardened installer and its checksum. It is unsigned; signing/secure release distribution remain release-owner responsibilities.
- Verify Linux Mint builds, sandbox behavior, and Wine/Proton on the target system. Those runtime checks remain pending.

## Reporting

Report security concerns to the repository maintainer through the repository's Security channels where available. Do not put PINs, full local configurations, ROMs, tokens, or exploitable private data into a public issue.

References: [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses).

## DLC and title-update installer (1.7)
The screen never sends a path of its own: `xenia:content-install` accepts only a path from the main process's last scan of the ROM folder, and only if that package belongs to the chosen game. Only DLC and title-update packages (judged by the STFS header, not the name) are copied; the destination is built from the header's title ID and content type, the file name is validated, regular files only (no symlinks), the copy is atomic (temp file + rename) and size-checked. Nothing is parsed or modified inside the package.

## Local cover images (1.8)
A cover picked from a file is recognised by its first bytes (JPEG, PNG, WebP), limited to 16 MB, decoded by Electron and re-encoded as a JPEG in the dashboard's own cover folder; the original file is only read, and the screen never supplies a path (the file dialog runs in the main process, behind the Xenia session).

## LaunchBox cover source (1.9)
LaunchBox has no API, so the dashboard downloads its public `Metadata.zip` from one fixed address (no redirects followed, size-checked against `Content-Length`, at most 300 MB), reads only `Metadata.xml` out of it with limits on the inflated size, keeps Xbox 360 names and picture file names in a small index and deletes the ZIP. Picture addresses are a fixed host plus a file name that must be in that index and match `[A-Za-z0-9_-]+.(jpg|png)`; pictures are limited to 12 MB, checked by their first bytes, and re-encoded before use. Previews are served to the screen through the app's own `kratos-art://preview/` address, so the page's CSP does not need to allow any remote image host.

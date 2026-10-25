'use strict';
// Dashboard Settings › Updates: how the dashboard and Xenia are kept up to date (notify only, or by themselves), what is
// available now, and the buttons to update. The state comes from the main process (see updates:app-state); nothing in
// here decides what is newer. It runs after renderer.js's helpers exist (modal, buttons, node, content, selected, mode,
// busy, api, errorDisplay, openChoice, returnSettings …) and only calls them at use time.
const UPDATE_MODES = [{ value: 'notify', label: 'Notify only' }, { value: 'auto', label: 'Automatic' }];
const updateModeLabel = value => (UPDATE_MODES.find(option => option.value === value) || UPDATE_MODES[0]).label;
let appUpdates = null;

// Pure: the rows for a state. The dashboard state row is absent for a source checkout (it has nothing to update).
function appUpdateRows(state) {
  const rows = [{ action: 'mode-dashboard', label: `Dashboard: ${updateModeLabel(state.modes.dashboard)}` }, { action: 'mode-xenia', label: `Xenia: ${updateModeLabel(state.modes.xenia)}` }];
  const { kind, current, latest } = state.dashboard;
  if (kind === 'portable' || kind === 'appimage-locked') rows.push({ action: 'release-page', label: 'Open release page' });
  else if (kind !== 'source') rows.push(latest ? { action: 'install-dashboard', label: `Update to ${latest}` } : { action: 'check', label: `Dashboard ${current} · Up to date` });
  const xenia = state.xenia;
  if (xenia?.managed) rows.push(xenia.latest ? { action: 'install-xenia', label: `Update to ${xenia.latest}` } : { action: 'check', label: `${xenia.label} ${xenia.installed} · Up to date` });
  rows.push({ action: 'back', label: backLabel() });
  return rows;
}
async function openAppUpdates() {
  busy = true; errorDisplay.textContent = '';
  try { appUpdates = await api.getAppUpdates(); renderAppUpdates(); } catch (error) { errorDisplay.textContent = error.message; } finally { busy = false; }
}
function renderAppUpdates(index = 0) {
  mode = 'app-updates'; const rows = appUpdateRows(appUpdates); selected = Math.min(index, rows.length - 1);
  modal('Updates', 'D-pad: choose · A: select · ← →: change the mode · B: return to settings');
  content.replaceChildren(node('p', 'cover-summary', 'Notify only tells you when a new version is out. Automatic installs it by itself: the dashboard when you close it, Xenia when no game is running.'));
  buttons(rows.map(row => row.label), 'cover-options', activate);
}
// Runs a change, shows the state the main process answers and puts the cursor back on the row that was used.
async function keepUpdatesRow(work) {
  const choice = selected; busy = true;
  try { const state = await work(); if (state) appUpdates = state; renderAppUpdates(choice); highlight(); }
  catch (error) { errorDisplay.textContent = error.message; }
  finally { busy = false; }
}
const updateModeItem = action => (action === 'mode-dashboard' ? 'dashboard' : action === 'mode-xenia' ? 'xenia' : null);
function stepAppUpdateMode(delta) {
  const item = updateModeItem(appUpdateRows(appUpdates)[selected]?.action); if (!item) return;
  const index = UPDATE_MODES.findIndex(option => option.value === appUpdates.modes[item]), next = UPDATE_MODES[index + delta];
  if (!next) return;
  window.uiSounds?.play(delta < 0 ? 'left' : 'right'); return keepUpdatesRow(() => api.setUpdateMode(item, next.value));
}
async function installDashboardUpdate() {
  const stop = api.onAppUpdateProgress?.(progress => { if (Number.isFinite(progress?.percent)) errorDisplay.textContent = `Downloading… ${Math.floor(progress.percent)}%`; });
  errorDisplay.textContent = 'Downloading…';
  try { await keepUpdatesRow(async () => { await api.installAppUpdate(); }); } finally { stop?.(); }
}
async function activateAppUpdates() {
  const row = appUpdateRows(appUpdates)[selected]; if (!row || row.action === 'back') return returnSettings();
  const item = updateModeItem(row.action);
  if (item) return openChoice({ title: item === 'dashboard' ? 'Dashboard updates' : 'Xenia updates', text: item === 'dashboard' ? 'Notify only tells you when a new dashboard is out. Automatic downloads it and installs it when you close the dashboard.' : 'Notify only tells you when a new Xenia is out. Automatic installs it by itself when no game is running. Move ← → on the row to change it.', options: UPDATE_MODES, current: appUpdates.modes[item], onPick: value => keepUpdatesRow(() => api.setUpdateMode(item, value)) });
  if (row.action === 'check') { errorDisplay.textContent = 'Checking…'; return keepUpdatesRow(() => api.checkAppUpdates()); }
  if (row.action === 'release-page') return keepUpdatesRow(async () => { await api.openReleasePage(); });
  if (row.action === 'install-dashboard') return installDashboardUpdate();
  if (row.action === 'install-xenia') { errorDisplay.textContent = 'Installing…'; return keepUpdatesRow(() => api.installXeniaUpdate()); }
}

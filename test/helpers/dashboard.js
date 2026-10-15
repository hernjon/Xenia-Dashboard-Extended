'use strict';
// Loads the dashboard exactly as index.html does: every classic script after the audio helpers,
// in page order, into one vm context.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
function dashboardScripts() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
}
function loadDashboard(vm, context, after = '') {
  for (const file of dashboardScripts()) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  if (after) vm.runInContext(after, context);
  return context;
}
module.exports = { dashboardScripts, loadDashboard };

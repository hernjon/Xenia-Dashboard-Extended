'use strict';
// Drives the preview page in a headless Chromium over the DevTools protocol and saves screenshots.
// Usage: node tools/ui-preview/shoot.js <devtools-port> <page-url> <output-dir> <step>...
//   steps: key:<ArrowDown|Enter|Escape|...>  pad:<a|b|x|y|up|down|left|right>  wait:<ms>  shot:<name>  eval:<js>
const fs = require('node:fs/promises');
const path = require('node:path');
const [port, pageUrl, output, ...steps] = process.argv.slice(2);
const KEYS = { Enter: 13, Escape: 27, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Backspace: 8, Tab: 9 };
(async () => {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map(), errors = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise(resolve => { pending.set(++id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.result?.exceptionDetails) throw Error(result.result.exceptionDetails.exception?.description || 'evaluate failed'); return result.result?.result?.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: Number(process.env.XD_W || 1600), height: Number(process.env.XD_H || 900), deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pageUrl });
  await new Promise(resolve => setTimeout(resolve, 2500));
  await fs.mkdir(output, { recursive: true });
  for (const step of steps) {
    const [kind, ...rest] = step.split(':'), value = rest.join(':');
    if (kind === 'wait') await new Promise(resolve => setTimeout(resolve, Number(value)));
    else if (kind === 'key') { for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: value, code: value, windowsVirtualKeyCode: KEYS[value] || 0 }); await new Promise(resolve => setTimeout(resolve, 350)); }
    else if (kind === 'pad') { await evaluate(`input(${JSON.stringify(value)})`); await new Promise(resolve => setTimeout(resolve, 450)); }
    else if (kind === 'eval') console.log(JSON.stringify(await evaluate(value)));
    else if (kind === 'shot') { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(output, `${value}.png`), Buffer.from(shot.result.data, 'base64')); console.log(`saved ${value}.png`); }
  }
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  await send('Page.close').catch(() => {}); socket.close(); process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });

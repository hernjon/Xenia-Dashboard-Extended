'use strict';
// When a game ends with "Return to Arcade" / "Exit to dashboard", Xenia does not quit: it goes back to its own game list
// and keeps its window open. The dashboard IS the dashboard, so it watches the log Xenia writes for that moment
// ("KernelState::ExitToDashboard") and closes Xenia, handing the screen back.
const fs = require('node:fs');
const EXIT_LINE = /KernelState::ExitToDashboard/;
const MAX_READ = 1 << 20;
// Polls the log (a file Xenia appends to). Calls onExit() once, when the line shows up, then stops.
function watchTitleExit(file, onExit, { interval = 100 } = {}) {
  let offset = 0, tail = '', stopped = false, busy = false, timer = null;
  const stop = () => { stopped = true; clearInterval(timer); };
  async function poll() {
    if (stopped || busy) return;
    busy = true;
    try {
      const { size } = await fs.promises.stat(file);
      if (size < offset) { offset = 0; tail = ''; } // the file was started again
      if (size > offset) {
        const handle = await fs.promises.open(file, 'r');
        try {
          const wanted = Math.min(size - offset, MAX_READ), buffer = Buffer.alloc(wanted);
          const { bytesRead } = await handle.read(buffer, 0, wanted, offset);
          offset += bytesRead;
          // The last bytes are kept so a line cut between two reads is still found.
          const text = tail + buffer.subarray(0, bytesRead).toString('utf8');
          if (EXIT_LINE.test(text)) { stop(); onExit(); return; }
          tail = text.slice(-64);
        } finally { await handle.close(); }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[Xenia Dashboard] Reading the Xenia log:', error.message);
    } finally { busy = false; }
  }
  timer = setInterval(poll, interval);
  timer.unref?.();
  return { stop };
}
// Closes Xenia (and what it started: the AppImage runtime, Wine) politely, then for good if it does not go.
function terminateXenia(child, { platform = process.platform, kill = process.kill.bind(process), graceMs = 1500 } = {}) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) return;
  const send = signal => {
    try { if (platform === 'linux') kill(-child.pid, signal); else child.kill(signal); }
    catch { try { child.kill(signal); } catch { /* already gone */ } }
  };
  send('SIGTERM');
  const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) send('SIGKILL'); }, graceMs);
  timer.unref?.();
  child.once?.('close', () => clearTimeout(timer));
}
module.exports = { watchTitleExit, terminateXenia, EXIT_LINE };

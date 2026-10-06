import { launchHelper } from '../lib/desktop-process.js';
import { DesktopState } from '../lib/desktop-state.js';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const state = new DesktopState();
const sessionId = 'yukimi-preview-' + randomUUID();
state.track(sessionId, { title: '桌宠预览', running: true });
const timers = [];
let failed = false;
const helper = launchHelper({
  dataDirectory: fileURLToPath(new URL('../build/preview-data/', import.meta.url)),
  onError: error => { failed = true; console.error(error.message); }, onExit: () => process.exit(failed ? 1 : 0),
  onMessage(message) {
    if (message.type === 'ready') {
      state.active = true; helper.send(state.snapshot()); console.log('Preview ready. Ctrl+C closes only this preview.');
      timers.push(setTimeout(() => { state.observe(sessionId, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }); helper.send(state.snapshot()); }, 2000));
      timers.push(setTimeout(() => { state.ask(sessionId, 'preview-question'); helper.send(state.snapshot()); }, 9000));
    }
    if (message.type === 'preferences') state.updatePreferences(message.preferences);
    if (message.type === 'notice-shown') { state.acknowledge(message.id); console.log('Preview notification shown once.'); }
    if (message.type === 'open-session') console.log('Preview bubble clicked; no real task is created.');
  },
});
if (!helper) process.exit(1);
const close = () => { timers.forEach(clearTimeout); helper.close(); };
process.once('SIGINT', close); process.once('SIGTERM', close);

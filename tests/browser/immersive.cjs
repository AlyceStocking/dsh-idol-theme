// Run with an unpacked Electron binary: electron tests/browser/immersive.cjs
// Uses real Chromium selectors, Selection, CSS and native input without opening a window.
const { app, BrowserWindow, session } = require('electron');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = mkdtempSync(path.join(tmpdir(), 'idol-immersive-test-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
let win;
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
  win = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { backgroundThrottling: false } });
  await win.loadURL('about:blank');
  const evaluate = code => win.webContents.executeJavaScript(code);
  await evaluate(`
    document.documentElement.dataset.windowsTitlebar = '';
    document.body.innerHTML = '<div data-slot="conversation.header"><header data-window-drag><div data-conversation-tabs>Tabs</div></header></div>' +
      '<main id="background" style="height:300px;padding:20px"><article data-chat-flow-kind="assistant-step" id="card">' +
      '<span id="text">Select this message text</span><button id="button">Copy</button><a id="link" href="#">Link</a></article></main>' +
      '<div data-composer-card id="composer"><textarea id="input"></textarea></div>' +
      '<aside class="host_sidebarCol" id="sidebar">Sidebar</aside><div class="yukimi-pet" id="pet">Pet</div>' +
      '<div role="dialog" id="dialog">Dialog</div><div contenteditable id="editable">Editable</div>';
    window.disposers = [];
    window.__ModuleLoader__ = { load: entry => window.plugin = entry.factory(() => ({})) };
    void 0;
  `);
  await evaluate(readFileSync(path.join(__dirname, '../../lib/client.js'), 'utf8') + '\n;void 0;');
  await evaluate(`
    window.mount = () => plugin.apply({
      get: key => key === 'slots' ? { inject() {} } : undefined,
      effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); }
    });
    mount();
    window.fire = (type, id = 'card', extra = {}) => document.getElementById(id).dispatchEvent(new PointerEvent(type, {
      bubbles: true, button: 0, pointerId: 1, isPrimary: true, clientX: 100, clientY: 150, ...extra
    }));
    window.tap = (id = 'card') => { fire('pointerdown', id); fire('pointerup', id); };
    window.active = () => document.body.classList.contains('yukimi-immersive');
    window.key = (key, extra = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }));
    void 0;
  `);
  let count = 0;
  const check = async (code, expected, label) => { assert.deepEqual(await evaluate(code), expected, label); count++; };
  await check(`tap(); active()`, true, 'html platform marker must not exclude a message card');
  await check(`tap('background'); active()`, false, 'a second immediate click restores without a debounce dead zone');
  for (const id of ['button', 'link', 'input', 'composer', 'sidebar', 'pet', 'dialog', 'editable']) {
    await check(`tap('${id}'); active()`, false, `${id} keeps the view`);
  }
  await check(`fire('pointerdown'); fire('pointermove', 'card', {clientX:130}); fire('pointermove'); fire('pointerup'); active()`, false, 'dragging out and back is not a click');
  await check(`fire('pointerdown'); fire('pointercancel'); fire('pointerup'); active()`, false, 'canceled pointer does not toggle');
  await check(`fire('pointerdown'); window.dispatchEvent(new Event('blur')); fire('pointerup'); active()`, false, 'focus loss cancels gesture');
  await check(`fire('pointerdown'); fire('pointerup', 'button'); active()`, false, 'release on a control is excluded');
  await check(`fire('pointerdown'); fire('pointerup', 'card', {pointerId:2}); active()`, false, 'unrelated pointer cannot complete a press');
  await check(`fire('pointercancel'); fire('pointerdown', 'card', {button:2}); fire('pointerup', 'card', {button:2}); active()`, false, 'right click is excluded');
  await check(`
    fire('pointerdown');
    var range = document.createRange(); range.selectNodeContents(document.getElementById('text'));
    getSelection().removeAllRanges(); getSelection().addRange(range);
    fire('pointerup'); active()
  `, false, 'a new selection prevents toggling');
  await check(`tap(); active()`, true, 'an unchanged old selection does not block clicking');
  await check(`key('Escape'); active()`, false, 'Escape restores');
  await check(`key('i', {altKey:true}); active()`, true, 'Alt+I enters');
  await check(`key('i', {altKey:true, repeat:true}); active()`, true, 'held hotkey does not flicker');
  await check(`document.getElementById('card').dispatchEvent(new WheelEvent('wheel', {bubbles:true, deltaY:20})); active()`, true, 'downward wheel keeps view');
  await check(`document.getElementById('card').addEventListener('wheel', e => e.stopPropagation()); document.getElementById('card').dispatchEvent(new WheelEvent('wheel', {bubbles:true, deltaY:-20})); active()`, false, 'upward wheel restores even when bubbling is stopped');
  await check(`getComputedStyle(document.getElementById('composer')).transitionProperty.includes('transform')`, true, 'composer motion survives later CSS rules');
  await check(`getComputedStyle(document.getElementById('card')).transitionProperty`, 'opacity', 'messages fade');
  await evaluate(`key('i', {altKey:true})`);
  await new Promise(resolve => setTimeout(resolve, 350));
  await check(`['card','composer'].map(id => getComputedStyle(document.getElementById(id)).opacity)`, ['0','0'], 'content actually fades out');
  await check(`getComputedStyle(document.querySelector('header')).opacity`, '0', 'session header hides');
  await check(`disposers.reverse().splice(0).forEach(fn => fn()); active()`, false, 'unloading restores full view');
  await check(`tap(); active()`, false, 'unloading removes event listeners');
  await evaluate(`mount(); getSelection().removeAllRanges()`);
  await new Promise(resolve => setTimeout(resolve, 350));
  // Chromium dispatches both pointer and compatibility mouse events here.
  const point = await evaluate(`(() => { const r = document.getElementById('card').getBoundingClientRect(); return { x: Math.round(r.right - 20), y: Math.round(r.bottom - 10) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
  await new Promise(resolve => setTimeout(resolve, 50));
  await check(`active()`, true, 'native mouse click toggles once despite compatibility events');
  await evaluate(`key('Escape')`);
  await new Promise(resolve => setTimeout(resolve, 350));
  const textBox = await evaluate(`(() => { const r = document.getElementById('text').getBoundingClientRect(); return { x: Math.ceil(r.left + 2), end: Math.floor(r.right - 2), y: Math.round(r.top + r.height / 2) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: textBox.x, y: textBox.y });
  win.webContents.sendInputEvent({ type: 'mouseMove', button: 'left', x: textBox.end, y: textBox.y });
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: textBox.end, y: textBox.y });
  await new Promise(resolve => setTimeout(resolve, 50));
  await check(`!active() && String(getSelection()).length > 0`, true, 'native drag selects message text without hiding it');
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await check(`['card','composer'].map(id => getComputedStyle(document.getElementById(id)).transitionDuration)`, ['0s','0s'], 'reduced motion disables transitions');
  win.webContents.debugger.detach();
  await evaluate(`disposers.reverse().splice(0).forEach(fn => fn()); window.PointerEvent = undefined; mount();`);
  await check(`['mousedown','mouseup'].forEach(type => document.getElementById('card').dispatchEvent(new MouseEvent(type, {bubbles:true, button:0, clientX:100, clientY:150}))); active()`, true, 'mouse-only fallback');
  console.log(`PASS: ${count} Chromium immersive checks`);
  win.destroy();
  app.exit(0);
}).catch(error => { console.error(error); win?.destroy(); app.exit(1); });
app.on('quit', () => {
  try {
    if (path.dirname(profile) === path.resolve(tmpdir()) && path.basename(profile).startsWith('idol-immersive-test-')) rmSync(profile, { recursive: true, force: true });
  } catch {}
});

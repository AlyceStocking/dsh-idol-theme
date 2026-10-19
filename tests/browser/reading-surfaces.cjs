// Run with Electron: electron tests/browser/reading-surfaces.cjs
const { app, BrowserWindow, session } = require('electron');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
let win;
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
  win = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { backgroundThrottling: false, offscreen: true } });
  await win.loadURL('about:blank');
  const run = code => win.webContents.executeJavaScript(code);
  await run(`
    document.body.innerHTML = '<div data-conversation-scroll id="scroll"><div data-chat-flow id="flow"><article id="message">History text</article><div data-chat-flow id="nested">Nested tool</div></div><div data-composer-seat><div data-composer-card id="composer">Input bar</div></div></div><section data-plugin-panel>Plugins</section><section data-testid="task-manager-page">Schedules</section><section data-dsh-ssh-view>SSH</section>';
    window.disposers = [];
    window.__ModuleLoader__ = { load: entry => window.plugin = entry.factory(() => ({})) };
    void 0;
  `);
  await run(readFileSync(path.join(__dirname, '../../lib/client.js'), 'utf8') + '\n;void 0;');
  await run(`
    plugin.apply({ get: key => key === 'slots' ? {inject(){}} : undefined,
      effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); } });
    const style = document.createElement('style');
    style.textContent = 'body { margin:0; background:#204060; --yukimi-history-surface:rgba(240,244,252,.78); --yukimi-history-stroke:rgba(255,255,255,.55); --dsw-alias-label-primary:#16203a; --yukimi-composer-surface:#fff; } #scroll { height:500px; overflow:auto; } #flow { height:1200px; background:#e04040; } [data-composer-seat] { position:sticky; bottom:0; padding-top:24px; } #composer { height:100px; margin:0 40px; } section { display:inline-block; padding:20px; margin:10px; }';
    document.head.append(style);
    document.getElementById('scroll').scrollTop = 400;
    void 0;
  `);
  const settle = () => new Promise(resolve => setTimeout(resolve, 120));
  await settle();
  let checks = 0;
  const check = async (code, expected, label) => { assert.deepEqual(await run(code), expected, label); checks++; };
  await check(`document.querySelectorAll('[data-yukimi-history-fade]').length`, 1, 'only outer message flow is masked');
  await check(`getComputedStyle(document.getElementById('composer')).maskImage`, 'none', 'composer remains unmasked');
  await check(`getComputedStyle(document.getElementById('scroll')).maskImage`, 'none', 'scrollbar remains unmasked');
  const geometry = `(() => { const flow=document.getElementById('flow'), r=flow.getBoundingClientRect(), card=document.getElementById('composer').getBoundingClientRect(); return Math.abs(r.top + parseFloat(flow.style.getPropertyValue('--yukimi-fade-bottom')) - card.top - 16) < 1; })()`;
  await check(geometry, true, 'fade ends 16px inside composer');
  await run(`document.getElementById('composer').style.height='180px'`);
  await settle();
  await check(geometry, true, 'fade tracks multiline composer height');
  await run(`document.getElementById('scroll').scrollTop=650`);
  await settle();
  await check(geometry, true, 'fade stays anchored while scrolling');
  await check(`Math.abs(document.getElementById('flow').getBoundingClientRect().top + parseFloat(document.getElementById('flow').style.getPropertyValue('--yukimi-fade-top'))) < 1`, true, 'top fade stays at viewport edge');
  const screenshot = await win.webContents.capturePage();
  const pixels = screenshot.toBitmap(), width = screenshot.getSize().width;
  const red = (x, y) => pixels[(y * width + x) * 4 + 2];
  assert.ok(red(20, 2) < red(20, 14) && red(20, 14) < red(20, 40), 'top pixels gradually reveal history'); checks++;
  const bottom = await run(`document.getElementById('composer').getBoundingClientRect().top + 16`);
  assert.ok(red(20, bottom - 44) > red(20, bottom - 24) && red(20, bottom - 24) > red(20, bottom + 4), 'bottom pixels fade and remain hidden below input'); checks++;
  for (const mode of ['light', 'dark']) {
    await run(`document.body.toggleAttribute('data-ds-dark-theme', ${mode === 'dark'}); document.body.style.setProperty('--yukimi-history-surface', '${mode === 'dark' ? 'rgba(13,16,38,.74)' : 'rgba(240,244,252,.78)'}')`);
    await check(`Array.from(document.querySelectorAll('section')).every(el => getComputedStyle(el).backdropFilter.includes('blur(18px)') && getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)')`, true, mode + ' panels share frosted reading surface');
  }
  mkdirSync(path.join(__dirname, '../../build'), { recursive: true });
  writeFileSync(path.join(__dirname, '../../build/reading-surfaces.png'), screenshot.toPNG());
  await run(`document.getElementById('flow').outerHTML = '<div data-chat-flow id="flow" style="height:1000px">New session</div>';`);
  await settle();
  await check(`document.getElementById('flow').hasAttribute('data-yukimi-history-fade')`, true, 'switching sessions masks the new flow');
  await run(`disposers.reverse().forEach(fn => fn());`);
  await check(`document.querySelectorAll('[data-yukimi-history-fade]').length`, 0, 'unloading cleans up masks');
  console.log('PASS: ' + checks + ' Chromium reading-surface checks');
  win.destroy(); app.exit(0);
}).catch(error => { console.error(error); win?.destroy(); app.exit(1); });

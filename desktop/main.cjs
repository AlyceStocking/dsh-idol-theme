'use strict';

const { app, BrowserWindow, ipcMain, screen, nativeImage, net, session, shell, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createConnection } = require('node:net');
const PAGE_URL = 'yukimi://pet/desktop/index.html';
const localResources = new Map([
  [PAGE_URL, { file: path.join(__dirname, 'index.html'), contentType: 'text/html; charset=utf-8' }],
  ['yukimi://pet/desktop/style.css', { file: path.join(__dirname, 'style.css'), contentType: 'text/css; charset=utf-8' }],
  ['yukimi://pet/desktop/renderer.js', { file: path.join(__dirname, 'renderer.js'), contentType: 'text/javascript; charset=utf-8' }],
  ['yukimi://pet/lib/assets.js', { file: path.resolve(__dirname, '../lib/assets.js'), contentType: 'text/javascript; charset=utf-8' }],
]);
protocol.registerSchemesAsPrivileged([{ scheme: 'yukimi', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

// The owning plugin supplies a private Windows pipe; no TCP listener is exposed.
let window, logic, assets, preferences, queue, state = { notices: [], runningCount: 0 };
let initialized = false, protocolReady = false, quitting = false, flipSequence = 0, rectangles = [], alphaMask = null;
let drag = null, ignores = true, lastSnapshot = '', pendingLines = [], saveTimer, mouseTimer, stateTimer, parentTimer;
const acknowledged = new Set();
const parentPid = process.ppid;
const pipeIndex = process.argv.indexOf('--bridge-pipe');
const pipeArgument = process.argv.find(argument => argument.startsWith('--bridge-pipe='));
const bridgePath = pipeIndex >= 0 ? process.argv[pipeIndex + 1] : pipeArgument ? pipeArgument.slice('--bridge-pipe='.length) : null;
const bridgeToken = process.env.YUKIMI_BRIDGE_TOKEN;
delete process.env.YUKIMI_BRIDGE_TOKEN;
if ((pipeIndex >= 0 || pipeArgument) && (typeof bridgePath !== 'string' || !/^\\\\\.\\pipe\\dsh-yukimi-[A-Za-z0-9_-]{8,160}$/u.test(bridgePath) || typeof bridgeToken !== 'string' || !/^[0-9a-f-]{36}$/iu.test(bridgeToken))) {
  process.stderr.write('Yukimi startup: invalid private bridge pipe\n');
  process.exit(1);
}
let bridge, bridgeConnected = false;
const pendingOutput = [];
const argIndex = process.argv.indexOf('--yukimi-data-dir');
const dataRoot = argIndex >= 0 && process.argv[argIndex + 1] ? path.resolve(process.argv[argIndex + 1]) : path.join(app.getPath('userData'), 'dsh-yukimi-desktop');
const preferencesPath = path.join(dataRoot, 'preferences.json');
let inputBuffer = '';

function output(message) {
  if (quitting) return;
  const line = JSON.stringify(message) + '\n';
  if (bridgePath) {
    if (bridgeConnected && !bridge.destroyed) bridge.write(line);
    else if (pendingOutput.length < 100) pendingOutput.push(line);
  } else if (!process.stdout.destroyed) process.stdout.write(line);
}
function quit(reason) {
  if (quitting) return;
  if (typeof reason === 'string') process.stderr.write(`Yukimi stopping: ${reason}\n`);
  quitting = true;
  clearTimeout(saveTimer);
  clearInterval(mouseTimer); clearInterval(stateTimer); clearInterval(parentTimer);
  bridge?.destroy();
  saveNow();
  app.quit();
}
function saveNow() {
  if (!preferences || !window || window.isDestroyed()) return;
  try {
    fs.mkdirSync(dataRoot, { recursive: true });
    const temporary = preferencesPath + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, preferences, bounds: window.getBounds(), shownIds: [...acknowledged].slice(-5000) }), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, preferencesPath);
  } catch (error) { process.stderr.write(`Yukimi preferences: ${error.message}\n`); }
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
function readSaved() {
  try {
    const value = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* First launch or damaged settings: keep safe defaults. */ }
  return {};
}
function trusted(event) {
  return window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === PAGE_URL;
}
function receive(message) {
  const validated = logic.validateHostMessage(message);
  if (!validated) return;
  if (validated.type === 'preferences') {
    preferences = logic.normalizePreferences(validated.preferences, preferences);
    scheduleSave(); refreshMask();
    if (initialized) publish(true);
  } else {
    if (message.preferences) { preferences = logic.normalizePreferences(message.preferences, preferences); scheduleSave(); refreshMask(); }
    state = validated;
    if (initialized) publish(true, queue.update(state.notices));
  }
}
function consumeChunk(chunk) {
  inputBuffer += chunk;
  if (Buffer.byteLength(inputBuffer, 'utf8') > 1024 * 1024) { inputBuffer = ''; return; }
  let newline;
  while ((newline = inputBuffer.indexOf('\n')) >= 0) {
    const line = inputBuffer.slice(0, newline); inputBuffer = inputBuffer.slice(newline + 1);
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      if (protocolReady) receive(message);
      else if (pendingLines.length < 20) pendingLines.push(message);
    } catch { /* Invalid input must never reach Electron APIs. */ }
  }
}
if (bridgePath) {
  bridge = createConnection(bridgePath);
  bridge.setEncoding('utf8');
  bridge.on('connect', () => {
    bridge.write(JSON.stringify({ type: 'bridge-hello', token: bridgeToken }) + '\n');
    bridgeConnected = true;
    for (const line of pendingOutput) bridge.write(line);
    pendingOutput.length = 0;
  });
  bridge.on('data', consumeChunk);
  bridge.on('end', () => quit('bridge closed'));
  bridge.on('close', () => quit('bridge closed'));
  bridge.on('error', error => quit(`bridge error: ${error.message}`));
} else {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', consumeChunk);
  process.stdin.on('end', () => quit('stdin closed'));
  process.stdin.on('error', error => quit(`stdin error: ${error.message}`));
  process.stdout.on('error', error => quit(`stdout error: ${error.message}`));
}
process.on('SIGTERM', quit);
process.on('SIGINT', quit);
app.on('before-quit', () => { saveNow(); quitting = true; });
app.on('window-all-closed', quit);

function publish(force = false, snapshot = queue.advance()) {
  flipSequence += snapshot.newlyShown.length;
  const packet = { preferences, notices: { persistent: snapshot.persistent, transient: snapshot.transient, queuedCount: snapshot.queuedCount }, runningCount: state.runningCount, flipSequence, newlyShown: snapshot.newlyShown };
  const signature = JSON.stringify({ ...packet, newlyShown: [] });
  if (force || signature !== lastSnapshot || snapshot.newlyShown.length) {
    lastSnapshot = signature;
    if (window && !window.isDestroyed()) window.webContents.send('yukimi:state', packet);
  }
  return packet;
}

function updateMousePassthrough() {
  if (!window || window.isDestroyed() || drag) return;
  const cursor = screen.getCursorScreenPoint(), bounds = window.getBounds();
  const next = !logic.pointHitsRegions({ x: cursor.x - bounds.x, y: cursor.y - bounds.y }, rectangles, alphaMask);
  if (next !== ignores) { ignores = next; window.setIgnoreMouseEvents(next, { forward: true }); }
}

let maskGeneration = 0;
const maskCache = new Map();
const maskRequests = new Map();
async function refreshMask() {
  if (!assets || !preferences) return;
  const generation = ++maskGeneration;
  const url = assets.IMG + assets.PETITS[preferences.cardIndex][preferences.petitIndex];
  if (maskCache.has(url)) { alphaMask = maskCache.get(url); return; }
  alphaMask = null;
  if (maskRequests.has(url)) {
    const result = await maskRequests.get(url);
    if (generation === maskGeneration) alphaMask = result;
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const request = (async () => { try {
    const response = await net.fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) return null;
    // Preserve source aspect ratio; the renderer uses object-fit: contain in a square.
    const image = nativeImage.createFromBuffer(bytes);
    if (image.isEmpty()) return null;
    const bitmap = image.toBitmap();
    const size = image.getSize();
    const alpha = new Uint8Array(170 * 170);
    const scale = Math.min(170 / size.width, 170 / size.height);
    const width = Math.max(1, Math.round(size.width * scale)), height = Math.max(1, Math.round(size.height * scale));
    const left = Math.floor((170 - width) / 2), top = Math.floor((170 - height) / 2);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sourceX = Math.min(size.width - 1, Math.floor(x / width * size.width));
      const sourceY = Math.min(size.height - 1, Math.floor(y / height * size.height));
      alpha[(top + y) * 170 + left + x] = bitmap[(sourceY * size.width + sourceX) * 4 + 3];
    }
    const result = { width: 170, height: 170, alpha };
    maskCache.set(url, result);
    return result;
  } catch { return null; /* Fall back to image bounds if the remote PNG is unavailable. */ }
  finally { clearTimeout(timeout); maskRequests.delete(url); } })();
  maskRequests.set(url, request);
  const result = await request;
  if (generation === maskGeneration) alphaMask = result;
}

app.whenReady().then(async () => {
  logic = await import('./logic.js'); assets = await import('../lib/assets.js');
  const saved = readSaved();
  preferences = logic.normalizePreferences(saved.preferences);
  for (const id of Array.isArray(saved.shownIds) ? saved.shownIds : []) if (typeof id === 'string' && id.length <= 240) acknowledged.add(id);
  queue = new logic.NoticeQueue({ shownIds: [...acknowledged] });
  const bounds = logic.clampWindowBounds({ ...(saved.bounds ?? {}), ...logic.WINDOW_SIZE }, screen.getAllDisplays());
  const allowedImages = new Set([assets.SIGN_URL, ...assets.ICONS.map(value => assets.IMG + value), ...assets.PETITS.flat().map(value => assets.IMG + value), ...assets.CARDS.map(card => card.url), ...assets.MOBAMAS.map(card => card.url)]);
  protocol.handle('yukimi', async request => {
    const resource = localResources.get(request.url);
    if (request.method !== 'GET' || !resource) return new Response('Not found', { status: 404 });
    try {
      return new Response(await fs.promises.readFile(resource.file), { headers: { 'Content-Type': resource.contentType, 'X-Content-Type-Options': 'nosniff' } });
    } catch (error) {
      process.stderr.write(`Yukimi local resource failed: ${resource.file} (${error.message})\n`);
      return new Response('Unavailable', { status: 500 });
    }
  });
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try {
      const url = new URL(details.url);
      allowed = url.protocol === 'yukimi:' ? localResources.has(details.url) : allowedImages.has(details.url);
    } catch (error) { process.stderr.write(`Yukimi blocked malformed resource: ${details.url} (${error.message})\n`); }
    callback({ cancel: !allowed });
  });
  window = new BrowserWindow({ ...bounds, title: '雪美 · 桌宠', transparent: true, frame: false, resizable: false, maximizable: false, minimizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, hasShadow: false, backgroundColor: '#00000000', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false, devTools: false } });
  window.setAlwaysOnTop(true, 'floating');
  window.setIgnoreMouseEvents(true, { forward: true });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationURL) => {
    if ((event.url ?? navigationURL) !== PAGE_URL) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame) { process.stderr.write(`Yukimi renderer load failed (${code}): ${description}\n`); quit(); }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    process.stderr.write(`Yukimi renderer exited: ${details.reason} (${details.exitCode})\n`);
    quit();
  });
  window.on('moved', scheduleSave);
  window.on('close', saveNow);
  const clamp = () => { if (!window.isDestroyed()) window.setBounds(logic.clampWindowBounds(window.getBounds(), screen.getAllDisplays())); };
  screen.on('display-added', clamp); screen.on('display-removed', clamp); screen.on('display-metrics-changed', clamp);

  ipcMain.handle('yukimi:ready', event => {
    if (!trusted(event)) return null;
    initialized = true;
    const packet = publish(true, queue.update(state.notices));
    window.showInactive();
    output({ type: 'preferences', preferences });
    output({ type: 'ready' });
    return packet;
  });
  ipcMain.on('yukimi:regions', (event, value) => {
    if (!trusted(event)) return;
    const { width, height } = window.getContentBounds();
    const checked = logic.validateRectangles(value, width, height);
    if (checked) { rectangles = checked; updateMousePassthrough(); }
  });
  ipcMain.on('yukimi:open-session', (event, sessionId) => {
    if (!trusted(event) || typeof sessionId !== 'string') return;
    const visible = [...queue.persistent, ...(queue.active ? [queue.active] : [])];
    if (visible.some(notice => notice.sessionId === sessionId)) {
      output({ type: 'open-session', sessionId });
      shell.openExternal('dsh://open').catch(error => process.stderr.write(`Yukimi open Harness: ${error.message}\n`));
    }
  });
  ipcMain.on('yukimi:shown', (event, ids) => {
    if (!trusted(event) || !Array.isArray(ids) || ids.length > 5000) return;
    for (const id of ids) if (typeof id === 'string' && queue.seen.has(id) && !acknowledged.has(id)) {
      acknowledged.add(id); output({ type: 'notice-shown', id });
    }
    scheduleSave();
  });
  ipcMain.on('yukimi:preferences', (event, value) => {
    if (!trusted(event) || !value || typeof value !== 'object' || Array.isArray(value)) return;
    preferences = logic.normalizePreferences(value, preferences);
    output({ type: 'preferences', preferences }); scheduleSave(); refreshMask(); publish(true);
  });
  ipcMain.on('yukimi:drag', (event, action) => {
    if (!trusted(event) || !['start', 'end'].includes(action)) return;
    if (action === 'start') {
      const cursor = screen.getCursorScreenPoint();
      drag = { cursor, bounds: window.getBounds() };
      ignores = false;
      window.setIgnoreMouseEvents(false);
    } else { drag = null; clamp(); scheduleSave(); }
  });
  mouseTimer = setInterval(() => {
    if (!window || window.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    if (drag) {
      window.setBounds(logic.clampWindowBounds({ ...drag.bounds, x: drag.bounds.x + cursor.x - drag.cursor.x, y: drag.bounds.y + cursor.y - drag.cursor.y }, screen.getAllDisplays()));
      return;
    }
    updateMousePassthrough();
  }, 32);
  stateTimer = setInterval(() => { if (initialized) publish(); }, 150);
  parentTimer = setInterval(() => { try { process.kill(parentPid, 0); } catch { quit(); } }, 1000);
  protocolReady = true;
  for (const line of pendingLines) receive(line);
  pendingLines = [];
  await window.loadURL(PAGE_URL);
  refreshMask();
}).catch(error => { process.stderr.write(`Yukimi startup: ${error.stack || error}\n`); quit(); });

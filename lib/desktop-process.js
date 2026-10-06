import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { homedir } from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));

export function helperCommand() {
  const bundled = path.join(root, 'desktop', 'runtime', 'win32-x64', 'Yukimi Desktop.exe');
  if (existsSync(bundled)) return { executable: bundled, args: [] };
  const development = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (existsSync(development)) return { executable: development, args: [path.join(root, 'desktop', 'main.cjs')] };
  return null;
}

export function launchHelper({ onMessage, onExit, onError, command = helperCommand(), spawnProcess = spawn,
  dataDirectory = path.join(process.env.DSH_HOME || path.join(homedir(), '.dsh'), 'yukimi-desktop'), startupTimeout = 20000 }) {
  if (!command) { onError(new Error('桌宠程序尚未打包，请运行 npm run desktop:package。')); return null; }
  // Windows GUI processes cannot reliably retain anonymous stdin handles. Use a
  // private named pipe instead; no TCP port or web server is opened.
  const pipeName = '\\\\.\\pipe\\dsh-yukimi-' + randomUUID(), token = randomUUID();
  const env = { ...process.env, YUKIMI_BRIDGE_TOKEN: token };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  let child, socket, ended = false, closing = false, ready = false, errorTail = '', killTimer;
  const pending = [], connections = new Set();
  const server = createServer();
  const closeServer = () => { try { server.close(); } catch { /* Already stopped. */ } };
  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(startupTimer); clearTimeout(killTimer);
    closeServer();
    for (const connection of connections) connection.destroy();
    pending.length = 0;
    onExit();
  };
  const fail = error => {
    if (ended) return;
    onError(error);
    child?.kill();
    finish();
  };
  const startupTimer = setTimeout(() => fail(new Error(`桌宠启动超时${errorTail ? ': ' + errorTail : ''}`)), startupTimeout);
  startupTimer.unref();
  server.on('error', fail);
  server.on('connection', connection => {
    if (closing || ended || socket) { connection.destroy(); return; }
    connections.add(connection);
    connection.setEncoding('utf8');
    let buffer = '', authenticated = false;
    const handshakeTimer = setTimeout(() => connection.destroy(), 2000);
    handshakeTimer.unref();
    connection.on('error', error => { if (authenticated && !closing) fail(error); });
    connection.on('close', () => {
      clearTimeout(handshakeTimer); connections.delete(connection);
      if (authenticated && !ended && !closing) fail(new Error('桌宠连接已断开。'));
    });
    connection.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer, 'utf8') > 65536) { connection.destroy(); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const raw = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        let message;
        try { message = JSON.parse(raw); } catch { continue; }
        if (!message || typeof message !== 'object' || Array.isArray(message)) continue;
        if (!authenticated) {
          if (message.type !== 'bridge-hello' || message.token !== token) { connection.destroy(); return; }
          authenticated = true; socket = connection; clearTimeout(handshakeTimer); closeServer();
          for (const line of pending.splice(0)) socket.write(line);
          continue;
        }
        if (message.type === 'ready') { ready = true; clearTimeout(startupTimer); }
        onMessage(message);
      }
    });
  });
  server.listen(pipeName, () => {
    if (closing || ended) { finish(); return; }
    try {
      child = spawnProcess(command.executable, [...command.args, '--yukimi-data-dir', dataDirectory, '--bridge-pipe', pipeName], {
        cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (error) { fail(error); return; }
    child.once('error', fail);
    child.once('exit', code => {
      if (!closing && !ended && (code || !ready)) onError(new Error(`桌宠${ready ? '退出' : '启动未完成'} (${code})${errorTail ? ': ' + errorTail : ''}`));
      finish();
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', chunk => { errorTail = (errorTail + chunk).slice(-1200); });
  });
  return {
    send(message) {
      if (ended || closing) return;
      const line = JSON.stringify(message) + '\n';
      if (socket) socket.write(line);
      else { if (pending.length === 20) pending.shift(); pending.push(line); }
    },
    close() {
      if (ended || closing) return;
      closing = true;
      clearTimeout(startupTimer); closeServer();
      if (!child) { finish(); return; }
      socket?.end();
      killTimer = setTimeout(() => { if (!ended) { child.kill(); finish(); } }, 3000);
      killTimer.unref();
    },
    get pid() { return child?.pid; },
  };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launchHelper } from '../lib/desktop-process.js';

const fixture = fileURLToPath(new URL('./helpers/bridge-child.cjs', import.meta.url));
const windows = { skip: process.platform !== 'win32', timeout: 5000 };
const command = mode => ({ executable: process.execPath, args: [fixture, mode] });

test('Windows pipe authenticates before flushing queued state and preserves fragmented messages', windows, async () => {
  const messages = [], errors = [];
  let closed, echoed;
  const exited = new Promise(resolve => { closed = resolve; });
  const echo = new Promise(resolve => { echoed = resolve; });
  const helper = launchHelper({ command: command('bad-first'), onError: error => errors.push(error), onExit: closed,
    onMessage(message) { messages.push(message); if (message.type === 'echo') echoed(message.message); },
  });
  try {
    helper.send({ type: 'state', runningCount: 2, notices: [] });
    assert.deepEqual(await echo, { type: 'state', runningCount: 2, notices: [] });
    // Ready can arrive after the echo: the queued state flush follows authentication.
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.deepEqual(messages.filter(value => value.type !== 'echo').map(value => value.type), ['preferences', 'ready']);
    assert.ok(helper.pid > 0);
  } finally { helper.close(); await exited; }
  assert.deepEqual(errors, []);
});

test('synchronous spawn failure reports one failure and disposes its pipe', windows, async () => {
  const errors = [];
  await new Promise(resolve => launchHelper({ command: command('unused'), spawnProcess() { throw new Error('fixture spawn failure'); },
    onMessage() {}, onError: error => errors.push(error.message), onExit: resolve,
  }));
  assert.deepEqual(errors, ['fixture spawn failure']);
});

test('helper without readiness times out and its owned process exits', windows, async () => {
  const errors = [];
  let helper;
  await new Promise(resolve => { helper = launchHelper({ command: command('no-connect'), startupTimeout: 150,
    onMessage() {}, onError: error => errors.push(error.message), onExit: resolve,
  }); });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /启动超时/);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.throws(() => process.kill(helper.pid, 0), { code: 'ESRCH' });
});

test('closing before listen never starts a child', windows, async () => {
  let spawned = false, resolveExit;
  const exited = new Promise(resolve => { resolveExit = resolve; });
  const helper = launchHelper({ command: command('unused'), spawnProcess() { spawned = true; },
    onMessage() {}, onError() {}, onExit: resolveExit,
  });
  helper.close(); await exited;
  assert.equal(spawned, false);
});

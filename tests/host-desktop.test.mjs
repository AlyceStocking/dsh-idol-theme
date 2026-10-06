import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { apply, installDesktop } from '../lib/index.js';
import { DesktopState } from '../lib/desktop-state.js';
import { CARDS } from '../lib/assets.js';

const clone = value => JSON.parse(JSON.stringify(value));

// Match the installed Host contracts: subject-first Session events, scoped Agent
// payloads, explicit runtime roots, and onChanged(session, key, value, asOfSeq).
function host({ roots = [], children = [], profile = 'desktop', initial = new Map() } = {}) {
  const events = new Map(), projectionListeners = new Set(), routes = new Map(), effects = [];
  const values = new Map(initial), warnings = [], sent = [];
  const agents = new Map([...roots, ...children].map(agent => [agent.id, agent]));
  let callbacks, closeCount = 0;
  const services = {
    profileContext: { name: profile }, webServer: {},
    agents: { roots: () => [...roots], get: id => agents.get(id) },
    sessionProjections: {
      stateOf(session, key) { return values.get(session.id)?.[key]; },
      onChanged(listener) {
        projectionListeners.add(listener);
        return () => projectionListeners.delete(listener);
      },
    },
    connection: {
      get rpc() { throw new Error('The provider-owned RPC facade cannot read the consumer webServer injection'); },
      register(owner, channel, handler) {
        assert.strictEqual(owner, ctx, 'RPC routes must belong to the consuming plugin context');
        assert.equal(channel, '/yukimi');
        return owner.effect(() => {
          assert.ok(!routes.has(channel));
          routes.set(channel, handler);
          return () => routes.delete(channel);
        });
      },
    },
  };
  const ctx = {
    get: name => services[name],
    logger: () => ({ warn: value => warnings.push(value) }),
    on(name, listener, options) {
      assert.equal(options.global, true, 'Host observers must cross Agent scopes');
      const listeners = events.get(name) ?? [];
      if (options.prepend) listeners.unshift(listener); else listeners.push(listener);
      events.set(name, listeners);
      return () => { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); };
    },
    effect(factory) { const dispose = factory(); if (typeof dispose === 'function') effects.push(dispose); return dispose; },
  };
  const state = new DesktopState({ now: () => 100_000, random: () => 0 });
  const bridge = installDesktop(ctx, { state, startHelper(options) {
    callbacks = options;
    return { send: value => sent.push(clone(value)), close: () => { closeCount++; } };
  } });
  return {
    ctx, state, services, roots, agents, sent, warnings,
    emit(name, ...args) { return [...(events.get(name) ?? [])].map(listener => listener(...args)); },
    project(session, key, value, asOfSeq = session.seq) {
      values.set(session.id, { ...values.get(session.id), [key]: value });
      for (const listener of [...projectionListeners]) listener(session, key, key === 'userQuestions' ? value.questions : value, asOfSeq);
    },
    message(value) { callbacks.onMessage(value); },
    exit() { callbacks.onExit(); },
    error(error) { callbacks.onError(error); },
    rpc(endpoint, payload = {}) { return routes.get('/yukimi')(endpoint, payload); },
    flush: () => delay(45),
    dispose() { bridge.dispose(); for (const dispose of effects.splice(0).reverse()) dispose(); },
    get closeCount() { return closeCount; },
    get listenerCount() { return [...events.values()].reduce((count, listeners) => count + listeners.length, 0) + projectionListeners.size; },
    get routeCount() { return routes.size; },
  };
}

function agent(id, { status = 'idle', events = [], parentSession } = {}) {
  const reads = [];
  const session = {
    id, seq: events.length, header: { id, ...(parentSession ? { parentSession } : {}) },
    eventAt(seq) { reads.push(seq); return events[seq]; },
  };
  return { id, status, session, reads };
}

const questionView = active => ({ questions: { active, settled: [] } });
const noticeKeys = state => state.snapshot().notices.map(notice => notice.key).sort();

test('RPC registration passes the consumer owner explicitly and avoids the scoped provider facade', async () => {
  const h = host();
  try {
    assert.equal(h.routeCount, 1);
    assert.equal((await h.rpc('state')).ok, true);
    assert.equal((await h.rpc('state')).value.active, false);
  } finally { h.dispose(); }
  assert.equal(h.routeCount, 0, 'the consumer context removes its route on unload');
});

test('root Agents from different sessions are monitored; live children are excluded and resumed forks remain roots', async t => {
  const first = agent('session-a'), resumed = agent('session-fork', { parentSession: 'session-old' });
  const child = agent('session-child', { status: 'running', parentSession: first.id });
  const h = host({ roots: [first, resumed], children: [child] });
  t.after(() => h.dispose());
  for (const subject of [first, resumed, child]) h.emit('session/event', subject.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  assert.deepEqual([...h.state.sessions.keys()], [first.id, resumed.id]);
  assert.deepEqual(h.state.snapshot().notices.map(notice => notice.sessionId), [first.id, resumed.id]);
  h.emit('agent/status', { agent: first, status: 'running' });
  h.emit('agent/status', { agent: child, status: 'running' });
  assert.equal(h.state.snapshot().runningCount, 1);
  h.emit('agent/disposed', { agent: first });
  assert.equal(h.state.snapshot().runningCount, 0);
  const created = agent('session-new', { status: 'running' });
  h.roots.push(created); h.agents.set(created.id, created);
  h.emit('agent/created', { agent: child });
  h.emit('agent/created', { agent: created });
  assert.equal(h.state.sessions.has(child.id), false);
  assert.equal(h.state.sessions.has(created.id), true);
  assert.equal(h.state.snapshot().runningCount, 1);
});

test('startup joins legacy open calls, continued question projections and unmatched approvals without reading earlier chat', t => {
  const old = { type: 'user/message', get data() { throw new Error('Old chat must not be read'); } };
  const events = [old, old,
    { type: 'turn/start', data: { turn: 3 } },
    { type: 'tool/call', data: { name: 'ask_user_question', callId: 'legacy' } },
    { type: 'tool/call', data: { name: 'ask_user_question', callId: 'already-answered' } },
    { type: 'tool/result', data: { message: { toolCallId: 'already-answered' } } },
    { type: 'approval/asked', data: { id: 'approved' } },
    { type: 'approval/decided', data: { id: 'approved', outcome: 'allowed-once' } },
    { type: 'approval/asked', data: { id: 'waiting' } },
  ];
  const root = agent('session-a', { status: 'running', events });
  const h = host({ roots: [root], initial: new Map([[root.id, {
    title: '会话标题', turnBoundary: { openTurnStartSeq: 2 },
    userQuestions: questionView([{ callId: 'continued', state: 'continued' }]),
  }]]) });
  t.after(() => h.dispose());
  assert.deepEqual(root.reads, [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(noticeKeys(h.state), ['approval:waiting', 'question:continued', 'question:legacy']);
  assert.ok(h.state.snapshot().notices.every(notice => notice.title === '会话标题' && notice.persistent));
  assert.equal(h.state.snapshot().runningCount, 1);
});

test('late tool results and answered projections clear only their question; unrelated pending requests survive', t => {
  const root = agent('session-a');
  const h = host({ roots: [root], initial: new Map([[root.id, { userQuestions: questionView([{ callId: 'continued', state: 'continued' }]) }]]) });
  t.after(() => h.dispose());
  h.emit('session/event', root.session, { type: 'tool/call', data: { name: 'ask_user_question', callId: 'legacy' } });
  h.emit('session/event', root.session, { type: 'approval/asked', data: { id: 'approval-a' } });
  h.project(root.session, 'userQuestions', questionView([{ callId: 'continued', state: 'continued' }]));
  assert.deepEqual(noticeKeys(h.state), ['approval:approval-a', 'question:continued', 'question:legacy']);
  h.emit('session/event', root.session, { type: 'tool/result', data: { message: { toolCallId: 'legacy', get content() { throw new Error('Message body must not be read'); } } } });
  assert.deepEqual(noticeKeys(h.state), ['approval:approval-a', 'question:continued']);
  h.project(root.session, 'userQuestions', questionView([]));
  h.emit('session/event', root.session, { type: 'user/message', data: { source: { kind: 'user-question-reply', callId: 'continued' } } });
  assert.deepEqual(noticeKeys(h.state), ['approval:approval-a']);
  h.emit('session/event', root.session, { type: 'approval/decided', data: { id: 'approval-a', outcome: 'allowed-once' } });
  assert.deepEqual(noticeKeys(h.state), []);
});

test('question waterfall preserves next result and error identity and clears foreground waits', async t => {
  const root = agent('session-a'), child = agent('session-child');
  const h = host({ roots: [root], children: [child] });
  t.after(() => h.dispose());
  let settle, nextCalls = 0;
  const chosen = { answers: [{ id: 'question-1', selected: ['继续'] }] };
  const [pending] = h.emit('user-questions/request', { agent: root, wait: { callId: 'foreground' }, questions: [{ id: 'question-1' }] }, () => { nextCalls++; return new Promise(resolve => { settle = resolve; }); });
  assert.deepEqual(noticeKeys(h.state), ['question:foreground']);
  settle(chosen);
  assert.equal(await pending, chosen);
  assert.equal(nextCalls, 1);
  assert.deepEqual(noticeKeys(h.state), []);
  const failure = new Error('Exact provider failure');
  const [rejected] = h.emit('user-questions/request', { agent: root, wait: { callId: 'failing' }, questions: [] }, () => Promise.reject(failure));
  await assert.rejects(rejected, error => error === failure);
  assert.deepEqual(noticeKeys(h.state), []);
  const controller = new AbortController(); controller.abort();
  for (const request of [{ agent: child }, { agent: root, signal: controller.signal }]) {
    const [result] = h.emit('user-questions/request', request, () => { nextCalls++; return chosen; });
    assert.equal(await result, chosen);
    assert.deepEqual(noticeKeys(h.state), []);
  }
  assert.equal(nextCalls, 3);
});

test('the installed legacy tool request has no wait identity and still produces only one question bubble', async t => {
  const root = agent('session-a');
  const h = host({ roots: [root] });
  t.after(() => h.dispose());
  h.emit('session/event', root.session, { type: 'tool/call', data: { name: 'ask_user_question', callId: 'legacy-live' } });
  let answer;
  const [pending] = h.emit('user-questions/request', {
    agent: root, signal: new AbortController().signal,
    questions: [{ id: 'choice', question: '继续吗？' }],
  }, () => new Promise(resolve => { answer = resolve; }));
  try {
    assert.deepEqual(noticeKeys(h.state), ['question:legacy-live']);
  } finally { answer({ answers: [] }); await pending; }
  h.emit('session/event', root.session, { type: 'tool/result', data: { message: { toolCallId: 'legacy-live' } } });
  assert.deepEqual(noticeKeys(h.state), []);
});

test('helper readiness, preference updates and latest navigation acknowledgements follow the RPC contract', async t => {
  const first = agent('session-a'), second = agent('session-b');
  const h = host({ roots: [first, second] });
  t.after(() => h.dispose());
  assert.equal((await h.rpc('state')).value.active, false);
  h.message({ type: 'ready' });
  assert.equal((await h.rpc('state')).value.active, true);
  h.message({ type: 'preferences', preferences: { cardIndex: 2, bg: CARDS[3].url, showSign: false } });
  assert.equal((await h.rpc('state')).value.preferences.cardIndex, 2);
  const saved = await h.rpc('preferences', { showSign: true, bg: 'https://invalid.example/image.png' });
  assert.equal(saved.ok, true);
  assert.equal(saved.value.showSign, true);
  assert.equal(saved.value.bg, CARDS[3].url);
  assert.equal(h.sent.at(-1).type, 'preferences');
  h.message({ type: 'open-session', sessionId: first.id });
  const earlier = (await h.rpc('state')).value.navigation;
  h.message({ type: 'open-session', sessionId: second.id });
  const latest = (await h.rpc('state')).value.navigation;
  assert.notEqual(earlier.requestId, latest.requestId);
  assert.equal((await h.rpc('ack-navigation', { requestId: earlier.requestId })).value, false);
  assert.deepEqual((await h.rpc('state')).value.navigation, latest);
  assert.equal((await h.rpc('ack-navigation', { requestId: latest.requestId })).value, true);
  assert.equal((await h.rpc('state')).value.navigation, null);
  h.message({ type: 'open-session', sessionId: 'unknown-session' });
  assert.equal((await h.rpc('state')).value.navigation, null);
  assert.equal((await h.rpc('unknown')).ok, false);
  await h.flush();
  assert.ok(h.sent.some(packet => packet.type === 'state' && packet.active));
});

test('startup waits for saved helper preferences before sending an authoritative state snapshot', async t => {
  const root = agent('session-a');
  const h = host({ roots: [root] });
  t.after(() => h.dispose());
  await h.flush();
  assert.deepEqual(h.sent, [], 'default Host preferences must not overwrite the helper saved settings while it boots');
  h.message({ type: 'preferences', preferences: { cardIndex: 4, bg: CARDS[8].url, showMobamas: true } });
  h.message({ type: 'ready' });
  await h.flush();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].preferences.cardIndex, 4);
  assert.equal(h.sent[0].preferences.bg, CARDS[8].url);
  assert.equal(h.sent[0].preferences.showMobamas, true);
});

test('automatic approval decisions are coalesced and terminal notices acknowledge once', async t => {
  const root = agent('session-a');
  const h = host({ roots: [root] });
  t.after(() => h.dispose());
  h.message({ type: 'ready' });
  h.emit('session/event', root.session, { type: 'approval/asked', data: { id: 'auto' } });
  h.emit('session/event', root.session, { type: 'approval/decided', data: { id: 'auto', outcome: 'rejected' } });
  await h.flush();
  assert.ok(h.sent.length);
  assert.ok(h.sent.every(packet => !packet.notices?.some(notice => notice.kind === 'approval')));
  h.emit('session/event', root.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  const completed = h.state.snapshot().notices[0];
  h.message({ type: 'notice-shown', id: completed.id });
  assert.deepEqual(noticeKeys(h.state), []);
  h.emit('session/event', root.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  assert.deepEqual(noticeKeys(h.state), []);
});

test('helper exit restores browser state and dispose removes observers and closes the owned helper once', async () => {
  const root = agent('session-a');
  const h = host({ roots: [root] });
  h.message({ type: 'ready' }); h.exit();
  assert.equal((await h.rpc('state')).value.active, false);
  h.dispose(); h.dispose();
  assert.equal(h.closeCount, 0, 'already-exited helper has no live process to close');
  assert.equal(h.listenerCount, 0); assert.equal(h.routeCount, 0);

  const alive = host({ roots: [root] });
  alive.message({ type: 'ready' });
  const [pending] = alive.emit('user-questions/request', { agent: root, wait: { callId: 'dispose-wait' } }, () => delay(10).then(() => 'answer'));
  alive.dispose(); alive.dispose();
  alive.message({ type: 'ready' });
  assert.equal(await pending, 'answer');
  await alive.flush();
  assert.equal(alive.state.active, false);
  assert.equal(alive.closeCount, 1);
  assert.equal(alive.listenerCount, 0); assert.equal(alive.routeCount, 0);
  assert.equal(alive.sent.length, 0, 'no delayed snapshots after unload');
});

test('apply leaves the ordinary web profile unchanged', () => {
  let touched = false;
  apply({ get(name) { assert.equal(name, 'profileContext'); return { name: 'web' }; }, on() { touched = true; } });
  assert.equal(touched, false);
});

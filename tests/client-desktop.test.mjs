import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import * as sharedAssets from '../lib/assets.js';
import { CHARACTERS, normalizeAppearance } from '../lib/characters.js';
import { loadTheme } from './helpers/theme-harness.mjs';

const plain = value => JSON.parse(JSON.stringify(value));

test('the browser and desktop use identical character artwork and placeholder lines', () => {
  const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  const embedded = client.match(/\/\/ BEGIN YUKIMI_ASSETS[^\n]*\n([\s\S]*?)\/\/ END YUKIMI_ASSETS/)[1];
  const assets = vm.runInNewContext(`${embedded}\n({ IMG, ICONS, PETITS, CARDS, MOBAMAS, LINES, SIGN_URL })`);
  assert.deepEqual(plain(assets), plain(sharedAssets));
  assert.equal(sharedAssets.PETITS.length, sharedAssets.ICONS.length);
  assert.ok(sharedAssets.PETITS.every(frames => frames.length === 4));
  const characters = vm.runInNewContext(`${embedded}\nCHARACTERS`);
  assert.deepEqual(plain(characters), plain(CHARACTERS));
});

test('character selection updates page background, signature and Mobamas together', () => {
  const theme = loadTheme();
  theme.update({ characterId: 'arisu', showMobamas: true });
  const expected = normalizeAppearance({ characterId: 'arisu', showMobamas: true });
  const prefs = theme.preferences.getSnapshot();
  for (const [key, value] of Object.entries(expected)) assert.equal(prefs[key], value);
  const overlay = theme.render();
  assert.equal(overlay.children[0].props.characterId, 'arisu');
  assert.equal(overlay.children[2].props.characterId, 'arisu');
  assert.ok(overlay.children[3].children[0].includes(expected.bg));
  theme.dispose();
});

test('appearance preferences preserve the theme and reject arbitrary background URLs', () => {
  const theme = loadTheme();
  const before = plain(theme.preferences.getSnapshot());
  theme.update({ cardIndex: -1, petitIndex: 4, bg: 'https://example.invalid/evil.png', showSign: 'false', desktopActive: true, compact: true });
  assert.deepEqual(plain(theme.preferences.getSnapshot()), before);
  theme.update({ cardIndex: 3, petitIndex: 2, bg: sharedAssets.CARDS[6].url, showSign: false, showMobamas: true });
  assert.equal(theme.preferences.getSnapshot().cardIndex, 3);
  assert.equal(theme.preferences.getSnapshot().petitIndex, 2);
  const overlay = theme.render();
  assert.equal(overlay.children[0].props.show, false);
  assert.equal(overlay.children[2].props.show, true);
  assert.ok(overlay.children[3].children[0].includes(sharedAssets.CARDS[6].url));
  theme.dispose();
});

function bridgeState(overrides = {}) {
  return {
    active: true,
    preferences: { cardIndex: 7, petitIndex: 0, bg: sharedAssets.CARDS[23].url, showSign: true, showMobamas: false },
    navigation: null,
    ...overrides,
  };
}

function bridgeRpc(state, behavior) {
  const calls = [];
  return {
    calls,
    async call(channel, endpoint, payload, signal) {
      calls.push({ channel, endpoint, payload: plain(payload), signal });
      assert.equal(channel, '/yukimi');
      if (behavior) {
        const special = behavior(endpoint, payload, signal);
        if (special !== undefined) return await special;
      }
      if (endpoint === 'state') return { ok: true, value: plain(state) };
      if (endpoint === 'preferences') {
        state.preferences = { ...state.preferences, ...payload };
        return { ok: true, value: plain(state.preferences) };
      }
      if (endpoint === 'ack-navigation') {
        if (state.navigation?.requestId === payload.requestId) state.navigation = null;
        return { ok: true, value: null };
      }
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    },
  };
}

test('desktop activation hides only the page pet and a stopped helper restores it', async () => {
  const state = bridgeState();
  state.preferences.showMobamas = true;
  const rpc = bridgeRpc(state);
  const theme = loadTheme({ rpc });
  await theme.tick();
  assert.equal(theme.render().children[1], null);
  assert.equal(theme.render().children[0].props.show, true);
  assert.equal(theme.render().children[2].props.show, true);
  assert.ok(theme.render().children[3].children[0].includes(state.preferences.bg));
  assert.equal(rpc.calls.filter(call => call.endpoint === 'preferences').length, 0);
  state.active = false;
  await theme.tick();
  assert.ok(theme.render().children[1]);
  assert.equal(theme.preferences.getSnapshot().showMobamas, true);
  theme.dispose();
  assert.equal(theme.intervals.size, 0);
  assert.equal(theme.timeouts.size, 0);
});

test('Host preference changes update the page without being pushed back to the Host', async () => {
  const state = bridgeState();
  const rpc = bridgeRpc(state);
  const theme = loadTheme({ rpc });
  await theme.tick();
  state.preferences.bg = sharedAssets.CARDS[5].url;
  state.preferences.showSign = false;
  await theme.tick();
  assert.equal(theme.preferences.getSnapshot().bg, state.preferences.bg);
  assert.equal(theme.render().children[0].props.show, false);
  assert.equal(rpc.calls.filter(call => call.endpoint === 'preferences').length, 0);
  theme.update({ showSign: true });
  await theme.tick();
  assert.equal(state.preferences.showSign, true);
  assert.deepEqual(rpc.calls.find(call => call.endpoint === 'preferences').payload, { showSign: true });
  theme.dispose();
});

test('a preference edit made during an in-flight save survives the earlier Host snapshot', async () => {
  const state = bridgeState({ active: false });
  let resolveSave;
  let deferSave = true;
  const rpc = bridgeRpc(state, (endpoint, payload) => {
    if (endpoint === 'preferences' && deferSave) {
      deferSave = false;
      return new Promise(resolve => { resolveSave = () => { state.preferences = { ...state.preferences, ...payload }; resolve({ ok: true, value: plain(state.preferences) }); }; });
    }
  });
  const theme = loadTheme({ rpc });
  await theme.tick();
  theme.update({ cardIndex: 3 });
  theme.update({ bg: sharedAssets.CARDS[4].url });
  resolveSave();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(theme.preferences.getSnapshot().bg, sharedAssets.CARDS[4].url);
  await theme.tick();
  assert.equal(state.preferences.cardIndex, 3);
  assert.equal(state.preferences.bg, sharedAssets.CARDS[4].url);
  assert.equal(rpc.calls.filter(call => call.endpoint === 'preferences').length, 2);
  theme.dispose();
});

test('a bubble click opens its session through uiWorkspace and acknowledgement retry does not reopen it', async () => {
  const state = bridgeState({ navigation: { requestId: 'click-1', sessionId: 'session-1' } });
  let failAck = true;
  const rpc = bridgeRpc(state, endpoint => {
    if (endpoint === 'ack-navigation' && failAck) { failAck = false; return Promise.reject(new Error('Temporary bridge disconnect')); }
  });
  const opened = [];
  const theme = loadTheme({ rpc, workspace: { openSession: sessionId => opened.push(sessionId) } });
  await theme.tick();
  assert.deepEqual(opened, ['session-1']);
  assert.ok(state.navigation);
  await theme.tick();
  assert.deepEqual(opened, ['session-1']);
  assert.equal(state.navigation, null);
  theme.dispose();
});

test('navigation waits for the official workspace service without dropping the request', async () => {
  const state = bridgeState({ navigation: { requestId: 'click-2', sessionId: 'session-2' } });
  const rpc = bridgeRpc(state);
  const theme = loadTheme({ rpc });
  await theme.tick();
  assert.equal(rpc.calls.filter(call => call.endpoint === 'ack-navigation').length, 0);
  const opened = [];
  theme.services.uiWorkspace = { openSession: sessionId => opened.push(sessionId) };
  await theme.tick();
  assert.deepEqual(opened, ['session-2']);
  assert.equal(state.navigation, null);
  theme.dispose();
});

test('missing or failed Host RPC keeps the original browser pet available', async () => {
  const plainTheme = loadTheme();
  assert.ok(plainTheme.render().children[1]);
  assert.equal(plainTheme.intervals.size, 0);
  plainTheme.dispose();
  let unavailable = false;
  const rpc = bridgeRpc(bridgeState(), () => unavailable ? Promise.reject(new Error('HTTP 404')) : undefined);
  const theme = loadTheme({ rpc });
  await theme.tick();
  assert.equal(theme.render().children[1], null);
  unavailable = true;
  await theme.tick();
  assert.ok(theme.render().children[1]);
  theme.dispose();
});

test('a stalled bridge request times out and unloading aborts outstanding requests', async () => {
  let hanging = false;
  const rpc = bridgeRpc(bridgeState(), (_endpoint, _payload, signal) => hanging ? new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })) : undefined);
  const theme = loadTheme({ rpc });
  await theme.tick();
  assert.equal(theme.render().children[1], null);
  hanging = true;
  const stalled = theme.tick();
  await theme.fireTimeouts();
  await stalled;
  assert.ok(theme.render().children[1]);
  const pending = theme.tick();
  const signal = rpc.calls.at(-1).signal;
  theme.dispose();
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(theme.intervals.size, 0);
  assert.equal(theme.timeouts.size, 0);
  assert.equal(theme.styles.size, 0);
});

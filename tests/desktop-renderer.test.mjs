import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as assets from '../lib/assets.js';
import * as characters from '../lib/characters.js';

const renderer = await readFile(new URL('../desktop/renderer.js', import.meta.url), 'utf8');
const imports = renderer.match(/^import .+;\r?$/gm) || [];
assert.equal(imports.length, 2, 'the harness supplies the renderer asset and sprite-cache imports');
const source = renderer.replace(/^import .+;\r?\n/gm, '');
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const sprite = (cardIndex, petitIndex = 0) => assets.IMG + assets.PETITS[cardIndex][petitIndex];

class Clock {
  now = 0;
  nextId = 1;
  jobs = new Map();
  schedule(callback, delay, interval = 0) {
    const id = this.nextId++;
    this.jobs.set(id, { callback, at: this.now + delay, interval });
    return id;
  }
  clear(id) { this.jobs.delete(id); }
  async advance(duration) {
    const target = this.now + duration;
    await flush();
    let count = 0;
    while (true) {
      const next = [...this.jobs].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      assert.ok(count++ < 10000, 'virtual timers must make progress');
      const [id, job] = next;
      this.now = job.at;
      if (job.interval) job.at += job.interval;
      else this.jobs.delete(id);
      job.callback();
      await flush();
    }
    this.now = target;
    await flush();
  }
}

class Element {
  constructor(id = '') {
    this.id = id; this.children = []; this.hidden = false; this.src = ''; this.scrollTop = 0;
    this.listeners = new Map();
    this.style = { setProperty(name, value) { this[name] = value; } };
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value),
      toggle(value, enabled = !classes.has(value)) { if (enabled) classes.add(value); else classes.delete(value); return enabled; },
    };
  }
  get offsetWidth() { return this.id === 'running' ? 90 : 170; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener); this.listeners.set(type, listeners);
  }
  dispatch(type, data = {}) {
    const event = { button: 0, pointerId: 1, screenX: 250, screenY: 600, target: this, preventDefault() {}, ...data };
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
  setPointerCapture() {}
  getBoundingClientRect() {
    const isPet = this.id === 'pet' || this.id === 'pet-wrap';
    const x = Number.parseFloat(this.style.left) || (isPet ? 95 : 20);
    const y = Number.parseFloat(this.style.top) || (isPet ? 406 : 20);
    const width = Number.parseFloat(this.style.width) || (isPet ? 170 : 320);
    const height = Number.parseFloat(this.style.height) || (isPet ? 170 : this.id === 'settings' ? 285 : 80);
    return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height };
  }
}

function controlledCache(initialUrl) {
  const entries = new Map([[initialUrl, { promise: Promise.resolve({ src: initialUrl }) }]]);
  return {
    load(url) {
      if (!entries.has(url)) {
        let resolve;
        const promise = new Promise(done => { resolve = done; });
        entries.set(url, { promise, resolve, phase: 'downloading' });
      }
      return entries.get(url).promise;
    },
    warm() {},
    downloaded(url) {
      const entry = entries.get(url);
      assert.ok(entry?.resolve, `sprite must have been requested: ${url}`);
      entry.phase = 'decoding';
    },
    decoded(url) {
      const entry = entries.get(url);
      assert.ok(entry?.resolve, `sprite must have been requested: ${url}`);
      entry.phase = 'ready'; entry.resolve({ src: url });
    },
    fail(url) {
      const entry = entries.get(url);
      assert.ok(entry?.resolve, `sprite must have been requested: ${url}`);
      entries.delete(url); entry.resolve(null);
    },
  };
}

async function harness() {
  const clock = new Clock(), cache = controlledCache(sprite(7));
  const ids = ['pet', 'pet-wrap', 'desktop', 'notices', 'notice-list', 'notice-heading', 'settings', 'dialogue', 'fallback', 'running', 'close-settings', 'toggle-sign', 'toggle-mobamas', 'outfits', 'backgrounds', 'character-search', 'character-select', 'character-status'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  for (const id of ['notices', 'settings', 'dialogue', 'fallback', 'running']) nodes[id].hidden = true;
  let preferences = { cardIndex: 7, petitIndex: 0, bg: assets.CARDS[23].url, showSign: true, showMobamas: false };
  let stateListener;
  const updates = [];
  const packet = () => ({ preferences: { ...preferences }, notices: { persistent: [], transient: null, queuedCount: 0 }, runningCount: 0, flipSequence: 0, newlyShown: [] });
  const api = {
    onState(listener) { stateListener = listener; }, onLayout() {}, ready: async () => packet(),
    setPreferences(value) { preferences = plain(value); updates.push({ at: clock.now, preferences }); stateListener(packet()); },
    setRegions() {}, shown() {}, drag() {}, openSession() {},
  };
  const sandbox = {
    __assets: characters, __cache: cache,
    window: { yukimiDesktop: api, addEventListener() {} },
    document: { getElementById: id => nodes[id], createElement: () => new Element(), addEventListener() {} },
    innerWidth: 360, innerHeight: 600, getComputedStyle: () => ({ transform: 'none' }),
    DOMMatrixReadOnly: class { m11 = 1; },
    setTimeout: (callback, delay = 0) => clock.schedule(callback, delay), clearTimeout: id => clock.clear(id),
    setInterval: (callback, delay) => clock.schedule(callback, delay, delay), clearInterval: id => clock.clear(id),
    requestAnimationFrame: callback => clock.schedule(() => callback(clock.now), 16), cancelAnimationFrame: id => clock.clear(id),
  };
  await vm.runInNewContext(`(async () => { const { CHARACTER_LIST, DEFAULT_APPEARANCE, getCharacter, normalizeAppearance, spriteUrl, PLACEHOLDER } = __assets; const createSpriteCache = () => __cache;\n${source}\n})()`, sandbox, { filename: 'desktop/renderer.js' });
  await flush();
  assert.equal(nodes.pet.src, sprite(7), 'the initial decoded sprite must be visible');
  return {
    clock, cache, nodes, updates,
    get preferences() { return preferences; },
    async doubleClick() {
      nodes.pet.dispatch('pointerdown'); nodes.pet.dispatch('pointerup');
      await clock.advance(100);
      nodes.pet.dispatch('pointerdown'); nodes.pet.dispatch('pointerup');
      await flush();
    },
    select(cardIndex) { nodes.outfits.children[cardIndex].dispatch('click'); },
    state(patch) { preferences = { ...preferences, ...patch }; stateListener(packet()); },
  };
}

test('switching character waits for decode and rebuilds only the selected wardrobe', async () => {
  const h = await harness();
  const next = characters.normalizeAppearance({ characterId: 'arisu' });
  const target = characters.spriteUrl(next);
  h.nodes['character-select'].value = 'arisu'; h.nodes['character-select'].dispatch('change');
  await flush();
  assert.equal(h.nodes.pet.src, sprite(7));
  assert.equal(h.updates.length, 0);
  h.cache.decoded(target); await flush();
  assert.equal(h.preferences.characterId, 'arisu');
  assert.equal(h.nodes.pet.src, target);
  assert.equal(h.nodes.outfits.children.length, 14);
  assert.equal(h.nodes.backgrounds.children.length, 28);
  assert.equal(h.preferences.bg, next.bg);
  h.nodes['character-select'].value = 'yukimi'; h.nodes['character-select'].dispatch('change');
  await flush();
  assert.equal(h.preferences.characterId, 'yukimi');
  assert.equal(h.nodes.outfits.children.length, 13);
});

test('failed and superseded character loads never replace the current pet', async () => {
  const h = await harness(), target = characters.spriteUrl(characters.normalizeAppearance({ characterId: 'arisu' }));
  h.nodes['character-select'].value = 'arisu'; h.nodes['character-select'].dispatch('change');
  h.cache.fail(target); await flush();
  assert.equal(h.nodes.pet.src, sprite(7)); assert.equal(h.updates.length, 0);
  h.nodes['character-select'].value = 'arisu'; h.nodes['character-select'].dispatch('change');
  h.nodes['character-select'].value = 'yukimi'; h.nodes['character-select'].dispatch('change');
  await flush(); h.cache.decoded(target); await flush();
  assert.equal(h.preferences.characterId, 'yukimi'); assert.equal(h.nodes.pet.src, sprite(7));
});

test('a delayed flip cannot carry an outfit into a different character', async () => {
  const h = await harness();
  await h.doubleClick();
  h.state({ characterId: 'arisu', cardIndex: 0, petitIndex: 0 });
  h.cache.decoded(sprite(8)); await flush(); await h.clock.advance(600);
  assert.equal(h.preferences.characterId, 'arisu'); assert.equal(h.preferences.cardIndex, 0);
  assert.equal(h.updates.length, 0);
});

test('the first double click keeps the old sprite and outfit until download and decode finish', async () => {
  const h = await harness(), target = sprite(8);
  await h.doubleClick();
  await h.clock.advance(1200);
  assert.equal(h.nodes.pet.src, sprite(7));
  assert.equal(h.nodes.pet.classList.contains('flipping'), false, 'an unloaded target must not start the animation');
  assert.deepEqual(h.updates, []);
  h.cache.downloaded(target);
  await h.clock.advance(1200);
  assert.equal(h.nodes.pet.src, sprite(7), 'download completion alone must not replace the visible sprite');
  assert.equal(h.nodes.pet.classList.contains('flipping'), false);
  assert.deepEqual(h.updates, []);
  const readyAt = h.clock.now;
  h.cache.decoded(target); await flush();
  assert.equal(h.nodes.pet.classList.contains('flipping'), true);
  assert.equal(h.nodes.pet.src, sprite(7));
  await h.clock.advance(249);
  assert.deepEqual(h.updates, []);
  await h.clock.advance(1);
  assert.equal(h.updates.length, 1);
  assert.equal(h.updates[0].at, readyAt + 250, 'the new outfit commits at the midpoint of the ready animation');
  assert.equal(h.preferences.cardIndex, 8);
  assert.equal(h.preferences.petitIndex, 0);
  assert.equal(h.nodes.pet.src, target);
  await h.clock.advance(290);
  assert.equal(h.nodes.pet.classList.contains('flipping'), false);
});

test('a failed double-click target still flips once while retaining the visible sprite and preferences', async () => {
  const h = await harness();
  await h.doubleClick();
  h.cache.fail(sprite(8)); await flush();
  assert.equal(h.nodes.pet.classList.contains('flipping'), true);
  await h.clock.advance(540);
  assert.equal(h.nodes.pet.classList.contains('flipping'), false);
  assert.equal(h.nodes.pet.src, sprite(7));
  assert.equal(h.nodes.fallback.hidden, true);
  assert.equal(h.preferences.cardIndex, 7);
  assert.deepEqual(h.updates, []);
});

test('a failed settings selection leaves the prior sprite and preference active', async () => {
  const h = await harness();
  h.select(1);
  await h.clock.advance(500);
  assert.equal(h.nodes.pet.src, sprite(7));
  assert.deepEqual(h.updates, []);
  h.cache.fail(sprite(1)); await flush();
  assert.equal(h.nodes.pet.src, sprite(7));
  assert.equal(h.preferences.cardIndex, 7);
  assert.deepEqual(h.updates, []);
});

for (const earlierReadyFirst of [true, false]) {
  test(`the latest settings choice wins when the ${earlierReadyFirst ? 'earlier' : 'later'} download resolves first`, async () => {
    const h = await harness();
    h.select(1); h.select(2);
    assert.equal(h.nodes.pet.src, sprite(7));
    assert.deepEqual(h.updates, []);
    h.cache.decoded(sprite(earlierReadyFirst ? 1 : 2)); await flush();
    assert.equal(h.nodes.pet.src, sprite(earlierReadyFirst ? 7 : 2));
    assert.equal(h.updates.length, earlierReadyFirst ? 0 : 1);
    h.cache.decoded(sprite(earlierReadyFirst ? 2 : 1)); await flush();
    assert.equal(h.nodes.pet.src, sprite(2));
    assert.equal(h.preferences.cardIndex, 2);
    assert.deepEqual(h.updates.map(update => update.preferences.cardIndex), [2]);
  });
}

test('a newer settings choice cancels the outfit commit of a double click still loading', async () => {
  const h = await harness();
  await h.doubleClick();
  h.select(2);
  h.cache.decoded(sprite(8)); await flush();
  await h.clock.advance(540);
  assert.equal(h.nodes.pet.src, sprite(7));
  assert.deepEqual(h.updates, [], 'the older double click must not submit its outfit after a newer selection');
  h.cache.decoded(sprite(2)); await flush();
  assert.equal(h.nodes.pet.src, sprite(2));
  assert.deepEqual(h.updates.map(update => update.preferences.cardIndex), [2]);
});

test('late sprite readiness from an earlier host preference cannot overwrite the latest host state', async () => {
  const h = await harness();
  h.state({ cardIndex: 1 }); h.state({ cardIndex: 2 });
  assert.equal(h.nodes.pet.src, sprite(7));
  h.cache.decoded(sprite(2)); await flush();
  assert.equal(h.nodes.pet.src, sprite(2));
  h.cache.decoded(sprite(1)); await flush();
  assert.equal(h.nodes.pet.src, sprite(2));
  assert.equal(h.preferences.cardIndex, 2);
  assert.deepEqual(h.updates, []);
});

test('a settings selection waiting for decode cannot overwrite a newer host outfit and pose', async () => {
  const h = await harness();
  h.select(1);
  h.state({ cardIndex: 3, petitIndex: 2 });
  h.cache.decoded(sprite(3, 2)); await flush();
  assert.equal(h.nodes.pet.src, sprite(3, 2));
  h.cache.decoded(sprite(1)); await flush();
  assert.equal(h.nodes.pet.src, sprite(3, 2));
  assert.equal(h.preferences.cardIndex, 3);
  assert.equal(h.preferences.petitIndex, 2);
  assert.deepEqual(h.updates, [], 'a superseded settings callback must not submit stale preferences');
});

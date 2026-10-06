import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createSpriteCache } from '../desktop/sprite-cache.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

function fakeCache(t, { decode = true, ...options } = {}) {
  const images = [];
  class FakeImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.decodeCalls = 0;
      if (decode) {
        const decoded = new Promise((resolve, reject) => { this.finishDecode = resolve; this.failDecode = reject; });
        this.decode = () => { this.decodeCalls++; return decoded; };
      }
    }
    set src(value) { this.url = value; }
    loaded() { this.onload?.(); }
    failed() { this.onerror?.(); }
  }
  const cache = createSpriteCache({ ...options, createImage: () => { const image = new FakeImage(); images.push(image); return image; } });
  // Background promises always resolve. Finish any remaining fake requests so
  // each test leaves neither queued work nor a real timeout running.
  t.after(() => { for (const image of images) image.failed(); });
  return { cache, images };
}

test('load waits for onload and decoding before releasing its concurrency slot', async t => {
  const { cache, images } = fakeCache(t, { concurrency: 1 });
  let settled = false;
  const first = cache.load('first.png').then(image => { settled = true; return image; });
  cache.warm(['second.png']);
  assert.equal(images.length, 1);
  images[0].loaded();
  images[0].loaded();
  await tick();
  assert.equal(images[0].decodeCalls, 1);
  assert.equal(settled, false);
  assert.equal(images.length, 1);
  images[0].finishDecode();
  assert.equal(await first, images[0]);
  assert.equal(images.length, 2);
});

test('same URL shares its pending promise and reuses the already decoded Image', async t => {
  const { cache, images } = fakeCache(t);
  cache.warm(['same.png', 'same.png']);
  const first = cache.load('same.png'), second = cache.load('same.png');
  assert.equal(first, second);
  assert.equal(images.length, 1);
  images[0].loaded();
  await tick();
  images[0].finishDecode();
  const image = await first;
  assert.equal(await cache.load('same.png'), image);
  cache.warm(['same.png']);
  assert.equal(images.length, 1);
  assert.equal(images[0].decodeCalls, 1);
});

test('warm limits parallel work and explicit loads promote queued sprites ahead of background work', async t => {
  const { cache, images } = fakeCache(t, { concurrency: 2, decode: false });
  cache.warm(['a.png', 'b.png', 'c.png', 'd.png', 'e.png']);
  assert.deepEqual(images.map(image => image.url), ['a.png', 'b.png']);
  const promoted = cache.load('e.png'), foreground = cache.load('priority.png');
  images[0].loaded();
  await tick();
  assert.deepEqual(images.map(image => image.url), ['a.png', 'b.png', 'e.png']);
  images[1].loaded();
  await tick();
  assert.equal(images[3].url, 'priority.png');
  images[2].loaded(); images[3].loaded();
  assert.equal(await promoted, images[2]);
  assert.equal(await foreground, images[3]);
  assert.deepEqual(images.map(image => image.url), ['a.png', 'b.png', 'e.png', 'priority.png', 'c.png', 'd.png']);
});

test('network and decode failures resolve null and allow later explicit retry', async t => {
  const { cache, images } = fakeCache(t);
  const network = cache.load('retry.png');
  images[0].failed();
  assert.equal(await network, null);
  const decoding = cache.load('retry.png');
  assert.equal(images.length, 2);
  images[1].loaded();
  await tick();
  images[1].failDecode(new Error('Bad pixels'));
  assert.equal(await decoding, null);
  const retried = cache.load('retry.png');
  images[2].loaded();
  await tick();
  images[2].finishDecode();
  assert.equal(await retried, images[2]);
});

test('a decode timeout clears the entry, drains queued work, and late completion cannot consume another slot', async t => {
  const { cache, images } = fakeCache(t, { concurrency: 1, timeout: 100 });
  const first = cache.load('slow.png');
  const lateLoad = images[0].onload, lateError = images[0].onerror;
  images[0].loaded();
  await tick();
  cache.warm(['next.png', 'last.png']);
  assert.equal(await first, null);
  assert.equal(images[0].onload, null);
  assert.equal(images[0].onerror, null);
  assert.equal(images.length, 2);
  lateLoad(); lateError(); images[0].finishDecode();
  await tick();
  assert.equal(images.length, 2, 'late callbacks must not release the active next request');
  const retried = cache.load('slow.png');
  images[1].loaded();
  await tick();
  images[1].finishDecode();
  await tick();
  assert.equal(images[2].url, 'slow.png', 'explicit retry has priority over remaining warm work');
  images[2].loaded();
  await tick();
  images[2].finishDecode();
  assert.equal(await retried, images[2]);
  assert.equal(images[3].url, 'last.png');
});

test('warm failures, missing decode, and a throwing image factory do not reject promises', async t => {
  const { cache, images } = fakeCache(t, { decode: false });
  cache.warm(['broken.png']);
  images[0].failed();
  await tick();
  const image = cache.load('legacy.png');
  images[1].loaded();
  assert.equal(await image, images[1]);
  let attempts = 0;
  const throwing = createSpriteCache({ createImage() { attempts++; throw new Error('Image unavailable'); }, concurrency: 1 });
  throwing.warm(['one.png', 'two.png']);
  assert.equal(await throwing.load('one.png'), null);
  assert.equal(attempts, 3);
  assert.equal(await cache.load(''), null);
  assert.equal(await cache.load(null), null);
  await delay(0);
});

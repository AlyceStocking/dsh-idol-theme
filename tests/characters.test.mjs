import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, CHARACTER_LIST, matchesCharacter, DEFAULT_APPEARANCE, normalizeAppearance, appearancePatch, savedAppearance, restoreAppearance, spriteUrl, allowedImageUrls, PLACEHOLDER, clickLine, clickLines, createLinePicker, visualOf, scenesOf, sceneText } from '../lib/characters.js';
import { readFileSync } from 'node:fs';
import { normalizePreferences, validateHostMessage } from '../desktop/logic.js';
import { DesktopState } from '../lib/desktop-state.js';

test('the catalog covers precisely the approved roster and marks unavailable entries explicitly', () => {
  const { roster } = JSON.parse(readFileSync(new URL('../research/roster/index.json', import.meta.url), 'utf8'));
  assert.equal(roster.length, 190);
  assert.equal(CHARACTER_LIST.length, 190);
  assert.deepEqual(new Set(CHARACTER_LIST.map(character => character.name)), new Set(roster.map(character => character.page)));
  assert.equal(new Set(CHARACTER_LIST.map(character => character.id)).size, 190);
  for (const character of CHARACTER_LIST) {
    assert.equal(Object.hasOwn(CHARACTERS, character.id), character.available);
    if (!character.available) assert.deepEqual(normalizeAppearance({ characterId: character.id }), DEFAULT_APPEARANCE);
  }
  assert.equal(matchesCharacter(CHARACTERS.arisu, 'Tachibana Arisu'), true);
  assert.equal(matchesCharacter(CHARACTERS.arisu, 'Arisu Tachibana'), true);
  assert.equal(matchesCharacter(CHARACTERS.arisu, '橘'), true);
  assert.equal(matchesCharacter(CHARACTERS.arisu, 'yukimi'), false);
});

test('every available character switches and persists independently of the previous wardrobe', () => {
  let previous = DEFAULT_APPEARANCE;
  for (const character of Object.values(CHARACTERS)) {
    const next = normalizeAppearance({ characterId: character.id }, previous);
    assert.equal(next.bg, character.defaults.bg);
    assert.ok(character.PETITS[next.cardIndex][next.petitIndex]);
    assert.deepEqual(restoreAppearance(savedAppearance(next)), next);
    const last = normalizeAppearance({ cardIndex: character.PETITS.length - 1, petitIndex: 3 }, next);
    assert.deepEqual(restoreAppearance(savedAppearance(last)), last);
    previous = last;
  }
});

test('character changes atomically replace outfit and background, preserving toggles', () => {
  const next = normalizeAppearance({ characterId: 'arisu' }, { ...DEFAULT_APPEARANCE, showSign: false });
  assert.equal(next.cardIndex, 0);
  assert.equal(next.bg, CHARACTERS.arisu.defaults.bg);
  assert.equal(next.showSign, false);
  assert.deepEqual(normalizePreferences(next), next);
  assert.deepEqual(validateHostMessage({ type: 'preferences', preferences: next }).preferences, next);
  const state = new DesktopState(); state.updatePreferences(next);
  assert.deepEqual(state.preferences, next);
  assert.equal(appearancePatch({ characterId: 'arisu' }).bg, next.bg);
  assert.equal(normalizeAppearance({ characterId: 'yukimi' }, next).bg, DEFAULT_APPEARANCE.bg);
});

test('each catalog is complete and cross-character or arbitrary URLs are rejected', () => {
  const urls = allowedImageUrls();
  for (const character of Object.values(CHARACTERS)) {
    assert.equal(character.ICONS.length, character.PETITS.length);
    assert.equal(new Set(character.outfitIds).size, character.PETITS.length);
    for (let cardIndex = 0; cardIndex < character.PETITS.length; cardIndex++) {
      assert.equal(character.PETITS[cardIndex].length, 4);
      for (let petitIndex = 0; petitIndex < 4; petitIndex++) assert.ok(urls.has(spriteUrl({ characterId: character.id, cardIndex, petitIndex })));
    }
  }
  assert.deepEqual(normalizeAppearance({ characterId: 'unknown', showSign: false }), DEFAULT_APPEARANCE);
  const arisu = normalizeAppearance({ characterId: 'arisu', cardIndex: 13, petitIndex: 3, bg: DEFAULT_APPEARANCE.bg });
  assert.equal(arisu.cardIndex, 13); assert.equal(arisu.petitIndex, 3);
  assert.equal(arisu.bg, CHARACTERS.arisu.defaults.bg);
  assert.equal(normalizeAppearance({ bg: 'https://example.com/a' }, arisu).bg, arisu.bg);
});

test('tap lines follow the current outfit, then the character, then the placeholder', () => {
  assert.ok(clickLines('yukimi').length >= 10, 'Yukimi common dialogue should be collected');
  for (const character of Object.values(CHARACTERS)) {
    const outfit = character.outfitIds[0];
    const line = clickLine(character, outfit, () => 0);
    assert.equal(typeof line, 'string');
    assert.ok(line.length > 1);
    assert.doesNotMatch(line, /\{\{|\[\[|<[a-z/]/i, line);
    assert.ok(!line.includes('(家具名)'));
    for (const collected of [...clickLines(character.id), ...clickLines(character.id, outfit)]) assert.ok(collected.length <= 400, collected);
  }
  assert.deepEqual(clickLines('unknown'), []);
  assert.deepEqual(clickLines('unknown', '1'), []);
  assert.equal(clickLine({ id: 'unknown' }, '1'), PLACEHOLDER);
});

test('each character exposes the wiki impression colour plus its own stickers', () => {
  let coloured = 0;
  for (const character of Object.values(CHARACTERS)) {
    const visual = visualOf(character.id);
    if (!visual.accent) continue;
    coloured += 1;
    assert.match(visual.accent, /^#[0-9a-f]{6}$/);
    assert.match(visual.accentDark, /^#[0-9a-f]{6}$/);
    for (const key of ['stamp', 'anim']) if (visual[key]) assert.match(visual[key], /^https:\/\/patchwiki\.biligame\.com\/images\/imascg\//);
  }
  assert.ok(coloured >= 180, 'impression colours are collected for ' + coloured + ' characters');
  assert.equal(visualOf('yukimi').accent, '#171c8f');
  assert.deepEqual(visualOf('unknown'), {});
});

test('every character carries the nineteen wiki scenes used by notices', () => {
  const required = ['morning', 'noon', 'night', 'stamina', 'story', 'colleague', 'event', 'idle', 'treadmill', 'pushBusiness'];
  for (const character of Object.values(CHARACTERS)) {
    const scenes = scenesOf(character.id);
    for (const key of required) assert.ok(scenes[key], character.name + ' ' + key);
    assert.equal(sceneText(character.id, 'pushBusiness'), scenes.pushBusiness);
  }
  assert.deepEqual(scenesOf('unknown'), {});
  assert.equal(sceneText('unknown', 'idle'), '');
});

test('the click picker draws a shuffled bag without repeating a line twice in a cycle', () => {
  let seed = 20261018;
  const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const picker = createLinePicker(random);
  const character = CHARACTERS.yukimi, outfit = character.outfitIds[0];
  const pool = clickLines(character.id, outfit);
  assert.ok(pool.length >= 3);
  const order = () => Array.from({ length: pool.length }, () => picker(character, outfit));
  const first = order(), second = order(), third = order();
  for (const cycle of [first, second, third]) {
    assert.equal(new Set(cycle).size, pool.length, 'every line appears once per cycle');
    assert.deepEqual([...cycle].sort(), [...pool].sort(), 'a cycle covers the whole pool');
  }
  assert.notEqual(second[0], first.at(-1), 'a refill never opens with the previous line');
  assert.notEqual(third[0], second.at(-1), 'a refill never opens with the previous line');
  assert.ok(new Set([first.join(), second.join(), third.join()]).size > 1, 'cycles are not the same order');
});

test('the click picker keeps pools apart and falls back to the placeholder', () => {
  const picker = createLinePicker(() => 0.5);
  const character = CHARACTERS.yukimi;
  const first = character.outfitIds[0], last = character.outfitIds.at(-1);
  assert.ok(clickLines(character.id, first).includes(picker(character, first)));
  assert.ok(clickLines(character.id, last).includes(picker(character, last)));
  assert.equal(picker({ id: 'unknown' }, '1'), PLACEHOLDER);
});

test('saved stable identities round-trip and missing identities fall back safely', () => {
  const appearance = normalizeAppearance({ characterId: 'arisu', cardIndex: 13, petitIndex: 3 });
  assert.deepEqual(restoreAppearance(savedAppearance(appearance)), appearance);
  assert.equal(restoreAppearance({ cardIndex: 3 }).characterId, 'yukimi');
  const saved = savedAppearance(appearance);
  saved.cardIndex = 2; saved.bg = 'https://example.com/old';
  assert.deepEqual(restoreAppearance(saved), appearance);
  saved.outfitId = 'removed'; saved.backgroundId = 'removed';
  assert.equal(restoreAppearance(saved).cardIndex, 0);
  assert.equal(restoreAppearance(saved).bg, CHARACTERS.arisu.defaults.bg);
});
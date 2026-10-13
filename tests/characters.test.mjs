import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, DEFAULT_APPEARANCE, normalizeAppearance, appearancePatch, savedAppearance, restoreAppearance, spriteUrl, allowedImageUrls } from '../lib/characters.js';
import { normalizePreferences, validateHostMessage } from '../desktop/logic.js';
import { DesktopState } from '../lib/desktop-state.js';

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

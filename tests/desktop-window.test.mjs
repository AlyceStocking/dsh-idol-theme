import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../lib/assets.js';
import { NoticeQueue, clampWindowBounds, normalizePreferences, pointHitsRegions, validateHostMessage, validateRectangles } from '../desktop/logic.js';

const notice = (id, kind = 'completed', sessionId = `session-${id}`) => ({ id, kind, sessionId, title: '测试会话', text: '这一轮……做好了……', persistent: ['question', 'approval'].includes(kind) });

test('pending questions and approvals stay visible; completions wait and each trigger once', () => {
  const queue = new NoticeQueue({ duration: 5000 });
  const question = notice('question', 'question'), approval = notice('approval', 'approval'), completed = notice('completed');
  let snapshot = queue.update([question, approval, completed], 0);
  assert.deepEqual(snapshot.persistent.map(item => item.id), ['question', 'approval']);
  assert.deepEqual(snapshot.newlyShown, ['question', 'approval']);
  assert.equal(snapshot.transient, null);
  assert.equal(snapshot.queuedCount, 1);
  snapshot = queue.update([question, approval, completed], 10000);
  assert.deepEqual(snapshot.newlyShown, []);
  assert.equal(snapshot.persistent.length, 2);
  snapshot = queue.update([], 11000);
  assert.equal(snapshot.transient.id, 'completed');
  assert.deepEqual(snapshot.newlyShown, ['completed']);
  assert.equal(queue.update([], 12000).transient.id, 'completed', 'host acknowledgement removal must not dismiss an active completion');
  assert.equal(queue.advance(16000).transient, null);
  assert.equal(queue.update([completed], 17000).transient, null, 'already displayed completion must not replay');
});

test('completion bubbles pause for new questions and resume for their remaining lifetime', () => {
  const queue = new NoticeQueue({ duration: 5000 });
  assert.equal(queue.update([notice('one'), notice('two')], 0).transient.id, 'one');
  let snapshot = queue.update([notice('question', 'question')], 2000);
  assert.equal(snapshot.transient, null);
  assert.equal(snapshot.queuedCount, 2);
  snapshot = queue.update([], 12000);
  assert.equal(snapshot.transient.id, 'one');
  assert.deepEqual(snapshot.newlyShown, []);
  snapshot = queue.advance(15000);
  assert.equal(snapshot.transient.id, 'two');
  assert.deepEqual(snapshot.newlyShown, ['two']);
});

test('multiple session requests remain independently addressable and only disappear with host state', () => {
  const queue = new NoticeQueue({ shownIds: ['q-1'] });
  let snapshot = queue.update([notice('q-1', 'question', 'session-a'), notice('q-2', 'question', 'session-b')], 0);
  assert.deepEqual(snapshot.persistent.map(item => item.sessionId), ['session-a', 'session-b']);
  assert.deepEqual(snapshot.newlyShown, ['q-2']);
  snapshot = queue.update([notice('q-2', 'question', 'session-b')], 20000);
  assert.deepEqual(snapshot.persistent.map(item => item.id), ['q-2']);
  assert.deepEqual(snapshot.newlyShown, []);
});

test('protocol rejects malformed state and duplicate IDs; pending kinds are always persistent', () => {
  assert.equal(validateHostMessage({ type: 'state', notices: [notice('one')], runningCount: -1 }), null);
  assert.equal(validateHostMessage({ type: 'state', notices: [notice('one'), notice('one')], runningCount: 0 }), null);
  assert.equal(validateHostMessage({ type: 'state', notices: [{ ...notice('one'), sessionId: '' }], runningCount: 0 }), null);
  assert.equal(validateHostMessage({ type: 'state', notices: [{ ...notice('one'), sessionId: 'session\nb' }], runningCount: 0 }), null);
  assert.equal(validateHostMessage({ type: 'state', notices: [{ ...notice('one'), kind: 'script' }], runningCount: 0 }), null);
  const pending = { ...notice('one', 'question'), persistent: false };
  assert.equal(validateHostMessage({ type: 'state', notices: [pending], runningCount: 2 }).notices[0].persistent, true);
});

test('preferences accept only bundled asset URLs and existing sprite indices', () => {
  const preferences = normalizePreferences({ cardIndex: 999, petitIndex: -1, bg: 'https://example.com/evil.png', showSign: 'yes', showMobamas: true, arbitrary: 'ignored' });
  assert.deepEqual(preferences, { cardIndex: 7, petitIndex: 0, bg: CARDS[23].url, showSign: true, showMobamas: true });
  assert.equal(normalizePreferences({ cardIndex: 1, petitIndex: 3, bg: CARDS[0].url }).bg, CARDS[0].url);
  assert.deepEqual(validateHostMessage({ type: 'preferences', preferences: { showMobamas: true, cardIndex: 999 } }).preferences, { showMobamas: true });
});

test('window stays inside the nearest available monitor including negative coordinates and tiny work areas', () => {
  const displays = [{ workArea: { x: -1920, y: 0, width: 1920, height: 1040 } }, { workArea: { x: 0, y: 0, width: 1920, height: 1040 } }];
  assert.deepEqual(clampWindowBounds({ x: -1900, y: 800, width: 360, height: 600 }, displays), { x: -1900, y: 440, width: 360, height: 600 });
  assert.deepEqual(clampWindowBounds({ x: -1900, y: 800, width: 360, height: 600 }, displays.slice(1)), { x: 0, y: 440, width: 360, height: 600 });
  assert.deepEqual(clampWindowBounds({ x: 500, y: 500, width: 360, height: 600 }, [{ x: 0, y: 0, width: 320, height: 400 }]), { x: 0, y: 0, width: 320, height: 400 });
});

test('transparent sprite pixels and empty window regions pass through while bubbles are clickable', () => {
  const regions = [{ x: 0, y: 0, width: 20, height: 20, sprite: true }, { x: 40, y: 0, width: 20, height: 20 }];
  const mask = { width: 2, height: 2, alpha: new Uint8Array([0, 255, 255, 0]) };
  assert.equal(pointHitsRegions({ x: 1, y: 1 }, regions, mask), false);
  assert.equal(pointHitsRegions({ x: 11, y: 1 }, regions, mask), true);
  assert.equal(pointHitsRegions({ x: 30, y: 1 }, regions, mask), false);
  assert.equal(pointHitsRegions({ x: 41, y: 1 }, regions, mask), true);
  assert.equal(validateRectangles([{ x: -100, y: 0, width: 20, height: 20 }]), null);
  assert.equal(validateRectangles([{ x: 0, y: 0, width: Infinity, height: 20 }]), null);
  assert.equal(validateRectangles(regions).length, 2);
});

test('flip back faces mirror the alpha mask within the projected image bounds', () => {
  const mask = { width: 2, height: 2, alpha: new Uint8Array([0, 255, 255, 0]) };
  const regions = validateRectangles([{ x: 10, y: 10, width: 10, height: 20, sprite: true, mirrored: true }]);
  assert.equal(pointHitsRegions({ x: 11, y: 11 }, regions, mask), true);
  assert.equal(pointHitsRegions({ x: 18, y: 11 }, regions, mask), false);
  assert.equal(pointHitsRegions({ x: 11, y: 25 }, regions, mask), false);
  assert.equal(pointHitsRegions({ x: 18, y: 25 }, regions, mask), true);
  assert.equal(validateRectangles([{ x: 0, y: 0, width: 20, height: 20, sprite: true, mirrored: 'yes' }]), null);
});

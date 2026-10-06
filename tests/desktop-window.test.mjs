import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../lib/assets.js';
import { NoticeQueue, clampWindowBounds, layoutDesktop, normalizePreferences, petPositionFromWindowBounds, pointHitsRegions, validateHostMessage, validateRectangles } from '../desktop/logic.js';

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

function assertContained(rect, area, message = 'rectangle must remain on its monitor') {
  assert.ok(rect.x >= area.x && rect.y >= area.y && rect.x + rect.width <= area.x + area.width && rect.y + rect.height <= area.y + area.height, message);
}

function assertDesktopLayout(layout, area) {
  assertContained(layout.bounds, area, 'the transparent carrier must keep panels on screen');
  assertContained(layout.pet, { x: 0, y: 0, width: layout.bounds.width, height: layout.bounds.height }, 'the pet must fit in the carrier');
  assert.equal(layout.bounds.x + layout.pet.x, layout.position.x);
  assert.equal(layout.bounds.y + layout.pet.y, layout.position.y);
  assert.equal(layout.pet.width, layout.pet.height, 'tiny monitors must preserve the square sprite aspect ratio');
  for (const value of Object.values(layout.bounds)) assert.ok(Number.isFinite(value));
}

const fullHd = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 };

test('the pet reaches all four screen corners independently of carrier margins', () => {
  for (const [wanted, expected] of [
    [{ x: -200, y: -200 }, { x: 0, y: 0 }],
    [{ x: 2500, y: -200 }, { x: 1750, y: 0 }],
    [{ x: -200, y: 1600 }, { x: 0, y: 910 }],
    [{ x: 2500, y: 1600 }, { x: 1750, y: 910 }],
  ]) {
    const layout = layoutDesktop(wanted, [fullHd]);
    assert.deepEqual(layout.position, expected);
    assertDesktopLayout(layout, fullHd.bounds);
    assert.deepEqual({ width: layout.pet.width, height: layout.pet.height }, { width: 170, height: 170 });
  }
});

test('the pet reaches every screen edge without inheriting the 360 by 600 carrier limit', () => {
  for (const [wanted, expected] of [
    [{ x: -100, y: 400 }, { x: 0, y: 400 }],
    [{ x: 2300, y: 400 }, { x: 1750, y: 400 }],
    [{ x: 800, y: -100 }, { x: 800, y: 0 }],
    [{ x: 800, y: 1700 }, { x: 800, y: 910 }],
  ]) {
    const layout = layoutDesktop(wanted, [fullHd]);
    assert.deepEqual(layout.position, expected);
    assertDesktopLayout(layout, fullHd.bounds);
  }
});

test('carrier relocation keeps a requested interior pet position unchanged', () => {
  for (const position of [{ x: 800, y: 10 }, { x: 800, y: 440 }, { x: 800, y: 850 }]) {
    const layout = layoutDesktop(position, [fullHd]);
    assert.deepEqual(layout.position, position);
    assertDesktopLayout(layout, fullHd.bounds);
  }
});

test('negative and vertically arranged monitors use their screen coordinates', () => {
  const left = { bounds: { x: -1600, y: 0, width: 1600, height: 900 }, workArea: { x: -1600, y: 0, width: 1600, height: 860 }, scaleFactor: 1.25 };
  const above = { bounds: { x: 0, y: -1200, width: 1080, height: 1200 }, workArea: { x: 0, y: -1200, width: 1080, height: 1160 }, scaleFactor: 1.5 };
  for (const [position, expectedArea] of [[{ x: -1450, y: 150 }, left.bounds], [{ x: 300, y: -1100 }, above.bounds]]) {
    const layout = layoutDesktop(position, [fullHd, left, above]);
    assert.deepEqual(layout.position, position);
    assertDesktopLayout(layout, expectedArea);
  }
});

test('a detached monitor recovers the pet onto the nearest remaining screen', () => {
  const layout = layoutDesktop({ x: -1400, y: 300 }, [fullHd]);
  assert.deepEqual(layout.position, { x: 0, y: 300 });
  assertDesktopLayout(layout, fullHd.bounds);
});

test('tiny monitors resize the square pet while retaining movement in the longer dimension', () => {
  const tiny = { bounds: { x: 50, y: 20, width: 80, height: 120 }, workArea: { x: 50, y: 20, width: 80, height: 110 } };
  const layout = layoutDesktop({ x: 1000, y: 1000 }, [tiny]);
  assert.deepEqual(layout.position, { x: 50, y: 60 });
  assert.deepEqual({ width: layout.pet.width, height: layout.pet.height }, { width: 80, height: 80 });
  assertDesktopLayout(layout, tiny.bounds);
});

test('old carrier coordinates migrate to the visible pet coordinates including negative origins', () => {
  assert.deepEqual(petPositionFromWindowBounds({ x: 100, y: 50, width: 360, height: 600 }), { x: 195, y: 456 });
  assert.deepEqual(petPositionFromWindowBounds({ x: -1300, y: -500, width: 360, height: 600 }), { x: -1205, y: -94 });
  assert.deepEqual(petPositionFromWindowBounds({ x: -1300, y: -500, width: 300, height: 450 }), { x: -1235, y: -244 });
});

test('desktop placement prioritizes full display bounds over an inset work area', () => {
  const display = { bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, workArea: { x: -1880, y: 40, width: 1880, height: 1000 } };
  const layout = layoutDesktop({ x: -1920, y: 910 }, [display]);
  assert.deepEqual(layout.position, { x: -1920, y: 910 });
  assertDesktopLayout(layout, display.bounds);
});

test('bounds-only, work-area-only, and plain display rectangles remain usable', () => {
  const area = { x: 20, y: 30, width: 500, height: 700 };
  for (const display of [{ bounds: area }, { workArea: area }, area]) {
    const layout = layoutDesktop({ x: 0, y: 0 }, [display]);
    assert.deepEqual(layout.position, { x: 20, y: 30 });
    assertDesktopLayout(layout, area);
  }
});

test('screen positions remain in DIP across different display scale factors', () => {
  const position = { x: 1350, y: 720 };
  const regular = layoutDesktop(position, [{ ...fullHd, scaleFactor: 1 }]);
  const scaled = layoutDesktop(position, [{ ...fullHd, scaleFactor: 1.75 }]);
  assert.deepEqual(scaled, regular, 'Electron already reports screen cursor and window bounds in DIP');
});

test('consecutive drag deltas stay anchored to the original pet even when its carrier is relocated', () => {
  const anchor = { x: 800, y: 600 };
  const first = layoutDesktop({ x: anchor.x - 790, y: anchor.y - 590 }, [fullHd]);
  const second = layoutDesktop({ x: anchor.x - 650, y: anchor.y - 440 }, [fullHd]);
  assert.deepEqual(first.position, { x: 10, y: 10 });
  assert.deepEqual(second.position, { x: 150, y: 160 });
  assert.equal(second.position.x - first.position.x, 140);
  assert.equal(second.position.y - first.position.y, 150);
  assertDesktopLayout(first, fullHd.bounds);
  assertDesktopLayout(second, fullHd.bounds);
  assert.deepEqual(layoutDesktop(second.position, [fullHd]), second, 'reflow must be idempotent after each drag step');
});

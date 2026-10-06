import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoticeLayer, NoticeQueue } from '../desktop/logic.js';

const notice = (id, kind = 'completed') => ({
  id, kind, sessionId: `session-${id}`, title: '测试会话', text: '雪美……在等你……',
  persistent: kind === 'question' || kind === 'approval',
});

function fixture({ duration = 5000, refreshInterval = 1000, shownIds = [] } = {}) {
  let time = 0;
  const calls = [], queue = new NoticeQueue({ duration, shownIds });
  const state = { destroyed: false, visible: true, alwaysOnTop: true, level: 'floating' };
  const window = {
    isDestroyed: () => state.destroyed,
    isVisible: () => state.visible,
    isAlwaysOnTop: () => state.alwaysOnTop,
    setAlwaysOnTop(value, level) {
      state.alwaysOnTop = value; state.level = level;
      calls.push({ method: 'setAlwaysOnTop', args: [value, level], at: time });
    },
    moveTop() { calls.push({ method: 'moveTop', at: time }); },
    showInactive() { state.visible = true; calls.push({ method: 'showInactive', at: time }); },
    focus() { assert.fail('notice layers must not focus the pet window'); },
    show() { assert.fail('restoring a notification must use showInactive instead of show'); },
  };
  const apply = createNoticeLayer(window, { now: () => time, refreshInterval });
  return {
    calls, state,
    count: method => calls.filter(call => call.method === method).length,
    levels: () => calls.filter(call => call.method === 'setAlwaysOnTop').map(call => call.args),
    publish(at, notices) {
      time = at;
      const snapshot = notices === undefined ? queue.advance(at) : queue.update(notices, at);
      apply(snapshot);
      return snapshot;
    },
  };
}

test('a completion lifts immediately and returns to the floating layer when its bubble expires', () => {
  const h = fixture();
  assert.equal(h.publish(0, [notice('done')]).transient.id, 'done');
  assert.deepEqual(h.levels(), [[true, 'pop-up-menu']]);
  assert.equal(h.count('moveTop'), 1);
  assert.equal(h.count('showInactive'), 0);
  assert.equal(h.publish(100, []).transient.id, 'done', 'host acknowledgement must not lower a bubble still displaying');
  assert.equal(h.state.level, 'pop-up-menu');
  assert.equal(h.publish(5000).transient, null);
  assert.deepEqual(h.levels().at(-1), [true, 'floating']);
  const callsAfterExpiry = h.calls.length;
  h.publish(10000, []);
  assert.equal(h.calls.length, callsAfterExpiry, 'an idle pet must not repeatedly raise itself');
});

test('questions and approvals keep their higher layer until the host removes the requests', () => {
  const h = fixture();
  const requests = [notice('question', 'question'), notice('approval', 'approval')];
  h.publish(0, requests);
  const snapshot = h.publish(60000, requests);
  assert.equal(snapshot.persistent.length, 2);
  assert.deepEqual(snapshot.newlyShown, []);
  assert.equal(h.state.level, 'pop-up-menu');
  assert.equal(h.count('moveTop'), 2, 'retained requests must periodically restore the layer');
  h.publish(60001, [requests[1]]);
  assert.equal(h.state.level, 'pop-up-menu', 'removing one request must not lower another pending bubble');
  h.publish(60002, []);
  assert.equal(h.state.level, 'floating');
});

test('queued completions lift as each becomes visible, after all waiting requests are removed', () => {
  const h = fixture();
  const waiting = notice('waiting', 'question');
  let snapshot = h.publish(0, [waiting, notice('one'), notice('two')]);
  assert.equal(snapshot.transient, null);
  assert.equal(snapshot.queuedCount, 2);
  assert.equal(h.count('moveTop'), 1);
  h.publish(150);
  assert.equal(h.count('moveTop'), 1, 'queued messages must not trigger additional lifts before they are shown');
  snapshot = h.publish(200, []);
  assert.equal(snapshot.transient.id, 'one');
  assert.deepEqual(snapshot.newlyShown, ['one']);
  assert.equal(h.count('moveTop'), 2, 'a new visible completion must bypass the refresh throttle');
  snapshot = h.publish(5200);
  assert.equal(snapshot.transient.id, 'two');
  assert.equal(h.count('moveTop'), 3);
  h.publish(10200);
  assert.equal(h.state.level, 'floating');
});

test('delivered completions do not replay a lift, while a restored pending request still needs one', () => {
  const h = fixture({ shownIds: ['done', 'waiting'] });
  const replay = h.publish(0, [notice('done')]);
  assert.equal(replay.transient, null);
  assert.deepEqual(replay.newlyShown, []);
  assert.equal(h.count('moveTop'), 0);
  assert.ok(h.levels().every(([, level]) => level === 'floating'));
  const restored = h.publish(100, [notice('waiting', 'question')]);
  assert.deepEqual(restored.newlyShown, []);
  assert.equal(restored.persistent.length, 1);
  assert.equal(h.state.level, 'pop-up-menu');
  assert.equal(h.count('moveTop'), 1, 'first visibility must lift even if its reminder was previously delivered');
});

test('retained notices throttle repeated raises, while each new request lifts immediately', () => {
  const h = fixture({ refreshInterval: 1000 });
  const waiting = notice('waiting', 'question');
  h.publish(0, [waiting]);
  for (const at of [150, 300, 450, 600, 750, 900, 999]) h.publish(at);
  assert.equal(h.count('moveTop'), 1);
  h.publish(1000);
  assert.equal(h.count('moveTop'), 2);
  h.publish(1001);
  assert.equal(h.count('moveTop'), 2);
  h.publish(1050, [waiting, notice('another', 'approval')]);
  assert.equal(h.count('moveTop'), 3, 'a new request must not wait for the next periodic raise');
  h.publish(1100);
  assert.equal(h.count('moveTop'), 3);
});

test('a hidden notification window restores without focus and without waiting for the throttle', () => {
  const h = fixture();
  h.state.visible = false;
  h.publish(0, [notice('waiting', 'question')]);
  assert.equal(h.count('showInactive'), 1);
  assert.equal(h.state.visible, true);
  assert.equal(h.state.level, 'pop-up-menu');
  h.state.visible = false;
  h.publish(150);
  assert.equal(h.count('showInactive'), 2);
  assert.equal(h.count('moveTop'), 2, 'hiding the window must force immediate layer restoration');
});

test('lost always-on-top state and a backwards clock both force immediate restoration', () => {
  const h = fixture({ refreshInterval: 1000 });
  h.publish(1000, [notice('waiting', 'question')]);
  h.state.alwaysOnTop = false;
  h.publish(1100);
  assert.equal(h.state.alwaysOnTop, true);
  assert.equal(h.count('moveTop'), 2, 'lost topmost state must recover before the periodic interval');
  h.publish(1050);
  assert.equal(h.count('moveTop'), 3, 'a backwards wall clock must not delay recovery indefinitely');
});

test('the configured refresh interval is used for a retained notification', () => {
  const h = fixture({ refreshInterval: 250 });
  h.publish(0, [notice('waiting', 'question')]);
  h.publish(249);
  assert.equal(h.count('moveTop'), 1);
  h.publish(250);
  assert.equal(h.count('moveTop'), 2);
});

test('a destroyed window receives no layer, visibility or focus operations', () => {
  const neverShown = fixture();
  neverShown.state.destroyed = true;
  neverShown.publish(0, [notice('waiting', 'question')]);
  assert.deepEqual(neverShown.calls, []);
  const previouslyShown = fixture();
  previouslyShown.publish(0, [notice('waiting', 'question')]);
  previouslyShown.state.destroyed = true;
  const before = previouslyShown.calls.length;
  previouslyShown.publish(10000);
  previouslyShown.publish(10001, []);
  assert.equal(previouslyShown.calls.length, before);
});

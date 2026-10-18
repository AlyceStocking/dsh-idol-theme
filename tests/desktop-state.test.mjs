import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DesktopState } from '../lib/desktop-state.js';
import { sceneText } from '../lib/characters.js';
import { validateHostMessage } from '../desktop/logic.js';

test('valid long session and question identities cannot invalidate the whole helper packet', () => {
  const state = new DesktopState();
  const id = 's'.repeat(240);
  state.track(id); state.ask(id, 'c'.repeat(240));
  const packet = state.snapshot();
  assert.equal(packet.notices.length, 1);
  assert.equal(packet.notices[0].id.length, 64);
  assert.ok(validateHostMessage(packet));
  state.reconcileQuestions(id, []);
  assert.equal(state.snapshot().notices.length, 0);
});

test('idle and replayed endings do not create success notices; pending waits do not expire', () => {
  let now = 0;
  const state = new DesktopState({ now: () => now });
  state.track('a', { running: false });
  assert.equal(state.snapshot().notices.length, 0);
  state.ask('a', 'q');
  state.observe('a', { type: 'turn/end', data: { turn: 1, reason: { kind: 'error' } } });
  state.observe('a', { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  assert.deepEqual(state.snapshot().notices.map(n => n.kind), ['question', 'error']);
  now = 24 * 3600_000;
  assert.deepEqual(state.snapshot().notices.map(n => n.kind), ['question']);
});

test('notice text follows the idol scene table and fills the session title', () => {
  const state = new DesktopState();
  state.track('s', { title: '测试会话' });
  state.observe('s', { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  const completed = state.snapshot().notices.find(notice => notice.kind === 'completed');
  assert.ok(completed.text.includes('「测试会话」'), completed.text);
  assert.ok(!completed.text.includes('(营业名)'), completed.text);
  state.ask('s', 'q1');
  const question = state.snapshot().notices.find(notice => notice.kind === 'question');
  assert.equal(question.text, sceneText('yukimi', 'story'));
  state.observe('s', { type: 'turn/end', data: { turn: 2, reason: { kind: 'error' } } });
  assert.equal(state.snapshot().notices.find(notice => notice.kind === 'error').text, sceneText('yukimi', 'idle'));
  state.observe('s', { type: 'turn/end', data: { turn: 3, reason: { kind: 'aborted' } } });
  assert.equal(state.snapshot().notices.find(notice => notice.kind === 'aborted').text, sceneText('yukimi', 'idle'));
});

import { CARDS, ICONS, PETITS } from './assets.js';
import { createHash } from 'node:crypto';

export const DEFAULT_PREFERENCES = Object.freeze({
  cardIndex: 7, petitIndex: 0, bg: CARDS[23].url, showSign: true, showMobamas: false,
});

export function validatePreferences(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return {};
  const result = {};
  if (Number.isInteger(patch.cardIndex) && patch.cardIndex >= 0 && patch.cardIndex < ICONS.length) result.cardIndex = patch.cardIndex;
  if (Number.isInteger(patch.petitIndex) && patch.petitIndex >= 0 && patch.petitIndex < PETITS[0].length) result.petitIndex = patch.petitIndex;
  if (CARDS.some(card => card.url === patch.bg)) result.bg = patch.bg;
  for (const key of ['showSign', 'showMobamas']) if (typeof patch[key] === 'boolean') result[key] = patch[key];
  return result;
}

export function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 240 && !/[\u0000-\u001f]/.test(value);
}

const noticeId = (sessionId, key) => createHash('sha256').update(JSON.stringify([sessionId, key])).digest('hex');

// These original lines imitate Yukimi's pauses; they are not quotations from the game.
const NOTICE_LINES = {
  question: ['那个……有件事……想听听你的想法……。', '我在这里……等你告诉我……。'],
  approval: ['往前走之前……可以……帮我确认一下吗……？', '这一步……想牵着你的手……一起决定……。'],
  completed: ['这一轮……做好了……。一起……看看吧……。', '嗯……到这里……完成了……。你看……。'],
  error: ['好像……遇到一点困难……。陪我……看看好吗……？'],
  aborted: ['嗯……先停在这里……。我会……等着你……。'],
};

export class DesktopState {
  constructor({ now = Date.now, random = Math.random } = {}) {
    this.now = now;
    this.random = random;
    this.sessions = new Map();
    this.notices = new Map();
    this.seenTurns = new Map();
    this.preferences = { ...DEFAULT_PREFERENCES };
    this.active = false;
    this.navigation = null;
    this.nextNavigation = 0;
  }

  track(sessionId, { title, running } = {}) {
    if (!validId(sessionId)) return;
    const current = this.sessions.get(sessionId) ?? { title: '会话', running: false };
    if (typeof title === 'string' && title.trim()) current.title = title.trim().slice(0, 100);
    if (typeof running === 'boolean') current.running = running;
    this.sessions.set(sessionId, current);
    for (const notice of this.notices.values()) if (notice.sessionId === sessionId) notice.title = current.title;
  }

  addNotice(sessionId, kind, key, persistent) {
    if (!this.sessions.has(sessionId) || typeof key !== 'string' || key.length > 512) return;
    const id = noticeId(sessionId, key);
    if (this.notices.has(id)) return id;
    const lines = NOTICE_LINES[kind];
    if (!lines) return;
    this.notices.set(id, {
      id, key, sessionId, kind, title: this.sessions.get(sessionId).title,
      text: lines[Math.min(lines.length - 1, Math.floor(this.random() * lines.length))],
      persistent, createdAt: this.now(),
    });
    return id;
  }

  ask(sessionId, callId, approval = false) {
    if (!validId(callId)) return;
    return this.addNotice(sessionId, approval ? 'approval' : 'question', `question:${callId}`, true);
  }

  settleQuestion(sessionId, callId) { this.notices.delete(noticeId(sessionId, `question:${callId}`)); }

  reconcileQuestions(sessionId, active) {
    if (!Array.isArray(active)) return;
    const wanted = new Set(active.map(question => noticeId(sessionId, `question:${question.callId}`)));
    for (const [id, notice] of this.notices) if (notice.sessionId === sessionId && notice.key.startsWith('question:') && !wanted.has(id)) this.notices.delete(id);
    for (const question of active) if (validId(question.callId)) this.ask(sessionId, question.callId);
  }

  observe(sessionId, event) {
    if (!this.sessions.has(sessionId) || !event || typeof event.data !== 'object' || event.data === null) return;
    const data = event.data;
    if (event.type === 'approval/asked' && validId(data.id)) this.addNotice(sessionId, 'approval', `approval:${data.id}`, true);
    if (event.type === 'approval/decided') this.notices.delete(noticeId(sessionId, `approval:${data.id}`));
    if (event.type !== 'turn/end' || !Number.isSafeInteger(data.turn)) return;
    // One monotonic boundary per Session; duplicates/replays never produce a second alert.
    if ((this.seenTurns.get(sessionId) ?? -1) >= data.turn) return;
    this.seenTurns.set(sessionId, data.turn);
    const kind = data.reason?.kind;
    if (['completed', 'error', 'aborted'].includes(kind)) this.addNotice(sessionId, kind, `turn:${data.turn}`, false);
  }

  acknowledge(id) {
    const notice = this.notices.get(id);
    if (notice && !notice.persistent) this.notices.delete(id);
  }

  navigate(sessionId) {
    if (!validId(sessionId) || !this.sessions.has(sessionId)) return false;
    this.navigation = { requestId: String(++this.nextNavigation), sessionId };
    return true;
  }

  ackNavigation(requestId) {
    if (this.navigation?.requestId !== requestId) return false;
    this.navigation = null;
    return true;
  }

  updatePreferences(patch) {
    this.preferences = { ...this.preferences, ...validatePreferences(patch) };
    return { ...this.preferences };
  }

  snapshot() {
    // A late helper should not replay yesterday's completion while pending questions have no expiry.
    for (const [id, notice] of this.notices) if (!notice.persistent && this.now() - notice.createdAt > 15 * 60_000) this.notices.delete(id);
    return {
      type: 'state', active: this.active,
      runningCount: [...this.sessions.values()].filter(session => session.running).length,
      notices: [...this.notices.values()].map(notice => ({ ...notice })),
      preferences: { ...this.preferences },
    };
  }

  clientSnapshot() {
    return { active: this.active, preferences: { ...this.preferences }, navigation: this.navigation ? { ...this.navigation } : null };
  }
}

import { DEFAULT_APPEARANCE, appearancePatch, normalizeAppearance, PLACEHOLDER, sceneText } from './characters.js';
import { createHash } from 'node:crypto';

export const DEFAULT_PREFERENCES = DEFAULT_APPEARANCE;
export const validatePreferences = appearancePatch;

export function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 240 && !/[\u0000-\u001f]/.test(value);
}

const noticeId = (sessionId, key) => createHash('sha256').update(JSON.stringify([sessionId, key])).digest('hex');

// Notice text comes from the wiki's per-idol scene table; error and abort reuse the idle line.
const SCENE_BY_KIND = Object.freeze({
  question: 'story', approval: 'colleague', completed: 'pushBusiness', error: 'idle', aborted: 'idle',
});

// (营业名) becomes the session title in corner brackets; (家具名) stays generic.
const fillScene = (text, title) => text
  .replace(/[（(]营业名[)）]/gu, '「' + title + '」')
  .replace(/[（(]家具名[)）]/gu, '房间');

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
    const scene = SCENE_BY_KIND[kind];
    if (!scene) return;
    const title = this.sessions.get(sessionId).title;
    const line = sceneText(this.preferences.characterId, scene);
    this.notices.set(id, {
      id, key, sessionId, kind, title,
      text: line ? fillScene(line, title) : PLACEHOLDER,
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
    this.preferences = normalizeAppearance(patch, this.preferences);
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

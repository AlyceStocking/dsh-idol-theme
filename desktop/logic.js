import { CARDS, PETITS } from '../lib/assets.js';

export const WINDOW_SIZE = Object.freeze({ width: 360, height: 600 });
export const DEFAULT_PREFERENCES = Object.freeze({ cardIndex: 7, petitIndex: 0, bg: CARDS[23].url, showSign: true, showMobamas: false });
const kinds = new Set(['question', 'approval', 'completed', 'error', 'aborted']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const identifier = value => text(value, 240) && !/[\u0000-\u001f]/u.test(value);

export function normalizePreferences(input, previous = DEFAULT_PREFERENCES) {
  const result = { ...previous };
  if (!object(input)) return result;
  if (Number.isInteger(input.cardIndex) && input.cardIndex >= 0 && input.cardIndex < PETITS.length) result.cardIndex = input.cardIndex;
  if (Number.isInteger(input.petitIndex) && input.petitIndex >= 0 && input.petitIndex < PETITS[result.cardIndex].length) result.petitIndex = input.petitIndex;
  if (typeof input.bg === 'string' && CARDS.some(card => card.url === input.bg)) result.bg = input.bg;
  for (const key of ['showSign', 'showMobamas']) if (typeof input[key] === 'boolean') result[key] = input[key];
  return result;
}

export function validateHostMessage(input) {
  if (!object(input)) return null;
  if (input.type === 'preferences' && object(input.preferences)) {
    const normalized = normalizePreferences(input.preferences);
    const patch = {};
    for (const key of Object.keys(DEFAULT_PREFERENCES)) if (Object.hasOwn(input.preferences, key) && normalized[key] === input.preferences[key]) patch[key] = normalized[key];
    return { type: 'preferences', preferences: patch };
  }
  if (input.type !== 'state' || !Array.isArray(input.notices) || input.notices.length > 5000 || !Number.isInteger(input.runningCount) || input.runningCount < 0 || input.runningCount > 100000) return null;
  const ids = new Set();
  const notices = [];
  for (const notice of input.notices) {
    if (!object(notice) || !identifier(notice.id) || !identifier(notice.sessionId) || !kinds.has(notice.kind) || !text(notice.title, 180) || !text(notice.text, 1200) || typeof notice.persistent !== 'boolean' || ids.has(notice.id)) return null;
    ids.add(notice.id);
    notices.push({ id: notice.id, sessionId: notice.sessionId, kind: notice.kind, title: notice.title, text: notice.text, persistent: notice.kind === 'question' || notice.kind === 'approval' });
  }
  return { type: 'state', notices, runningCount: input.runningCount };
}

export function validateRectangles(input, width = WINDOW_SIZE.width, height = WINDOW_SIZE.height) {
  if (!Array.isArray(input) || input.length > 12) return null;
  if (!input.every(rect => object(rect) && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) && rect.width > 0 && rect.height > 0 && rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1 && (!rect.sprite || rect.sprite === true) && (rect.mirrored === undefined || typeof rect.mirrored === 'boolean'))) return null;
  return input.map(rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, sprite: rect.sprite === true, mirrored: rect.mirrored === true }));
}

// Clamp to one display's work area; never leave the pet stranded after unplugging a monitor.
export function clampWindowBounds(bounds, displays) {
  const areas = displays.map(display => display.workArea ?? display).filter(area => ['x', 'y', 'width', 'height'].every(key => Number.isFinite(area[key])) && area.width > 0 && area.height > 0);
  if (!areas.length) throw new TypeError('At least one display work area is required');
  const width = Math.round(Math.max(1, Number.isFinite(bounds.width) ? bounds.width : WINDOW_SIZE.width));
  const height = Math.round(Math.max(1, Number.isFinite(bounds.height) ? bounds.height : WINDOW_SIZE.height));
  const x = Number.isFinite(bounds.x) ? bounds.x : areas[0].x + areas[0].width - width - 20;
  const y = Number.isFinite(bounds.y) ? bounds.y : areas[0].y + areas[0].height - height - 20;
  const overlap = area => Math.max(0, Math.min(x + width, area.x + area.width) - Math.max(x, area.x)) * Math.max(0, Math.min(y + height, area.y + area.height) - Math.max(y, area.y));
  const distance = area => Math.max(area.x - x, 0, x - area.x - area.width) ** 2 + Math.max(area.y - y, 0, y - area.y - area.height) ** 2;
  const area = [...areas].sort((a, b) => overlap(b) - overlap(a) || distance(a) - distance(b))[0];
  const fittedWidth = Math.min(width, area.width), fittedHeight = Math.min(height, area.height);
  return { x: Math.round(Math.min(Math.max(x, area.x), area.x + area.width - fittedWidth)), y: Math.round(Math.min(Math.max(y, area.y), area.y + area.height - fittedHeight)), width: fittedWidth, height: fittedHeight };
}

export function pointHitsRegions(point, rectangles, mask) {
  return rectangles.some(rect => {
    const x = point.x - rect.x, y = point.y - rect.y;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return false;
    if (!rect.sprite || !mask) return true;
    const column = Math.min(mask.width - 1, Math.floor(x / rect.width * mask.width));
    const px = rect.mirrored ? mask.width - 1 - column : column;
    const py = Math.min(mask.height - 1, Math.floor(y / rect.height * mask.height));
    return mask.alpha[py * mask.width + px] > 24;
  });
}

// Persistent requests always have priority. Completion messages wait in FIFO order and
// survive newer host snapshots until actually shown; an interrupted bubble resumes once.
export class NoticeQueue {
  constructor({ shownIds = [], duration = 5000 } = {}) {
    this.seen = new Set(shownIds.filter(id => typeof id === 'string').slice(-5000));
    this.pending = [];
    this.persistent = [];
    this.active = null;
    this.until = 0;
    this.duration = duration;
  }
  update(notices, now = Date.now()) {
    this.persistent = notices.filter(notice => notice.persistent);
    if (this.persistent.length && this.active) {
      if (this.until > now) this.pending.unshift({ notice: this.active, remaining: this.until - now });
      this.active = null;
    }
    const queued = new Set(this.pending.map(item => item.notice.id));
    for (const notice of notices) {
      if (!notice.persistent && !this.seen.has(notice.id) && this.active?.id !== notice.id && !queued.has(notice.id)) {
        this.pending.push({ notice, remaining: this.duration });
        queued.add(notice.id);
      }
    }
    return this.advance(now);
  }
  advance(now = Date.now()) {
    const newlyShown = [];
    for (const notice of this.persistent) if (!this.seen.has(notice.id)) { this.seen.add(notice.id); newlyShown.push(notice.id); }
    if (!this.persistent.length) {
      if (this.active && now >= this.until) this.active = null;
      if (!this.active && this.pending.length) {
        const item = this.pending.shift();
        this.active = item.notice;
        this.until = now + item.remaining;
        if (!this.seen.has(this.active.id)) { this.seen.add(this.active.id); newlyShown.push(this.active.id); }
      }
    }
    return { persistent: [...this.persistent], transient: this.active, newlyShown, queuedCount: this.pending.length };
  }
  shownIds() { return [...this.seen].slice(-5000); }
}

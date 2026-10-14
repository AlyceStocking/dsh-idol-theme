import { DEFAULT_APPEARANCE, normalizeAppearance } from '../lib/characters.js';

export const WINDOW_SIZE = Object.freeze({ width: 360, height: 600 });
export const PET_SIZE = 170;
export const DEFAULT_PREFERENCES = DEFAULT_APPEARANCE;
const kinds = new Set(['question', 'approval', 'completed', 'error', 'aborted']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const identifier = value => text(value, 240) && !/[\u0000-\u001f]/u.test(value);

export const normalizePreferences = normalizeAppearance;

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

// Settings have their own screen coordinates; moving them never changes the pet.
export const SETTINGS_SIZE = Object.freeze({ width: 320, height: 420 });
export function settingsBounds(position, displays, saved) {
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return clampWindowBounds({ ...saved, ...SETTINGS_SIZE }, displays);
  const pet = clampWindowBounds({ ...position, width: PET_SIZE, height: PET_SIZE }, displays);
  const areas = displays.map(display => display.workArea ?? display);
  const area = areas.find(area => pet.x >= area.x && pet.y >= area.y && pet.x < area.x + area.width && pet.y < area.y + area.height);
  const gap = (WINDOW_SIZE.width - PET_SIZE) / 2 + 12;
  const right = pet.x + pet.width + gap;
  const x = right + SETTINGS_SIZE.width <= area.x + area.width ? right : pet.x - SETTINGS_SIZE.width - gap;
  return clampWindowBounds({ x, y: pet.y + pet.height / 2 - SETTINGS_SIZE.height / 2, ...SETTINGS_SIZE }, [area]);
}

// Migrate old saved carrier-window coordinates without moving the visible pet.
export function petPositionFromWindowBounds(bounds) {
  return { x: bounds.x + (bounds.width - PET_SIZE) / 2, y: bounds.y + bounds.height - 24 - PET_SIZE };
}

// The pet owns its screen position. The transparent carrier may slide around it
// to keep panels visible, but its margins must never restrict pet movement.
export function layoutDesktop(position, displays) {
  const areas = displays.map(display => display.bounds ?? display.workArea ?? display)
    .filter(area => ['x', 'y', 'width', 'height'].every(key => Number.isFinite(area[key])) && area.width > 0 && area.height > 0);
  if (!areas.length) throw new TypeError('At least one display bounds rectangle is required');
  const fallback = petPositionFromWindowBounds(clampWindowBounds(WINDOW_SIZE, displays.map(display => display.workArea ?? display.bounds ?? display)));
  const wanted = { x: Number.isFinite(position?.x) ? position.x : fallback.x, y: Number.isFinite(position?.y) ? position.y : fallback.y, width: PET_SIZE, height: PET_SIZE };
  const placed = clampWindowBounds(wanted, areas);
  const area = areas.find(area => placed.x >= area.x && placed.y >= area.y && placed.x + placed.width <= area.x + area.width && placed.y + placed.height <= area.y + area.height);
  const size = Math.min(PET_SIZE, placed.width, placed.height);
  const square = clampWindowBounds({ ...wanted, width: size, height: size }, [area]);
  const point = { x: square.x, y: square.y };
  const above = point.y - area.y, below = area.y + area.height - point.y - size;
  const preferAbove = above >= WINDOW_SIZE.height - size - 24 || above >= below;
  const bounds = clampWindowBounds({
    x: point.x - (WINDOW_SIZE.width - size) / 2,
    y: point.y - (preferAbove ? WINDOW_SIZE.height - size - 24 : 24),
    ...WINDOW_SIZE,
  }, [area]);
  return { bounds, position: point, pet: { x: point.x - bounds.x, y: point.y - bounds.y, width: size, height: size } };
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

// Notices temporarily use the Windows notification layer. Reassert z-order while
// a bubble stays visible, without moving keyboard focus away from the active app.
export function createNoticeLayer(window, { now = Date.now, refreshInterval = 1000 } = {}) {
  let active = false, lastRaised = -Infinity;
  return snapshot => {
    if (window.isDestroyed()) return;
    const visible = snapshot.persistent.length > 0 || Boolean(snapshot.transient);
    if (!visible) {
      if (active) window.setAlwaysOnTop(true, 'floating');
      active = false;
      return;
    }
    const time = now();
    if (!active || snapshot.newlyShown.length > 0 || time - lastRaised >= refreshInterval || time < lastRaised || !window.isAlwaysOnTop() || !window.isVisible()) {
      window.setAlwaysOnTop(true, 'pop-up-menu');
      if (!window.isVisible()) window.showInactive();
      window.moveTop();
      lastRaised = time;
    }
    active = true;
  };
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

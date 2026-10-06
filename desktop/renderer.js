import { IMG, ICONS, PETITS, CARDS, LINES } from '../lib/assets.js';

const api = window.yukimiDesktop;
const element = id => document.getElementById(id);
const pet = element('pet'), desktop = element('desktop'), notices = element('notices'), noticeList = element('notice-list');
const settings = element('settings'), dialogue = element('dialogue');
let preferences = { cardIndex: 7, petitIndex: 0, bg: CARDS[23].url, showSign: true, showMobamas: false };
let currentNotices = { persistent: [], transient: null, queuedCount: 0 };
let flipSequence = 0, flipPending = 0, outfitPending = 0, flipping = false, lastNoticeSignature = '';
let dialogueTimer, longPressTimer, clickTimer, panelTimer, pointer, regionFrame = 0;

function setPreferences(patch) { api.setPreferences({ ...preferences, ...patch }); }
function refreshPreferences() {
  const url = IMG + PETITS[preferences.cardIndex][preferences.petitIndex];
  if (pet.src !== url) { pet.src = url; element('fallback').hidden = true; }
  element('toggle-sign').textContent = `签名 ${preferences.showSign ? '开' : '关'}`;
  element('toggle-mobamas').textContent = `Mobamas ${preferences.showMobamas ? '开' : '关'}`;
  for (const [index, button] of [...element('outfits').children].entries()) button.classList.toggle('selected', index === preferences.cardIndex);
  for (const [index, button] of [...element('backgrounds').children].entries()) button.classList.toggle('selected', CARDS[index].url === preferences.bg);
}
function reportRegions() {
  const targets = [{ node: pet, sprite: true }, ...[notices, settings].filter(node => !node.hidden).map(node => ({ node }))];
  const rectangles = targets.map(({ node, sprite }) => {
    const rect = node.getBoundingClientRect();
    const transform = sprite ? getComputedStyle(node).transform : 'none';
    const mirrored = transform !== 'none' && new DOMMatrixReadOnly(transform).m11 < 0;
    return { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: Math.min(rect.width, innerWidth - Math.max(0, rect.x)), height: Math.min(rect.height, innerHeight - Math.max(0, rect.y)), ...(sprite ? { sprite: true, mirrored } : {}) };
  }).filter(rect => rect.width > 0 && rect.height > 0);
  api.setRegions(rectangles);
}
function refreshFlipRegions() {
  regionFrame = 0;
  reportRegions();
  if (flipping) regionFrame = requestAnimationFrame(refreshFlipRegions);
}
function renderNotices() {
  const visible = currentNotices.persistent.length ? currentNotices.persistent : currentNotices.transient ? [currentNotices.transient] : [];
  notices.hidden = visible.length === 0;
  if (visible.length) { dialogue.hidden = true; clearTimeout(dialogueTimer); }
  element('notice-heading').textContent = currentNotices.persistent.length ? `有 ${visible.length} 件事……在等你……` : `这一轮……${currentNotices.queuedCount ? `还有 ${currentNotices.queuedCount} 个提醒……` : ''}`;
  const signature = JSON.stringify(visible);
  if (signature !== lastNoticeSignature) {
    const oldScroll = noticeList.scrollTop;
    noticeList.replaceChildren();
    for (const notice of visible) {
      const button = document.createElement('button'); button.className = `notice notice-${notice.kind}`;
      const title = document.createElement('span'); title.className = 'notice-title'; title.textContent = notice.title;
      const text = document.createElement('span'); text.className = 'notice-text'; text.textContent = notice.text;
      const tip = document.createElement('span'); tip.className = 'notice-tip'; tip.textContent = '点击……一起去看看……';
      button.append(title, text, tip); button.addEventListener('click', () => api.openSession(notice.sessionId));
      noticeList.append(button);
    }
    noticeList.scrollTop = oldScroll;
    lastNoticeSignature = signature;
  }
  requestAnimationFrame(reportRegions);
}
function acceptState(packet) {
  if (!packet || !packet.preferences || !packet.notices) return;
  preferences = packet.preferences; currentNotices = packet.notices;
  refreshPreferences(); renderNotices();
  const running = element('running'); running.hidden = packet.runningCount === 0; running.textContent = `工作中…… ${packet.runningCount}`;
  if (Number.isInteger(packet.flipSequence) && packet.flipSequence > flipSequence) {
    flipPending += packet.flipSequence - flipSequence; flipSequence = packet.flipSequence; performFlip();
  }
  if (Array.isArray(packet.newlyShown) && packet.newlyShown.length) requestAnimationFrame(() => api.shown(packet.newlyShown));
}
function performFlip(changeOutfit = false) {
  if (changeOutfit) outfitPending++;
  if (flipping || (outfitPending < 1 && flipPending < 1)) return;
  changeOutfit = outfitPending > 0;
  if (changeOutfit) outfitPending--; else flipPending--;
  flipping = true; pet.classList.remove('flipping'); void pet.offsetWidth; pet.classList.add('flipping');
  if (!regionFrame) regionFrame = requestAnimationFrame(refreshFlipRegions);
  setTimeout(() => setPreferences(changeOutfit ? { cardIndex: (preferences.cardIndex + 1) % PETITS.length, petitIndex: 0 } : { petitIndex: (preferences.petitIndex + 1) % PETITS[preferences.cardIndex].length }), 250);
  setTimeout(() => { flipping = false; pet.classList.remove('flipping'); performFlip(); }, 540);
}
function interact() {
  flipPending++; performFlip();
  if (!notices.hidden) return;
  dialogue.textContent = LINES[Math.floor(Math.random() * LINES.length)]; dialogue.hidden = false;
  clearTimeout(dialogueTimer); dialogueTimer = setTimeout(() => { dialogue.hidden = true; }, 3200);
}
function setPanel(open) {
  settings.hidden = !open; desktop.classList.toggle('settings-open', open);
  clearTimeout(panelTimer);
  if (open) panelTimer = setTimeout(() => setPanel(false), 15000);
  requestAnimationFrame(reportRegions);
}
function resetPanelTimer() { clearTimeout(panelTimer); panelTimer = setTimeout(() => setPanel(false), 15000); }
element('close-settings').addEventListener('click', () => setPanel(false));
settings.addEventListener('pointerdown', resetPanelTimer);
element('toggle-sign').addEventListener('click', () => setPreferences({ showSign: !preferences.showSign }));
element('toggle-mobamas').addEventListener('click', () => setPreferences({ showMobamas: !preferences.showMobamas }));
for (const [index, icon] of ICONS.entries()) {
  const button = document.createElement('button'); button.title = `小人 ${index + 1}`;
  const image = document.createElement('img'); image.src = IMG + icon; image.alt = button.title; image.loading = 'lazy';
  button.append(image); button.addEventListener('click', () => setPreferences({ cardIndex: index, petitIndex: 0 })); element('outfits').append(button);
}
for (const card of CARDS) {
  const button = document.createElement('button'); button.title = card.label;
  const image = document.createElement('img'); image.src = card.url; image.alt = card.label; image.loading = 'lazy';
  button.append(image); button.addEventListener('click', () => setPreferences({ bg: card.url })); element('backgrounds').append(button);
}
pet.addEventListener('error', () => { element('fallback').hidden = false; });
pet.addEventListener('dragstart', event => event.preventDefault());
pet.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pet.setPointerCapture(event.pointerId);
  pointer = { x: event.screenX, y: event.screenY, dragging: false, long: false };
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => { if (pointer && !pointer.dragging) { pointer.long = true; setPanel(settings.hidden); } }, 500);
});
pet.addEventListener('pointermove', event => {
  if (!pointer || pointer.long) return;
  if (!pointer.dragging && Math.hypot(event.screenX - pointer.x, event.screenY - pointer.y) > 8) {
    pointer.dragging = true; clearTimeout(longPressTimer); clearTimeout(clickTimer); clickTimer = null; api.drag('start');
  }
});
pet.addEventListener('pointerup', () => {
  clearTimeout(longPressTimer);
  if (!pointer) return;
  const previous = pointer; pointer = null;
  if (previous.dragging) { api.drag('end'); return; }
  if (previous.long) return;
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; performFlip(true); }
  else clickTimer = setTimeout(() => { clickTimer = null; interact(); }, 280);
});
function cancelPointer() { clearTimeout(longPressTimer); if (pointer?.dragging) api.drag('end'); pointer = null; }
pet.addEventListener('pointercancel', cancelPointer);
window.addEventListener('blur', cancelPointer);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setPanel(false);
  if (event.target === pet && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); interact(); }
  if (event.target === pet && event.key === 'ContextMenu') { event.preventDefault(); setPanel(settings.hidden); }
});
api.onState(acceptState);
refreshPreferences(); reportRegions();
const initial = await api.ready(); acceptState(initial);
// The pet's idle movement is at most six pixels; keep the cursor mask aligned.
setInterval(reportRegions, 80);

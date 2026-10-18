import { CHARACTER_LIST, DEFAULT_APPEARANCE, getCharacter, normalizeAppearance, spriteUrl, PLACEHOLDER, createLinePicker, visualOf, matchesCharacter } from '../lib/characters.js';
import { createSpriteCache } from './sprite-cache.js';

const api = window.yukimiDesktop;
const settingsOnly = api.mode === 'settings';
const element = id => document.getElementById(id);
const pet = element('pet'), desktop = element('desktop'), notices = element('notices'), noticeList = element('notice-list');
const settings = element('settings'), dialogue = element('dialogue');
const petWrap = element('pet-wrap');
const sprites = createSpriteCache();
const nextLine = createLinePicker();
let preferences = { ...DEFAULT_APPEARANCE };
let { IMG, ICONS, PETITS, CARDS } = getCharacter(preferences.characterId);
let renderedCharacter = null, warmedOutfit = null;
let currentNotices = { persistent: [], transient: null, queuedCount: 0 };
let flipSequence = 0, flipPending = 0, outfitPending = 0, flipping = false, lastNoticeSignature = '';
let dialogueTimer, longPressTimer, clickTimer, pointer, regionFrame = 0;
let spriteRequest = 0, appearanceRequest = 0, requestedSpriteUrl = '';

function layoutPanels() {
  const rect = petWrap.getBoundingClientRect(), inset = 8, gap = 12;
  const width = Math.max(1, Math.min(320, innerWidth - inset * 2));
  const left = Math.max(inset, Math.min(rect.x + rect.width / 2 - width / 2, innerWidth - width - inset));
  if (settingsOnly) return;
  const above = { start: inset, end: Math.max(inset, rect.y - gap), above: true };
  const below = { start: Math.min(innerHeight - inset, rect.bottom + gap), end: innerHeight - inset, above: false };
  above.height = above.end - above.start; below.height = below.end - below.start;
  const main = above.height >= below.height ? above : below;
  for (const node of [notices, dialogue]) {
    node.style.left = `${left}px`; node.style.width = `${width}px`; node.style.bottom = 'auto';
  }
  notices.style.maxHeight = '270px'; noticeList.style.maxHeight = '220px';
  const bubble = !notices.hidden ? notices : !dialogue.hidden ? dialogue : null;
  if (bubble) {
    bubble.style.maxHeight = `${main.height}px`;
    const height = Math.min(main.height, Math.ceil(bubble.getBoundingClientRect().height));
    bubble.style.top = `${main.above ? main.end - height : main.start}px`;
    if (bubble === notices) noticeList.style.maxHeight = `${Math.max(0, height - element('notice-heading').getBoundingClientRect().height - 14)}px`;
  }
  const running = element('running');
  running.style.right = 'auto';
  running.style.left = `${Math.max(inset - rect.x, Math.min(rect.width - running.offsetWidth + 18, innerWidth - inset - rect.x - running.offsetWidth))}px`;
  requestAnimationFrame(reportRegions);
}

function acceptLayout(value) {
  if (!value || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key]))) return;
  petWrap.style.left = `${value.x}px`; petWrap.style.top = `${value.y}px`; petWrap.style.bottom = 'auto';
  petWrap.style.width = pet.style.width = `${value.width}px`;
  petWrap.style.height = pet.style.height = `${value.height}px`;
  pet.style.setProperty('--idle-lift', `${Math.min(6, Math.max(0, value.y))}px`);
  layoutPanels();
}

function setPreferences(patch) {
  if (!Object.hasOwn(patch, 'characterId') && !Object.hasOwn(patch, 'cardIndex') && !Object.hasOwn(patch, 'petitIndex')) {
    api.setPreferences(normalizeAppearance(patch, preferences));
    return;
  }
  const request = ++appearanceRequest;
  const original = { characterId: preferences.characterId, cardIndex: preferences.cardIndex, petitIndex: preferences.petitIndex };
  const next = normalizeAppearance(patch, preferences);
  element('character-status').textContent = '加载中…';
  const load = sprites.focus?.bind(sprites) ?? sprites.load.bind(sprites);
  load(spriteUrl(next)).then(image => {
    if (request !== appearanceRequest) return;
    if (image && preferences.characterId === original.characterId && preferences.cardIndex === original.cardIndex && preferences.petitIndex === original.petitIndex) {
      element('character-status').textContent = '';
      api.setPreferences(normalizeAppearance(patch, preferences));
    } else {
      element('character-status').textContent = '加载失败，已保留当前角色';
      element('character-select').value = preferences.characterId;
    }
  });
}
function refreshPreferences() {
  const character = getCharacter(preferences.characterId);
  ({ IMG, ICONS, PETITS, CARDS } = character);
  pet.alt = character.name + " 纸片小人";
  pet.setAttribute?.("aria-label", "与" + character.name + "互动；双击换装，长按设置");
  if (renderedCharacter !== character.id) { renderedCharacter = character.id; renderChoices(); renderCharacterOptions(); }
  const url = spriteUrl(preferences);
  if (requestedSpriteUrl !== url) {
    requestedSpriteUrl = url;
    const request = ++spriteRequest;
    // Keep the displayed outfit until its replacement has downloaded and decoded.
    sprites.load(url).then(image => {
      if (request !== spriteRequest) return;
      if (image) { pet.src = image.src; element('fallback').hidden = true; }
      else { requestedSpriteUrl = ''; element('fallback').hidden = Boolean(pet.src); }
    });
  }
  element('toggle-sign').textContent = `签名 ${preferences.showSign ? '开' : '关'}`;
  element('toggle-mobamas').textContent = `Mobamas ${preferences.showMobamas ? '开' : '关'}`;
  for (const [index, button] of [...element('outfits').children].entries()) button.classList.toggle('selected', index === preferences.cardIndex);
  for (const [index, button] of [...element('backgrounds').children].entries()) button.classList.toggle('selected', CARDS[index].url === preferences.bg);
}
function reportRegions() {
  if (settingsOnly) return;
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
  element('notice-heading').textContent = PLACEHOLDER;
  const signature = JSON.stringify(visible);
  if (signature !== lastNoticeSignature) {
    const oldScroll = noticeList.scrollTop;
    noticeList.replaceChildren();
    for (const notice of visible) {
      const button = document.createElement('button'); button.className = `notice notice-${notice.kind}`;
      const title = document.createElement('span'); title.className = 'notice-title'; title.textContent = notice.title;
      const text = document.createElement('span'); text.className = 'notice-text'; text.textContent = PLACEHOLDER;
      const tip = document.createElement('span'); tip.className = 'notice-tip'; tip.textContent = PLACEHOLDER;
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
  if (packet.preferences.characterId && packet.preferences.characterId !== preferences.characterId) { appearanceRequest++; flipPending = 0; outfitPending = 0; }
  const next = normalizeAppearance(packet.preferences, preferences);
  if (next.characterId !== preferences.characterId) sprites.focus?.(spriteUrl(next));
  preferences = next; currentNotices = packet.notices;
  syncAccent();
  refreshPreferences(); renderNotices();
  const warmKey = preferences.characterId + ':' + preferences.cardIndex;
  if (!settingsOnly && warmedOutfit !== warmKey) {
    warmedOutfit = warmKey;
    const nextOutfit = (preferences.cardIndex + 1) % PETITS.length;
    const urls = [...PETITS[preferences.cardIndex], ...PETITS[nextOutfit]].map(file => IMG + file);
    sprites.retainWarm?.(urls);
    sprites.warm(urls);
  }
  const running = element('running'); running.hidden = packet.runningCount === 0; running.textContent = PLACEHOLDER;
  if (!settingsOnly && packet.layout) acceptLayout(packet.layout); else layoutPanels();
  if (Number.isInteger(packet.flipSequence) && packet.flipSequence > flipSequence) {
    flipPending += packet.flipSequence - flipSequence; flipSequence = packet.flipSequence; performFlip();
  }
  if (Array.isArray(packet.newlyShown) && packet.newlyShown.length) requestAnimationFrame(() => api.shown(packet.newlyShown));
}
async function performFlip(changeOutfit = false) {
  if (changeOutfit) outfitPending++;
  if (flipping || (outfitPending < 1 && flipPending < 1)) return;
  changeOutfit = outfitPending > 0;
  if (changeOutfit) outfitPending--; else flipPending--;
  flipping = true;
  const original = { characterId: preferences.characterId, cardIndex: preferences.cardIndex, petitIndex: preferences.petitIndex };
  const patch = changeOutfit ? { cardIndex: (original.cardIndex + 1) % PETITS.length, petitIndex: 0 } : { petitIndex: (original.petitIndex + 1) % PETITS[original.cardIndex].length };
  const request = appearanceRequest;
  const image = await sprites.load(spriteUrl({ ...original, ...patch }));
  if (preferences.characterId !== original.characterId) { flipping = false; performFlip(); return; }
  pet.classList.remove('flipping'); void pet.offsetWidth; pet.classList.add('flipping');
  if (!regionFrame) regionFrame = requestAnimationFrame(refreshFlipRegions);
  setTimeout(() => {
    if (image && request === appearanceRequest && preferences.characterId === original.characterId && preferences.cardIndex === original.cardIndex && preferences.petitIndex === original.petitIndex) setPreferences(patch);
  }, 250);
  setTimeout(() => { flipping = false; pet.classList.remove('flipping'); performFlip(); }, 540);
}
function syncAccent() {
  const style = document.documentElement && document.documentElement.style;
  if (!style) return;
  const visual = visualOf(preferences.characterId);
  style.setProperty('--yukimi-accent', visual.accent ?? '#171c8f');
}

function interact() {
  flipPending++; performFlip();
  if (!notices.hidden) return;
  const speaker = getCharacter(preferences.characterId);
  dialogue.textContent = nextLine(speaker, speaker.outfitIds[preferences.cardIndex]); dialogue.hidden = false;
  layoutPanels();
  clearTimeout(dialogueTimer); dialogueTimer = setTimeout(() => { dialogue.hidden = true; layoutPanels(); }, 3200);
}
function setPanel(open) { api.panel(open); }
let panelDragging = false;
const panelHeader = element('settings-header');
panelHeader.addEventListener('pointerdown', event => {
  if (!settingsOnly || event.button !== 0 || event.target === element('close-settings')) return;
  event.preventDefault(); panelHeader.setPointerCapture(event.pointerId); panelDragging = true;
  api.panelDrag('start', { x: event.screenX, y: event.screenY });
});
function endPanelDrag() { if (panelDragging) { panelDragging = false; api.panelDrag('end'); } }
panelHeader.addEventListener('pointerup', endPanelDrag);
panelHeader.addEventListener('pointercancel', endPanelDrag);
window.addEventListener('blur', endPanelDrag);
element('close-settings').addEventListener('click', () => setPanel(false));
element('toggle-sign').addEventListener('click', () => setPreferences({ showSign: !preferences.showSign }));
element('toggle-mobamas').addEventListener('click', () => setPreferences({ showMobamas: !preferences.showMobamas }));
function renderChoices() {
element("outfits").replaceChildren(); element("backgrounds").replaceChildren();
for (const [index, icon] of ICONS.entries()) {
  const button = document.createElement('button'); button.title = `小人 ${index + 1}`;
  const image = document.createElement('img'); image.src = IMG + icon; image.alt = button.title; image.loading = 'lazy'; image.fetchPriority = 'low';
  button.append(image); button.addEventListener('click', () => setPreferences({ cardIndex: index, petitIndex: 0 })); element('outfits').append(button);
}
for (const card of CARDS) {
  const button = document.createElement('button'); button.title = card.label;
  const image = document.createElement('img'); image.src = card.url; image.alt = card.label; image.loading = 'lazy'; image.fetchPriority = 'low';
  button.append(image); button.addEventListener('click', () => setPreferences({ bg: card.url })); element('backgrounds').append(button);
}
}
function renderCharacterOptions() {
  const query = (element('character-search').value || '').trim().toLowerCase();
  const options = CHARACTER_LIST.filter(character => character.id === preferences.characterId || matchesCharacter(character, query)).map(character => {
    const option = document.createElement('option'); option.value = character.id; option.textContent = character.name + (character.available === false ? '（待收录）' : ''); option.disabled = character.available === false; return option;
  });
  element('character-select').replaceChildren(...options);
  element('character-select').value = preferences.characterId;
}
element('character-search').addEventListener('input', renderCharacterOptions);
element('character-select').addEventListener('change', () => setPreferences({ characterId: element('character-select').value }));
pet.addEventListener('error', () => { element('fallback').hidden = false; });
pet.addEventListener('dragstart', event => event.preventDefault());
pet.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pet.setPointerCapture(event.pointerId);
  pointer = { x: event.screenX, y: event.screenY, dragging: false, long: false };
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => { if (pointer && !pointer.dragging) { pointer.long = true; setPanel(); } }, 500);
});
pet.addEventListener('pointermove', event => {
  if (!pointer || pointer.long) return;
  if (!pointer.dragging && Math.hypot(event.screenX - pointer.x, event.screenY - pointer.y) > 8) {
    pointer.dragging = true; clearTimeout(longPressTimer); clearTimeout(clickTimer); clickTimer = null; api.drag('start', { x: pointer.x, y: pointer.y });
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
  if (event.target === pet && event.key === 'ContextMenu') { event.preventDefault(); setPanel(); }
});
if (settingsOnly) {
  document.title = '偶像 · 选择面板';
  desktop.classList.add('settings-window'); settings.hidden = false; petWrap.hidden = true;
}
api.onState(acceptState);
api.onLayout(acceptLayout);
window.addEventListener('resize', layoutPanels);
refreshPreferences(); reportRegions();
const initial = await api.ready(); acceptState(initial);
// The pet's idle movement is at most six pixels; keep the cursor mask aligned.
setInterval(reportRegions, 80);

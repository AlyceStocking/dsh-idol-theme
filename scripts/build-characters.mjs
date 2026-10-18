// Build the approved 190-idol scope from checked-in metadata; no network at build time.
import { readFile, writeFile } from 'node:fs/promises';
const directory = new URL('../research/roster/', import.meta.url);
const { roster } = JSON.parse(await readFile(new URL('index.json', directory), 'utf8'));
const root = 'https://patchwiki.biligame.com/images/imascg/';
const characters = {}, characterLines = {}, characterSerifu = {}, issues = [], unavailable = [];
// Optional dialogue metadata collected by scripts/audit-dialogue.mjs and scripts/audit-serifu.mjs; the build stays offline.
let dialogue = {}, serifu = {};
try { dialogue = JSON.parse(await readFile(new URL('lines.json', directory), 'utf8')).lines ?? {}; } catch { /* no common dialogue collected yet */ }
try { serifu = JSON.parse(await readFile(new URL('serifu.json', directory), 'utf8')).blocks ?? {}; } catch { /* no per-outfit dialogue collected yet */ }
const linesOf = person => (dialogue[person.page] ?? []).map(entry => entry?.text).filter(text => typeof text === 'string' && text.length > 1 && text.length <= 80);
const serifuOf = person => Object.fromEntries((serifu[person.page] ?? []).filter(entry => Array.isArray(entry?.lines) && entry.lines.length).map(entry => [String(entry.outfit), entry.lines.filter(text => typeof text === 'string' && text.length > 1 && text.length <= 80)]));
const defer = (person, issue) => { issues.push({ name: person.page, issue, unavailable: true }); unavailable.push({ id: 'unavailable:' + person.page, name: person.page, search: '', available: false }); };
const aliases = { arisu: 'tachibana arisu 橘ありす' };
const trusted = file => file?.info?.url?.startsWith(root) && /^image\//.test(file.info.mime);
for (const person of roster) {
  const sample = JSON.parse(await readFile(new URL(encodeURIComponent(person.page) + '.json', directory), 'utf8'));
  if (sample.error) { defer(person, sample.error); continue; }
  const { files, stem, id } = sample;
  const excluded = files.filter(file => !trusted(file)).map(file => file.title);
  if (excluded.length) issues.push({ name: person.page, issue: 'Missing image metadata', files: excluded });
  const available = files.filter(trusted);
  const sprites = available.filter(file => file.kind === 'petit');
  const candidates = [...new Set(files.filter(file => file.kind === 'petit').map(file => file.outfit))].sort((a,b) => a-b);
  const outfits = [];
  for (const outfit of candidates) {
    const poses = sprites.filter(file => file.outfit === outfit).sort((a,b) => a.pose-b.pose);
    const icon = available.find(file => file.title.toLowerCase() === `CGSS-${stem}-icon-${outfit}.png`.toLowerCase());
    if (!icon || poses.length !== 4 || poses.some((file,index) => file.pose !== index + 1 || file.info.width !== 256 || file.info.height !== 256)) {
      issues.push({ name: person.page, issue: !icon ? 'Outfit icon not listed on character page; excluded' : 'Incomplete or nonstandard poses; excluded', outfit }); continue;
    }
    outfits.push({ id: String(outfit), icon: icon.info.url.slice(root.length), poses: poses.map(file => file.info.url.slice(root.length)) });
  }
  const cards = available.filter(file => file.kind === 'background').sort((a,b) => a.title.localeCompare(b.title, 'en', { numeric: true }));
  if (!outfits.length || !cards.length) { defer(person, 'No complete outfit or background'); continue; }
  const signature = available.find(file => file.kind === 'signature')?.info.url ?? null;
  if (!signature) issues.push({ name: person.page, issue: 'Signature unavailable; overlay hidden' });
  if (Object.hasOwn(characters, id)) throw Error(`Duplicate stable character identity: ${id}`);
  const character = {
    id, name: sample.page, group: person.group, search: [sample.roman, stem, aliases[id] ?? ''].join(' '),
    SIGN_URL: signature, ICONS: outfits.map(item => item.icon), PETITS: outfits.map(item => item.poses), outfitIds: outfits.map(item => item.id),
    CARDS: cards.map(file => ({ id: file.title, label: file.title.replace(`CGSS-${stem}-`, '').replace('.png', ''), url: file.info.url })),
    MOBAMAS: available.filter(file => file.kind === 'mobamas' && file.title.includes('+')).map(file => ({ label: file.title.replace(`CG-${stem}-`, '').replace(/\.jpe?g$/i, ''), url: file.info.url })),
    defaults: { cardIndex: 0, petitIndex: 0, bg: cards[0].info.url },
  };
  const lines = linesOf(person);
  if (lines.length) characterLines[id] = lines;
  // Only keep dialogue for outfits that survived the catalog checks above.
  const availableOutfits = new Set(outfits.map(item => item.id));
  const outfitLines = Object.fromEntries(Object.entries(serifuOf(person)).filter(([outfit]) => availableOutfits.has(outfit)));
  if (Object.keys(outfitLines).length) characterSerifu[id] = outfitLines;
  // Preserve Yukimi's established ordering/defaults and legacy preferences.
  if (id !== 'yukimi') characters[id] = character;
}
if (roster.length !== 190) throw Error('Expected the approved 190-idol scope');
const modulePath = new URL('../lib/characters.js', import.meta.url);
const source = (await readFile(modulePath, 'utf8')).replaceAll('\r\n', '\n');
const result = source.replace(/\/\/ BEGIN CHARACTER_DATA[\s\S]*?\/\/ END CHARACTER_DATA/, `// BEGIN CHARACTER_DATA\nconst ADDITIONAL_CHARACTERS = {\n${Object.entries(characters).map(([id, data]) => JSON.stringify(id) + ': ' + JSON.stringify(data)).join(',\n')}\n};\nconst UNAVAILABLE_CHARACTERS = ${JSON.stringify(unavailable)};\nconst CHARACTER_LINES = ${JSON.stringify(characterLines)};\nconst CHARACTER_SERIFU = ${JSON.stringify(characterSerifu)};\n// END CHARACTER_DATA`);
const reportPath = new URL('coverage.json', directory);
const report = JSON.stringify({ scope: 190, available: Object.keys(characters).length + 1, issues }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (source !== result || (await readFile(reportPath, 'utf8')).replaceAll('\r\n', '\n') !== report) throw Error('Character catalog/coverage is stale');
} else { await writeFile(modulePath, result); await writeFile(reportPath, report); }
console.log(`Catalog: ${Object.keys(characters).length + 1}/190; recorded exceptions: ${issues.length}`);

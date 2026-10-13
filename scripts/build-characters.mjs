// Generate additional characters from the reviewed, offline BWiki snapshot.
import { readFile, writeFile } from 'node:fs/promises';
const report = JSON.parse(await readFile(new URL('../research/bwiki-samples.json', import.meta.url)));
const aliases = { arisu: 'tachibana arisu 橘ありす' };
const characters = Object.fromEntries(report.samples.filter(sample => sample.id !== 'yukimi').map(sample => {
const root = 'https://patchwiki.biligame.com/images/imascg/';
const files = sample.files;
const relative = file => {
  if (!file?.info?.url?.startsWith(root)) throw new Error('Missing or untrusted image metadata');
  return file.info.url.slice(root.length);
};
const numbered = (kind, pattern) => files.filter(file => file.kind === kind).sort((a, b) => Number(a.title.match(pattern)[1]) - Number(b.title.match(pattern)[1]));
const sprites = numbered('petit', /Petit-(\d+)/);
const outfits = [...new Set(sprites.map(file => file.outfit))];
const cards = files.filter(file => file.kind === 'background').sort((a,b) => a.title.localeCompare(b.title, 'en', { numeric: true }));
const character = {
  id: sample.id, name: sample.page, search: aliases[sample.id] ?? sample.stem,
  SIGN_URL: files.find(file => file.kind === 'signature').info.url,
  ICONS: outfits.map(id => relative(files.find(file => file.title === `CGSS-${sample.stem}-icon-${id}.png`))),
  PETITS: outfits.map(id => sprites.filter(file => file.outfit === id).sort((a,b) => a.pose-b.pose).map(relative)),
  outfitIds: outfits.map(String),
  CARDS: cards.map(file => ({ id: file.title, label: file.title.replace(`CGSS-${sample.stem}-`, '').replace('.png', ''), url: file.info.url })),
  MOBAMAS: files.filter(file => file.kind === 'mobamas' && file.title.includes('+')).map(file => ({ label: file.title.replace(`CG-${sample.stem}-`, '').replace('.jpg', ''), url: file.info.url })),
  defaults: { cardIndex: 0, petitIndex: 0, bg: cards[0].info.url },
};
if (!character.PETITS.length || character.PETITS.some(poses => poses.length !== 4)) throw new Error(`Incomplete sprite set: ${sample.id}`);
return [sample.id, character];
}));
const modulePath = new URL('../lib/characters.js', import.meta.url);
const source = await readFile(modulePath, 'utf8');
const result = source.replace(/\/\/ BEGIN CHARACTER_DATA[\s\S]*?\/\/ END CHARACTER_DATA/, `// BEGIN CHARACTER_DATA\nconst ADDITIONAL_CHARACTERS = ${JSON.stringify(characters, null, 2)};\n// END CHARACTER_DATA`);
if (process.argv.includes('--check')) {
  if (source.replaceAll('\r\n', '\n') !== result.replaceAll('\r\n', '\n')) throw new Error('Character data is stale');
} else await writeFile(modulePath, result);

// Metadata only. Four bounded workers; resumable per-character results.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const endpoint = 'https://wiki.biligame.com/imascg/api.php';
const output = new URL('../research/roster/', import.meta.url);
await mkdir(output, { recursive: true });
let limited = false;
async function api(params) {
  if (limited) throw Error("Metadata collection paused after rate limit");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = new URL(endpoint); url.search = new URLSearchParams({ format: 'json', ...params });
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if ([429, 567].includes(response.status)) { limited = true; throw Error(`HTTP ${response.status}; collection paused`); }
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const data = await response.json(); if (data.error) throw Error(data.error.code);
      return data;
    } catch (error) { if (limited || attempt === 2) throw error; await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); }
  }
}
const { parse } = await api({ action: 'parse', page: '角色列表', prop: 'wikitext|revid' });
const source = parse.wikitext['*'].replace(/<!--[\s\S]*?-->/g, '');
const roster = source.split('\n|-\n').flatMap(row => {
  const group = row.match(/'''(Cute|Cool|Passion)'''/)?.[1];
  return group ? [...row.matchAll(/\{\{CharLink\|([^|}]+)/g)].map(match => ({ page: match[1].trim(), group })) : [];
});
if (roster.length !== 190 || new Set(roster.map(x => x.page)).size !== 190) throw Error('Roster changed; review scope before collecting');
await writeFile(new URL('index.json', output), JSON.stringify({ endpoint, revision: parse.revid, scope: '190 Cinderella Girls idols only', roster }, null, 2) + '\n');
const classify = (title, stem) => {
  const prefix = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [kind, pattern] of [
    ['signature', `^${prefix}-sign\\.png$`], ['icon', `^CGSS-${prefix}-icon-(\\d+)\\.png$`],
    ['petit', `^CGSS-${prefix}-Petit-(\\d+)-(\\d+)\\.png$`],
    ['background', `^CGSS-${prefix}-(N|R|SR|SSR)-(\\d+)(\\+)?\\.png$`],
    ['mobamas', `^CG-${prefix}-(N|R|SR|SSR)-(\\d+)(\\+)?\\.jpe?g$`],
  ]) {
    const match = title.match(new RegExp(pattern, 'i'));
    if (match) return { kind, ...(kind === 'petit' ? { outfit: Number(match[1]), pose: Number(match[2]) } : {}) };
  }
  return null;
};
let cursor = 0, done = 0;
const results = [];
async function collect(person) {
  const file = new URL(encodeURIComponent(person.page) + '.json', output);
  if (!process.argv.includes('--refresh')) {
    try { const cached = JSON.parse(await readFile(file, 'utf8')); if (!cached.error) return cached; } catch {}
  }
  let result;
  try {
    const { parse: page } = await api({ action: 'parse', page: person.page, prop: 'wikitext|images|revid' });
    // Identity comes from the character infobox, not the other idols linked on its page.
    const infobox = page.wikitext['*'].split('{{DereCharaInfo')[1];
    const primary = infobox?.match(/\|\s*CGSS图1\s*=\s*CGSS-(.+?)-(?:N|R|SR|SSR)-\d/);
    if (!primary) throw Error('No unambiguous CGSS identity in infobox');
    const stem = primary[1];
    const roman = infobox.match(/\|\s*罗马字姓名\s*=\s*([^\n|]+)/)?.[1]?.trim() ?? stem;
    const selected = page.images.map(title => ({ title, ...classify(title, stem) })).filter(item => item.kind);
    const metadata = new Map();
    for (let index = 0; index < selected.length; index += 50) {
      const data = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime|sha1', titles: selected.slice(index, index + 50).map(item => `File:${item.title}`).join('|') });
      for (const item of Object.values(data.query.pages)) metadata.set(item.title.replace(/^[^:]+:/, '').replaceAll(' ', '_'), item.imageinfo?.[0] ?? null);
    }
    result = { ...person, id: stem.toLowerCase(), stem, roman, revision: page.revid, checkedAt: new Date().toISOString(), files: selected.map(item => ({ ...item, info: metadata.get(item.title.replaceAll(' ', '_')) ?? null })) };
  } catch (error) { result = { ...person, error: error.message }; }
  await writeFile(file, JSON.stringify(result, null, 2) + '\n');
  return result;
}
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < roster.length) {
    const person = roster[cursor++]; const result = await collect(person); results.push(result); done++;
    if (done % 10 === 0 || result.error) console.log(`${done}/190 ${person.page}${result.error ? ': ' + result.error : ''}`);
  }
}));
console.log(JSON.stringify({ total: results.length, errors: results.filter(x => x.error).map(({ page, error }) => ({ page, error })) }));

// Impression colour plus sticker / transition artwork, batched and resumable.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const endpoint = 'https://wiki.biligame.com/imascg/api.php';
const directory = new URL('../research/roster/', import.meta.url);
const output = new URL('visual.json', directory);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const own = (title, stem) => {
  const key = stem.toLowerCase();
  return title.toLowerCase().includes(key) || title.toLowerCase().replaceAll('_', '').includes(key);
};

export function parseVisual(wikitext, stem = '') {
  const colour = wikitext.match(/\|\s*印象色\s*=\s*(#[0-9A-Fa-f]{6})/)?.[1] ?? null;
  const files = [];
  for (const line of wikitext.split(/\r?\n/)) {
    const match = line.match(/File:([^|}\n]+?\.(?:png|gif|jpe?g))\|([^|}\n]*)/i);
    if (!match) continue;
    const title = match[1].trim();
    const label = match[2].trim();
    if (!/贴纸|过场动画/i.test(label)) continue;
    if (!own(title, stem)) continue;
    files.push({ title, label, kind: /过场动画/.test(label) ? 'anim' : 'stamp', animated: /\.gif$/i.test(title) });
  }
  const unique = [...new Map(files.map(file => [file.title, file])).values()];
  const stamps = unique.filter(file => file.kind === 'stamp');
  const anims = unique.filter(file => file.kind === 'anim');
  return { colour, stamps, anims };
}

async function collect({ batchSize = 50, gap = 2500 } = {}) {
  const { roster } = JSON.parse(await readFile(new URL('index.json', directory), 'utf8'));
  const stems = new Map();
  for (const person of roster) {
    try { stems.set(person.page, JSON.parse(await readFile(new URL(encodeURIComponent(person.page) + '.json', directory), 'utf8')).stem ?? ''); }
    catch { stems.set(person.page, ''); }
  }
  let saved = { endpoint, source: 'BWiki 角色页（印象色 / 贴纸 / 过场动画）', characters: {} };
  try { saved = { ...saved, ...JSON.parse(await readFile(output, 'utf8')) }; } catch { /* first run */ }
  saved.characters = {};

  let limited = false;
  async function api(params) {
    if (limited) throw new Error('paused after rate limit');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = new URL(endpoint);
        url.search = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
        const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'dsh-idol-theme/1.3 visual audit' } });
        if ([429, 567].includes(response.status)) { limited = true; throw new Error('HTTP ' + response.status + '; collection paused'); }
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data.error) throw new Error(data.error.code ?? 'api error');
        return data;
      } catch (error) {
        if (limited || attempt === 1) throw error;
        await sleep(3000);
      }
    }
  }

  const failures = [];
  for (let start = 0; start < roster.length; start += batchSize) {
    if (limited) break;
    const batch = roster.slice(start, start + batchSize);
    try {
      const data = await api({ action: 'query', prop: 'revisions', rvprop: 'content|ids', rvslots: 'main', titles: batch.map(person => person.page).join('|') });
      const pages = new Map((data.query?.pages ?? []).map(page => [page.title, page]));
      const wanted = new Set();
      for (const person of batch) {
        const page = pages.get(person.page);
        const text = page?.revisions?.[0]?.slots?.main?.content;
        if (!text) { failures.push(person.page + ': missing page'); continue; }
        const visual = parseVisual(text, stems.get(person.page));
        saved.characters[person.page] = { colour: visual.colour, stamps: visual.stamps, anims: visual.anims, revision: page.revisions[0].revid };
        for (const file of [...visual.stamps, ...visual.anims]) wanted.add(file.title);
      }
      const titles = [...wanted];
      const files = new Map();
      for (let offset = 0; offset < titles.length; offset += 50) {
        const info = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime', titles: titles.slice(offset, offset + 50).map(title => 'File:' + title).join('|') });
        for (const page of info.query?.pages ?? []) {
          const file = page.imageinfo?.[0];
          if (file?.url) files.set(page.title.replace(/^[^:]+:/, '').replaceAll(' ', '_'), { url: file.url, size: file.size, mime: file.mime });
        }
      }
      for (const entry of Object.values(saved.characters)) {
        const attach = list => (list ?? []).map(file => ({ ...file, ...(files.get(file.title.replaceAll(' ', '_')) ?? {}) })).filter(file => file.url);
        entry.stamps = attach(entry.stamps);
        entry.anims = attach(entry.anims);
      }
      console.log('batch ' + (start / batchSize + 1) + ': ' + batch.length + ' characters, failures ' + failures.length);
    } catch (error) {
      failures.push('batch ' + (start / batchSize + 1) + ': ' + error.message);
      if (limited) break;
    }
    await mkdir(directory, { recursive: true });
    await writeFile(output, JSON.stringify({ ...saved, updatedAt: new Date().toISOString() }, null, 2) + '\n');
    await sleep(gap);
  }
  await writeFile(output, JSON.stringify({ ...saved, updatedAt: new Date().toISOString() }, null, 2) + '\n');
  const entries = Object.values(saved.characters);
  const sizes = entries.flatMap(entry => entry.stamps ?? []).map(file => file.size).filter(Boolean);
  console.log(JSON.stringify({ characters: entries.length, withColour: entries.filter(entry => entry.colour).length, withStamps: entries.filter(entry => entry.stamps?.length).length, withAnims: entries.filter(entry => entry.anims?.length).length, medianStampKB: sizes.length ? Math.round(sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)] / 1024) : 0, limited, failures: failures.slice(0, 6) }, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await collect({ batchSize: Number(argument('--batch', '50')), gap: Number(argument('--gap', '2500')) });
}

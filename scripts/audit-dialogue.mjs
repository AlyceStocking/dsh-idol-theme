// Dialogue metadata only. One request per character; resumable and rate-limit aware.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const endpoint = 'https://wiki.biligame.com/imascg/api.php';
const directory = new URL('../research/roster/', import.meta.url);
const output = new URL('lines.json', directory);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

// Split a template body on top-level separators only; nested {{...}} and [[...]] stay intact.
export function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0, buffer = '';
  for (let index = 0; index < text.length; index++) {
    const pair = text.slice(index, index + 2);
    if (pair === '{{' || pair === '[[') { depth++; buffer += pair; index++; continue; }
    if (pair === '}}' || pair === ']]') { depth--; buffer += pair; index++; continue; }
    if (text[index] === separator && depth === 0) { parts.push(buffer); buffer = ''; continue; }
    buffer += text[index];
  }
  parts.push(buffer);
  return parts;
}

function templateBody(source, name) {
  const start = source.indexOf('{{' + name);
  if (start < 0) return null;
  let depth = 0;
  for (let index = start; index < source.length - 1; index++) {
    const pair = source.slice(index, index + 2);
    if (pair === '{{') { depth++; index++; continue; }
    if (pair === '}}') { depth--; index++; if (depth === 0) return source.slice(start + 2, index); }
  }
  return null;
}

function plain(text) {
  return text
    .replace(/\{\{UserName\}\}/g, '制作人')
    .replace(/\{\{[^{}]*\|[^{}]*\|([^{}]*)\}\}/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/'''?/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Scene order of Template:台词语音表格/Common. Position N maps to SCENE_KEYS[N-1].
export const SCENE_KEYS = [
  'morning', 'noon', 'night', 'stamina', 'story', 'colleague', 'event', 'gift', 'idle',
  'bed', 'aroma', 'doll', 'dresser', 'treadmill', 'stand',
  'pushStamina', 'pushFurniture', 'pushHarvest', 'pushBusiness',
];

// Common voice table: positional params hold "Japanese<br>{{font|...|<u>Chinese</u>}}".
// Position 1-19 are the labelled scenes; later params are furniture descriptions.
export function parseCommonDialogue(source) {
  const body = templateBody(source, '台词语音表格/Common');
  if (!body) return [];
  const lines = [];
  const positional = splitTopLevel(body, '|').slice(1).map(parameter => parameter.trim()).filter(raw => raw && !/^[A-Za-z][\w-]*\s*=/.test(raw)).slice(0, SCENE_KEYS.length);
  positional.forEach((raw, index) => {
    const segments = splitTopLevel(raw.replace(/<br\s*\/?>/gi, '|'), '|').map(part => part.trim()).filter(Boolean);
    const chinese = segments.find(part => /<u>[\s\S]*<\/u>/.test(part))?.match(/<u>([\s\S]*?)<\/u>/)?.[1] ?? segments.at(-1) ?? '';
    const text = plain(chinese);
    if (!text || text.length < 2 || text.length > 120) return;
    // (营业名) and (家具名) are filled in at runtime, so keep those lines.
    lines.push({ scene: SCENE_KEYS[index], text });
  });
  return lines;
}

async function collect({ ids = null, batchSize = 50, gap = 1500 } = {}) {
  const { roster } = JSON.parse(await readFile(new URL('index.json', directory), 'utf8'));
  let saved = { endpoint, source: 'BWiki 公共语音台词（{{台词语音表格/Common}}）', lines: {} };
  try { saved = { ...saved, ...JSON.parse(await readFile(output, 'utf8')) }; } catch { /* first run */ }

  let limited = false;
  async function api(params) {
    if (limited) throw new Error('paused after rate limit');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = new URL(endpoint);
        url.search = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
        const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'dsh-idol-theme/1.3 dialogue audit' } });
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

  const pending = roster.filter(person => !ids || ids.has(person.page));
  console.log('pages ' + pending.length + '; already recorded ' + Object.keys(saved.lines).length);
  const failures = [];
  const titles = person => person.page + '/公共语音台词';
  for (let start = 0; start < pending.length; start += batchSize) {
    if (limited) break;
    const batch = pending.slice(start, start + batchSize);
    try {
      const data = await api({ action: 'query', prop: 'revisions', rvprop: 'content|ids', rvslots: 'main', titles: batch.map(titles).join('|') });
      const pages = data.query?.pages ?? [];
      const byTitle = new Map(pages.map(page => [page.title, page]));
      for (const person of batch) {
        const page = byTitle.get(titles(person)) ?? byTitle.get(titles(person).replaceAll(' ', '_'));
        const revision = page?.revisions?.[0];
        const content = revision?.slots?.main?.content ?? revision?.slots?.main?.['*'];
        if (!page || page.missing || !content) { saved.lines[person.page] = saved.lines[person.page] ?? []; failures.push(person.page + ': missing page'); continue; }
        const lines = parseCommonDialogue(content);
        saved.lines[person.page] = lines.map(line => ({ scene: line.scene, text: line.text, revision: revision.revid }));
        if (!lines.length) failures.push(person.page + ': no recognizable dialogue');
      }
      console.log('batch ' + (start / batchSize + 1) + ': ' + pages.length + ' pages, failures ' + failures.length);
    } catch (error) {
      failures.push('batch ' + (start / batchSize + 1) + ': ' + error.message);
      if (limited) break;
    }
    await writeFile(output, JSON.stringify({ ...saved, updatedAt: new Date().toISOString() }, null, 2) + '\n');
    await sleep(gap);
  }
  await mkdir(directory, { recursive: true });
  await writeFile(output, JSON.stringify({ ...saved, updatedAt: new Date().toISOString() }, null, 2) + '\n');
  const withLines = Object.values(saved.lines).filter(list => list?.length).length;
  console.log(JSON.stringify({ recorded: Object.keys(saved.lines).length, withLines, total: roster.length, limited, failures: failures.slice(0, 10) }, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await collect({
    ids: argument('--ids', '') ? new Set(argument('--ids', '').split(',')) : null,
    batchSize: Number(argument('--batch', '50')),
    gap: Number(argument('--gap', '1500')),
  });
}

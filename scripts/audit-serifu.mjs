// Per-outfit dialogue from the wiki's "<idol>/台词列表" subpage. Batched, resumable, rate-limit aware.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const endpoint = 'https://wiki.biligame.com/imascg/api.php';
const directory = new URL('../research/roster/', import.meta.url);
const output = new URL('serifu.json', directory);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

function plain(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\{0\}/g, '制作人')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Each card block is "<div class=serifu id=cardserifuN><ul id=cardserifulistN><li>中文</li>...</ul>".
// The block number is the CGSS outfit number. Japanese originals are HTML comments and are dropped.
export function parseCardDialogue(source, { perOutfit = Infinity, maxLength = 400 } = {}) {
  const clean = source.replace(/<!--[\s\S]*?-->/g, '');
  const parts = clean.split(/id="cardserifu(\d+)"/);
  const blocks = {};
  const seen = new Set();
  for (let index = 1; index < parts.length; index += 2) {
    const outfit = parts[index];
    const body = parts[index + 1] ?? '';
    const items = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(match => plain(match[1]));
    const lines = [...new Set(items)].filter(text => text.length > 0 && text.length <= maxLength && !/[{}<>]/.test(text)).slice(0, perOutfit);
    if (!lines.length) continue;
    blocks[outfit] = lines;
    for (const line of lines) seen.add(line);
  }
  return blocks;
}

async function collect({ ids = null, batchSize = 50, gap = 2500 } = {}) {
  const { roster } = JSON.parse(await readFile(new URL('index.json', directory), 'utf8'));
  let saved = { endpoint, source: 'BWiki 台词列表（按服装）', blocks: {} };
  try { saved = { ...saved, ...JSON.parse(await readFile(output, 'utf8')) }; } catch { /* first run */ }

  let limited = false;
  async function api(params) {
    if (limited) throw new Error('paused after rate limit');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = new URL(endpoint);
        url.search = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
        const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'dsh-idol-theme/1.3 serifu audit' } });
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
  const failures = [];
  for (let start = 0; start < pending.length; start += batchSize) {
    if (limited) break;
    const batch = pending.slice(start, start + batchSize);
    try {
      const data = await api({ action: 'query', prop: 'revisions', rvprop: 'content|ids', rvslots: 'main', titles: batch.map(person => person.page + '/台词列表').join('|') });
      const pages = data.query?.pages ?? [];
      const byTitle = new Map(pages.map(page => [page.title, page]));
      for (const person of batch) {
        const page = byTitle.get(person.page + '/台词列表');
        const revision = page?.revisions?.[0];
        const text = revision?.slots?.main?.content ?? revision?.slots?.main?.['*'];
        if (!page || page.missing || !text) { failures.push(person.page + ': missing page'); continue; }
        const blocks = parseCardDialogue(text);
        saved.blocks[person.page] = Object.entries(blocks).map(([outfit, lines]) => ({ outfit, lines, revision: revision.revid }));
        if (!Object.keys(blocks).length) failures.push(person.page + ': no card dialogue');
      }
      console.log('batch ' + (start / batchSize + 1) + ': ' + pages.length + ' pages, failures ' + failures.length);
    } catch (error) {
      failures.push('batch ' + (start / batchSize + 1) + ': ' + error.message);
      if (limited) break;
    }
    await mkdir(directory, { recursive: true });
    await writeFile(output, JSON.stringify({ ...saved, updatedAt: new Date().toISOString() }, null, 2) + '\n');
    await sleep(gap);
  }
  await writeFile(output, JSON.stringify({ ...saved, updatedAt: new Date().toISOString() }, null, 2) + '\n');
  const withBlocks = Object.values(saved.blocks).filter(list => list?.length).length;
  console.log(JSON.stringify({ pages: Object.keys(saved.blocks).length, withBlocks, total: roster.length, limited, failures: failures.slice(0, 10) }, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await collect({
    ids: argument('--ids', '') ? new Set(argument('--ids', '').split(',')) : null,
    batchSize: Number(argument('--batch', '50')),
    gap: Number(argument('--gap', '2500')),
  });
}

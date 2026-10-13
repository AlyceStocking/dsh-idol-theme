// Read-only, bounded sample audit. Downloads metadata, never artwork or dialogue.
import { mkdir, writeFile } from 'node:fs/promises';

const endpoint = 'https://wiki.biligame.com/imascg/api.php';
const samples = [{ id: 'yukimi', page: '佐城雪美', stem: 'Yukimi' }, { id: 'arisu', page: '橘爱丽丝', stem: 'Arisu' }];
async function api(params) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ format: 'json', ...params });
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`BWiki HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}
function classify(title, stem) {
  for (const [kind, expression] of [
    ['signature', `^${stem}-sign\\.png$`],
    ['icon', `^CGSS-${stem}-icon-(\\d+)\\.png$`],
    ['petit', `^CGSS-${stem}-Petit-(\\d+)-(\\d+)\\.png$`],
    ['background', `^CGSS-${stem}-(N|R|SR|SSR)-(\\d+)(\\+)?\\.png$`],
    ['mobamas', `^CG-${stem}-(N|R|SR|SSR)-(\\d+)(\\+)?\\.jpe?g$`],
  ]) {
    const match = title.match(new RegExp(expression, 'i'));
    if (match) return { kind, ...(kind === 'petit' ? { outfit: Number(match[1]), pose: Number(match[2]) } : {}) };
  }
  return null;
}
const results = [];
for (const sample of samples) {
  const { parse } = await api({ action: 'parse', page: sample.page, prop: 'images|revid' });
  const selected = parse.images.map(title => ({ title, ...classify(title, sample.stem) })).filter(file => file.kind);
  const metadata = new Map();
  for (let start = 0; start < selected.length; start += 50) {
    const data = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime|sha1', titles: selected.slice(start, start + 50).map(file => `File:${file.title}`).join('|') });
    for (const page of Object.values(data.query.pages)) metadata.set(page.title.replace(/^[^:]+:/, '').replaceAll(' ', '_'), page.imageinfo?.[0] ?? null);
  }
  const files = selected.map(file => ({ ...file, info: metadata.get(file.title.replaceAll(' ', '_')) ?? null }));
  const counts = Object.fromEntries(['signature', 'icon', 'petit', 'background', 'mobamas'].map(kind => [kind, files.filter(file => file.kind === kind).length]));
  const sprites = files.filter(file => file.kind === 'petit');
  const outfits = [...new Set(sprites.map(file => file.outfit))].sort((a, b) => a - b).map(id => ({ id, poses: sprites.filter(file => file.outfit === id).map(file => file.pose).sort((a,b) => a-b) }));
  const result = { ...sample, pageId: parse.pageid, revision: parse.revid, totalPageImages: parse.images.length, counts, outfits, missing: files.filter(file => !file.info).map(file => file.title), spriteEncodedBytes: sprites.reduce((sum, file) => sum + (file.info?.size ?? 0), 0), spriteDecodedRgbaBytes: sprites.reduce((sum, file) => sum + (file.info ? file.info.width * file.info.height * 4 : 0), 0), files };
  results.push(result);
  const { files: omitted, ...summary } = result;
  console.log(JSON.stringify(summary, null, 2));
}
await mkdir(new URL('../research/', import.meta.url), { recursive: true });
const report = { checkedAt: new Date().toISOString(), endpoint, scope: 'Two character pages only; names selected from page image lists, URLs resolved through imageinfo. Metadata availability is not a CDN fetch or runtime rendering test.', samples: results };
if (process.argv.includes('--check-cdn')) {
  const checks = await Promise.all(results.map(async sample => {
    const file = sample.files.find(file => file.kind === 'petit');
    if (!file?.info?.url) return { character: sample.id, error: 'NoSprite' };
    const identity = { character: sample.id, title: file.title, url: file.info.url };
    try {
      const response = await fetch(file.info.url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      return { ...identity, status: response.status, contentType: response.headers.get('content-type') };
    } catch (error) { return { ...identity, error: error.name }; }
  }));
  report.cdnHeadChecks = { checkedAt: new Date().toISOString(), timeoutMs: 8000, scope: 'One sprite per character; no image bytes downloaded or decoded', checks };
  console.log(JSON.stringify(report.cdnHeadChecks, null, 2));
}
await writeFile(new URL('../research/bwiki-samples.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');

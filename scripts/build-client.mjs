import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/assets.js', import.meta.url), 'utf8');
const clientPath = new URL('../lib/client.js', import.meta.url);
const client = await readFile(clientPath, 'utf8');
const marker = /\t{3}\/\/ BEGIN YUKIMI_ASSETS[^\n]*\r?\n[\s\S]*?\t{3}\/\/ END YUKIMI_ASSETS/;
if (!marker.test(client)) throw new Error('Missing client asset markers');
const assets = source.replace(/^\/\/[^\n]*\n/, '').replace(/^export /gm, '').trim().split(/\r?\n/).map(line => line.trim() ? '\t\t\t' + line : '').join('\n');
const generated = client.replace(marker, '// PLACEHOLDER');
const result = generated.replace('// PLACEHOLDER', '\t\t\t// BEGIN YUKIMI_ASSETS (generated from lib/assets.js)\n' + assets + '\n\t\t\t// END YUKIMI_ASSETS');
if (process.argv.includes('--check')) {
  if (result !== client) throw new Error('Client assets are stale. Run npm run build:client.');
} else await writeFile(clientPath, result);

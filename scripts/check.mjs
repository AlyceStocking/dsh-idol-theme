import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

for (const directory of ['lib', 'desktop', 'scripts']) {
  for (const file of await readdir(new URL(`../${directory}/`, import.meta.url))) {
    if (!/\.(js|cjs|mjs)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', `${directory}/${file}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
const freshness = spawnSync(process.execPath, ['scripts/build-client.mjs', '--check'], { stdio: 'inherit' });
process.exit(freshness.status || 0);

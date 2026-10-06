import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { packager } from '@electron/packager';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const stage = path.join(root, 'build', 'desktop-app');
await mkdir(path.join(stage, 'desktop'), { recursive: true });
await mkdir(path.join(stage, 'lib'), { recursive: true });
await cp(path.join(root, 'desktop'), path.join(stage, 'desktop'), { recursive: true, filter: source => !source.startsWith(path.join(root, 'desktop', 'runtime')) });
await cp(path.join(root, 'lib', 'assets.js'), path.join(stage, 'lib', 'assets.js'));
await writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: 'yukimi-desktop', version: '1.2.0', private: true, type: 'module', main: 'desktop/main.cjs' }, null, 2));
const require = createRequire(import.meta.url);
const zipArgument = process.argv.indexOf('--electron-zip-dir');
const pristineElectron = path.join(root, 'build', 'desktop-electron-pristine.exe');
const paths = await packager({
  dir: stage, out: path.join(root, 'build', 'packaged'), name: 'Yukimi Desktop',
  platform: 'win32', arch: 'x64', electronVersion: require('electron/package.json').version,
  ...(zipArgument >= 0 ? { electronZipDir: path.resolve(process.argv[zipArgument + 1]) } : {}),
  asar: true, overwrite: true, prune: true,
  afterExtract: [async ({ buildPath }) => { await cp(path.join(buildPath, 'electron.exe'), pristineElectron); }],
});
// Packager 20 always edits PE resources when a name/version is supplied. The
// rewritten 44.5.1 executable fails Windows CreateProcess in our validation;
// preserve the released binary while app.asar supplies our title and code.
await cp(pristineElectron, path.join(paths[0], 'Yukimi Desktop.exe'));
await cp(paths[0], path.join(root, 'desktop', 'runtime', 'win32-x64'), { recursive: true });
console.log('Packaged desktop/runtime/win32-x64/Yukimi Desktop.exe');

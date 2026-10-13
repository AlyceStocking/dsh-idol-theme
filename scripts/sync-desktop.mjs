import { cp, lstat, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const managedNames = ['lib', 'desktop', 'package.json', 'cordis.patch.yml'];
export const requiredSourceFiles = [
  'package.json', 'cordis.patch.yml',
  'lib/index.js', 'lib/client.js', 'lib/assets.js', 'lib/characters.js', 'lib/desktop-state.js', 'lib/desktop-process.js',
  'desktop/main.cjs', 'desktop/preload.cjs', 'desktop/index.html', 'desktop/style.css', 'desktop/renderer.js', 'desktop/logic.js', 'desktop/sprite-cache.js',
  ...[
    'Yukimi Desktop.exe', 'resources/app.asar', 'resources.pak', 'icudtl.dat', 'ffmpeg.dll',
    'chrome_100_percent.pak', 'chrome_200_percent.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin',
    'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'vulkan-1.dll', 'vk_swiftshader.dll',
    'vk_swiftshader_icd.json', 'version', 'locales/en-US.pak', 'locales/zh-CN.pak',
  ].map(name => `desktop/runtime/win32-x64/${name}`),
];

const defaultHome = () => path.resolve(process.env.DSH_HOME || path.join(homedir(), '.dsh'));
const installedPath = home => path.join(home, 'profiles', 'desktop', 'node_modules', 'dsh-yukimi-theme');
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const within = (base, candidate) => {
  const relative = path.relative(base, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};

async function exists(candidate) {
  try { await lstat(candidate); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function regularTree(candidate) {
  const info = await lstat(candidate);
  if (info.isSymbolicLink()) throw new Error(`Refusing linked plugin content: ${candidate}`);
  if (info.isDirectory()) {
    for (const entry of await readdir(candidate)) await regularTree(path.join(candidate, entry));
  } else if (!info.isFile()) throw new Error(`Unsupported plugin content: ${candidate}`);
}

async function validateSource(root) {
  const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (metadata.name !== 'dsh-yukimi-theme') throw new Error('Source is not the Yukimi plugin.');
  for (const relative of requiredSourceFiles) {
    const file = path.join(root, relative);
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty plugin component: ${file}`);
  }
  for (const name of managedNames) await regularTree(path.join(root, name));
}

async function installedRoot(target, verifyPackage = true) {
  if ((await lstat(target)).isSymbolicLink()) throw new Error('Refusing to replace a linked installed plugin.');
  const resolved = await realpath(target);
  if (verifyPackage) {
    const installed = JSON.parse(await readFile(path.join(resolved, 'package.json'), 'utf8'));
    if (installed.name !== 'dsh-yukimi-theme') throw new Error('Target is not the installed Yukimi plugin.');
  }
  return resolved;
}

async function checkedEntry(target, name) {
  if (!managedNames.includes(name)) throw new Error(`Unmanaged plugin entry: ${name}`);
  const candidate = path.resolve(target, name);
  const currentRoot = await realpath(target);
  if (!samePath(currentRoot, target) || !within(target, candidate)) throw new Error(`Unsafe installed plugin path: ${candidate}`);
  if (await exists(candidate)) {
    if ((await lstat(candidate)).isSymbolicLink() || !within(target, await realpath(candidate))) throw new Error(`Plugin entry escapes the installed directory: ${candidate}`);
  }
  return candidate;
}

async function replaceEntry(target, name, source, copy) {
  const candidate = await checkedEntry(target, name);
  // Each recursive removal uses one explicit, resolved child of this installed plugin.
  await rm(candidate, { recursive: true, force: true });
  if (source) await copy(source, candidate, { recursive: true, force: false, errorOnExist: true });
}

async function restoreEntries(target, backup, entries, copy) {
  const failures = [];
  for (const entry of [...entries].reverse()) {
    try { await replaceEntry(target, entry.name, entry.existed ? path.join(backup, entry.name) : null, copy); }
    catch (error) { failures.push(new Error(`Could not restore ${entry.name}: ${error.message}`, { cause: error })); }
  }
  return failures;
}

export async function restoreBackup({ backup, dshHome = defaultHome(), copy = cp } = {}) {
  const target = await installedRoot(installedPath(path.resolve(dshHome)), false);
  const resolvedBackup = await realpath(backup);
  const manifest = JSON.parse(await readFile(path.join(resolvedBackup, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !samePath(path.resolve(manifest.target ?? ''), target) || samePath(target, resolvedBackup) || within(target, resolvedBackup)) throw new Error('Backup does not belong to this installed plugin.');
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== managedNames.length || new Set(manifest.entries.map(entry => entry.name)).size !== managedNames.length || !manifest.entries.every(entry => managedNames.includes(entry.name) && typeof entry.existed === 'boolean')) throw new Error('Invalid backup absence manifest.');
  for (const entry of manifest.entries) if (entry.existed) await regularTree(path.join(resolvedBackup, entry.name));
  const failures = await restoreEntries(target, resolvedBackup, manifest.entries, copy);
  if (failures.length) throw new AggregateError(failures, `Rollback incomplete. Preserve backup: ${resolvedBackup}`);
  return { target, backup: resolvedBackup };
}

export async function syncDesktop({ root = defaultRoot, dshHome = defaultHome(), copy = cp } = {}) {
  root = await realpath(root);
  dshHome = path.resolve(dshHome);
  await validateSource(root);
  const target = await installedRoot(installedPath(dshHome));
  if (samePath(root, target) || within(root, target) || within(target, root)) throw new Error('Source and installed plugin directories must be separate.');
  for (const name of managedNames) if (await exists(path.join(target, name))) await regularTree(path.join(target, name));
  const backup = path.join(dshHome, 'yukimi-desktop', 'backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  await mkdir(backup, { recursive: true });
  const resolvedBackup = await realpath(backup);
  if (within(target, resolvedBackup) || within(root, resolvedBackup)) throw new Error('Backup directory must be outside the plugin.');
  const entries = [];
  for (const name of managedNames) {
    const existed = await exists(path.join(target, name));
    if (existed) await copy(path.join(target, name), path.join(resolvedBackup, name), { recursive: true, force: false, errorOnExist: true });
    entries.push({ name, existed });
  }
  const manifest = { version: 1, target, entries, createdAt: new Date().toISOString(), status: 'backed-up' };
  const manifestPath = path.join(resolvedBackup, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const attempted = [];
  try {
    for (const entry of entries) {
      attempted.push(entry);
      await replaceEntry(target, entry.name, path.join(root, entry.name), copy);
    }
    await validateSource(target);
    manifest.status = 'synced';
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  } catch (error) {
    const failures = await restoreEntries(target, resolvedBackup, attempted, copy);
    manifest.status = failures.length ? 'rollback-incomplete' : 'rolled-back';
    manifest.error = error.message;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2)).catch(() => {});
    if (failures.length) throw new AggregateError([error, ...failures], `Sync failed and rollback is incomplete. Preserve backup: ${resolvedBackup}`);
    throw new Error(`Sync failed; the original plugin was restored. Backup: ${resolvedBackup}. ${error.message}`, { cause: error });
  }
  return { target, backup: resolvedBackup };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.platform !== 'win32') throw new Error('This development sync supports Windows only.');
  const restoreIndex = process.argv.indexOf('--restore-backup');
  if (restoreIndex >= 0 && !process.argv[restoreIndex + 1]) throw new Error('--restore-backup requires the backup directory.');
  const result = restoreIndex >= 0 ? await restoreBackup({ backup: process.argv[restoreIndex + 1] }) : await syncDesktop();
  console.log(`${restoreIndex >= 0 ? 'Plugin restored' : 'Plugin synced'}: ${result.target}\nBackup: ${result.backup}\nEnable dsh-yukimi-theme on the Plugins page to reload it.`);
}

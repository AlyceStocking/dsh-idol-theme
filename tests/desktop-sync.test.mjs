import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { requiredSourceFiles, restoreBackup, syncDesktop } from '../scripts/sync-desktop.mjs';

async function fixture(t, desktop = false) {
  const base = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(base, 'yukimi-sync-test-'));
  t.after(async () => {
    const resolved = await realpath(directory);
    assert.equal(path.dirname(resolved), base);
    assert.ok(path.basename(resolved).startsWith('yukimi-sync-test-'));
    await rm(resolved, { recursive: true, force: true });
  });
  const root = path.join(directory, 'source'), dshHome = path.join(directory, 'dsh');
  const target = path.join(dshHome, 'profiles', 'desktop', 'node_modules', 'dsh-idol-theme');
  for (const relative of requiredSourceFiles) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, relative === 'package.json' ? JSON.stringify({ name: 'dsh-idol-theme', version: 'new' }) : `new:${relative}`);
  }
  await mkdir(path.join(target, 'lib'), { recursive: true });
  await writeFile(path.join(target, 'package.json'), JSON.stringify({ name: 'dsh-idol-theme', version: 'old' }));
  await writeFile(path.join(target, 'cordis.patch.yml'), 'old patch');
  await writeFile(path.join(target, 'lib', 'index.js'), 'old Host');
  await writeFile(path.join(target, 'lib', 'legacy.js'), 'old plugin file');
  await writeFile(path.join(target, 'README.md'), 'untouched documentation');
  if (desktop) {
    await mkdir(path.join(target, 'desktop'), { recursive: true });
    await writeFile(path.join(target, 'desktop', 'main.cjs'), 'old desktop');
  }
  return { directory, root, dshHome, target };
}

async function snapshot(directory) {
  const entries = {};
  async function visit(current, relative = '') {
    for (const child of await readdir(current, { withFileTypes: true })) {
      const file = path.join(current, child.name), key = path.join(relative, child.name);
      if (child.isDirectory()) await visit(file, key);
      else entries[key] = (await readFile(file)).toString('base64');
    }
  }
  await visit(directory);
  return entries;
}

test('sync backs up originals and replaces managed directories without retaining stale files', async t => {
  const f = await fixture(t);
  const original = await snapshot(f.target);
  const result = await syncDesktop(f);
  const manifest = JSON.parse(await readFile(path.join(result.backup, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'synced');
  assert.equal(manifest.entries.find(entry => entry.name === 'desktop').existed, false);
  assert.equal(await readFile(path.join(result.backup, 'lib', 'index.js'), 'utf8'), 'old Host');
  assert.equal(await readFile(path.join(f.target, 'lib', 'index.js'), 'utf8'), 'new:lib/index.js');
  await assert.rejects(readFile(path.join(f.target, 'lib', 'legacy.js')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(f.target, 'README.md'), 'utf8'), 'untouched documentation');
  await restoreBackup({ backup: result.backup, dshHome: f.dshHome });
  assert.deepEqual(await snapshot(f.target), original);
});

test('an incomplete runtime is rejected before backup or installed files are changed', async t => {
  const f = await fixture(t);
  const original = await snapshot(f.target);
  await unlink(path.join(f.root, 'desktop', 'runtime', 'win32-x64', 'resources', 'app.asar'));
  await assert.rejects(syncDesktop(f), { code: 'ENOENT' });
  assert.deepEqual(await snapshot(f.target), original);
  await assert.rejects(readdir(path.join(f.dshHome, 'idol-desktop', 'backups')), { code: 'ENOENT' });
});

test('failure after a partial desktop copy restores original files and removes a newly added desktop directory', async t => {
  const f = await fixture(t);
  const original = await snapshot(f.target);
  let failed = false;
  const copy = async (source, destination, options) => {
    if (!failed && destination === path.join(f.target, 'desktop')) {
      failed = true;
      await mkdir(destination, { recursive: true });
      await writeFile(path.join(destination, 'partial.cjs'), 'partial copy');
      throw new Error('Simulated disk failure');
    }
    return cp(source, destination, options);
  };
  await assert.rejects(syncDesktop({ ...f, copy }), /original plugin was restored.*Simulated disk failure/);
  assert.deepEqual(await snapshot(f.target), original);
  await assert.rejects(readdir(path.join(f.target, 'desktop')), { code: 'ENOENT' });
  const backups = path.join(f.dshHome, 'idol-desktop', 'backups');
  const backup = path.join(backups, (await readdir(backups))[0]);
  assert.equal(JSON.parse(await readFile(path.join(backup, 'manifest.json'), 'utf8')).status, 'rolled-back');
});

test('failure preserves an existing desktop directory and backup failures never mutate the installation', async t => {
  const f = await fixture(t, true);
  const original = await snapshot(f.target);
  let failed = false;
  await assert.rejects(syncDesktop({ ...f, copy: async (source, destination, options) => {
    if (!failed && destination === path.join(f.target, 'package.json')) { failed = true; throw new Error('Simulated file lock'); }
    return cp(source, destination, options);
  } }), /original plugin was restored/);
  assert.deepEqual(await snapshot(f.target), original);
  await assert.rejects(syncDesktop({ ...f, copy: async () => { throw new Error('Cannot make backup'); } }), /Cannot make backup/);
  assert.deepEqual(await snapshot(f.target), original);
});

test('linked source content and a backup for another target are rejected without changing installed files', async t => {
  const f = await fixture(t);
  const original = await snapshot(f.target);
  const outside = path.join(f.directory, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'keep.txt'), 'outside files stay untouched');
  await symlink(outside, path.join(f.root, 'lib', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(syncDesktop(f), /Refusing linked plugin content/);
  assert.deepEqual(await snapshot(f.target), original);
  await unlink(path.join(f.root, 'lib', 'linked'));
  const result = await syncDesktop(f);
  const manifestPath = path.join(result.backup, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.target = outside;
  await writeFile(manifestPath, JSON.stringify(manifest));
  const synced = await snapshot(f.target);
  await assert.rejects(restoreBackup({ backup: result.backup, dshHome: f.dshHome }), /does not belong/);
  assert.deepEqual(await snapshot(f.target), synced);
  assert.equal(await readFile(path.join(outside, 'keep.txt'), 'utf8'), 'outside files stay untouched');
});

test('incomplete rollback reports the preserved backup and supports a later explicit restore', async t => {
  const f = await fixture(t);
  const original = await snapshot(f.target);
  let failed = false;
  await assert.rejects(syncDesktop({ ...f, copy: async (source, destination, options) => {
    if (!failed && destination === path.join(f.target, 'desktop')) { failed = true; throw new Error('Install failed'); }
    if (failed && destination === path.join(f.target, 'lib') && source.includes(`${path.sep}backups${path.sep}`)) throw new Error('Restore temporarily blocked');
    return cp(source, destination, options);
  } }), error => error instanceof AggregateError && /rollback is incomplete.*Preserve backup/.test(error.message));
  const backups = path.join(f.dshHome, 'idol-desktop', 'backups');
  const backup = path.join(backups, (await readdir(backups))[0]);
  assert.equal(JSON.parse(await readFile(path.join(backup, 'manifest.json'), 'utf8')).status, 'rollback-incomplete');
  await restoreBackup({ backup, dshHome: f.dshHome });
  assert.deepEqual(await snapshot(f.target), original);
});

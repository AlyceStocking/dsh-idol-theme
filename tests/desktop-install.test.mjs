import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createDesktopBundle, installDesktopPackage } from '../scripts/install-desktop.mjs';
import { requiredSourceFiles } from '../scripts/sync-desktop.mjs';

const shimText = '@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"%~dp0..\\..\\..\\..\\DeepSeek Harness.exe" --expose-internals "%~dp0..\\..\\..\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh-desktop-host\\lib\\cli.js" %*\r\nexit /b %errorlevel%\r\n';
const docs = ['README.md', 'README.en.md', 'LICENSE'];

async function fixture(t) {
  const base = await realpath(tmpdir()), directory = await mkdtemp(path.join(base, 'yukimi-install-test-'));
  t.after(async () => {
    const resolved = await realpath(directory);
    assert.equal(path.dirname(resolved), base);
    assert.ok(path.basename(resolved).startsWith('yukimi-install-test-'));
    await rm(resolved, { recursive: true, force: true });
  });
  const root = path.join(directory, 'source'), dshHome = path.join(directory, 'dsh home & tools');
  const metadata = { name: 'dsh-idol-theme', version: '1.2.0-desktop.2', type: 'module', files: ['lib', 'desktop', 'cordis.patch.yml', ...docs], dsh: { bundle: { patch: './cordis.patch.yml' } } };
  for (const relative of [...requiredSourceFiles, ...docs]) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, relative === 'package.json' ? JSON.stringify(metadata) : `release:${relative}`);
  }
  await writeFile(path.join(root, '.gitignore'), 'desktop/runtime/\nnode_modules/\n');
  for (const relative of ['node_modules/unrelated/index.js', 'vllm-ascend/private.txt', 'lib/node_modules/unrelated.js', 'desktop/.gitignore']) {
    const file = path.join(root, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, 'must not ship');
  }
  const profile = path.join(dshHome, 'profiles', 'desktop', 'package.json');
  await mkdir(path.dirname(profile), { recursive: true });
  await writeFile(profile, '{"dependencies":{"dsh-idol-theme":"github:example/original"}}');
  return { directory, root, dshHome, profile };
}

async function fileList(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await fileList(directory, name));
    else files.push(name);
  }
  return files.sort();
}

// Small deterministic USTAR fixtures let the installer validate real compressed
// archive bytes without npm, Electron, a package manager or a live DSH profile.
async function packFixture({ directory, destination }, { omit, observed } = {}) {
  const files = await fileList(directory), chunks = [];
  observed?.push({ directory, destination, files });
  for (const name of files.filter(file => file !== omit)) {
    const data = await readFile(path.join(directory, name)), header = Buffer.alloc(512);
    header.write(`package/${name}`, 0, 100, 'utf8');
    header.write('0000644\0', 100, 'ascii'); header.write('0000000\0', 108, 'ascii'); header.write('0000000\0', 116, 'ascii');
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
    header.write('00000000000\0', 136, 'ascii'); header.fill(32, 148, 156); header.write('0', 156, 'ascii');
    header.write('ustar\0', 257, 'ascii'); header.write('00', 263, 'ascii');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  const archive = path.join(destination, 'fixture release.tgz');
  await writeFile(archive, gzipSync(Buffer.concat(chunks)));
  return { archive, files };
}

async function desktopShim(f) {
  const app = path.join(f.directory, 'Harness & Preview'), dshCli = path.join(app, 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd');
  await mkdir(path.dirname(dshCli), { recursive: true });
  await writeFile(dshCli, shimText);
  await writeFile(path.join(app, 'DeepSeek Harness.exe'), 'test carrier, never executed');
  await writeFile(path.join(app, 'resources', 'app.asar'), 'test archive, never executed');
  return { app, dshCli };
}

test('missing runtime fails before packing or invoking installation and leaves the profile unchanged', async t => {
  const f = await fixture(t), before = await readFile(f.profile, 'utf8');
  await unlink(path.join(f.root, 'desktop', 'runtime', 'win32-x64', 'resources', 'app.asar'));
  let packed = false, ran = false;
  await assert.rejects(installDesktopPackage({ ...f, pack() { packed = true; }, run() { ran = true; } }), { code: 'ENOENT' });
  assert.equal(packed, false); assert.equal(ran, false);
  assert.equal(await readFile(f.profile, 'utf8'), before);
  await assert.rejects(readdir(path.join(f.dshHome, 'idol-desktop', 'packages')), { code: 'ENOENT' });
});

test('release staging includes the complete runtime and excludes ignored files, dependencies and unrelated work', async t => {
  const f = await fixture(t), observed = [];
  const result = await createDesktopBundle({ ...f, pack: options => packFixture(options, { observed }) });
  assert.equal(observed.length, 1);
  for (const relative of requiredSourceFiles) assert.ok(observed[0].files.includes(relative), relative);
  assert.ok(observed[0].files.every(name => !name.split('/').some(part => ['.gitignore', 'node_modules', 'vllm-ascend'].includes(part))));
  assert.equal(path.dirname(result.archive), path.join(f.dshHome, 'idol-desktop', 'packages'));
  assert.match(path.basename(result.archive), new RegExp(`-${result.sha256}\\.tgz$`));
  assert.ok((await readFile(result.archive)).length > 0);
  assert.equal(result.reused, false);
});

test('archive bytes must include runtime even when the pack report claims every file is present', async t => {
  const f = await fixture(t), missing = 'desktop/runtime/win32-x64/resources/app.asar';
  await assert.rejects(createDesktopBundle({ ...f, pack: options => packFixture(options, { omit: missing }) }), /Archive is missing required component: desktop\/runtime\/win32-x64\/resources\/app.asar/);
  await assert.rejects(readdir(path.join(f.dshHome, 'idol-desktop', 'packages')), { code: 'ENOENT' });
});

test('a broken compressed archive rejects cleanly without installing or changing the profile', async t => {
  const f = await fixture(t), before = await readFile(f.profile, 'utf8');
  await assert.rejects(installDesktopPackage({ ...f, pack: async options => {
    const packed = await packFixture(options);
    await writeFile(packed.archive, Buffer.from([31, 139, 8]));
    return packed;
  }, run() { assert.fail('a malformed archive must not reach installation'); } }), /unexpected end of file/);
  assert.equal(await readFile(f.profile, 'utf8'), before);
  await assert.rejects(readdir(path.join(f.dshHome, 'idol-desktop', 'packages')), { code: 'ENOENT' });
});

test('a staging pack failure never invokes installation or changes the profile', async t => {
  const f = await fixture(t), before = await readFile(f.profile, 'utf8');
  await assert.rejects(installDesktopPackage({ ...f, pack: async () => { throw new Error('Simulated pack failure'); }, run() { assert.fail('a failed pack must not reach installation'); } }), /Simulated pack failure/);
  assert.equal(await readFile(f.profile, 'utf8'), before);
  await assert.rejects(readdir(path.join(f.dshHome, 'idol-desktop', 'packages')), { code: 'ENOENT' });
});

test('content-addressed packages reuse identical bytes and never overwrite an older or corrupted package', async t => {
  const f = await fixture(t), options = { ...f, pack: packFixture };
  const first = await createDesktopBundle(options), original = await readFile(first.archive);
  const same = await createDesktopBundle(options);
  assert.equal(same.archive, first.archive); assert.equal(same.reused, true);
  await writeFile(path.join(f.root, 'README.md'), 'a different release');
  const second = await createDesktopBundle(options);
  assert.notEqual(second.archive, first.archive);
  assert.deepEqual(await readFile(first.archive), original);
  await writeFile(second.archive, 'existing package must not be overwritten');
  await assert.rejects(createDesktopBundle(options), /Refusing to overwrite a different existing package/);
  assert.equal(await readFile(second.archive, 'utf8'), 'existing package must not be overwritten');
});

test('bundle-only creates a reviewable package without requiring a Desktop launcher or running DSH', async t => {
  const f = await fixture(t);
  const result = await installDesktopPackage({ ...f, pack: packFixture, bundleOnly: true, dshCli: 'missing.cmd', run() { assert.fail('bundle-only must not invoke DSH'); } });
  assert.equal(result.installed, false);
  assert.ok(path.isAbsolute(result.archive));
});

test('installation translates the official Desktop shim into executable arguments without a command shell', async t => {
  const f = await fixture(t), { app, dshCli } = await desktopShim(f), calls = [];
  const before = await readFile(f.profile, 'utf8');
  const result = await installDesktopPackage({ ...f, dshCli, pack: packFixture, run: async invocation => { calls.push(invocation); return { exitCode: 0 }; } });
  assert.equal(result.installed, true); assert.equal(result.restartRequired, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, path.join(app, 'DeepSeek Harness.exe'));
  assert.deepEqual(calls[0].args, ['--expose-internals', path.join(app, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js'), 'plugin', '--profile', 'desktop', 'add', result.archive]);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.env.DSH_HOME, f.dshHome);
  assert.equal(calls[0].options.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(await readFile(f.profile, 'utf8'), before, 'the test runner must not edit even its dummy profile');
});

test('an unrecognized command shim is rejected before execution', async t => {
  const f = await fixture(t), { dshCli } = await desktopShim(f);
  await writeFile(dshCli, `${shimText}echo unexpected command\r\n`);
  await assert.rejects(installDesktopPackage({ ...f, dshCli, pack: packFixture, run() { assert.fail('unrecognized shims must not execute'); } }), /Unrecognized Desktop dsh.cmd/);
});

test('a failed official installation preserves its immutable package for retry', async t => {
  const f = await fixture(t), { dshCli } = await desktopShim(f);
  await assert.rejects(installDesktopPackage({ ...f, dshCli, pack: packFixture, run: async () => ({ exitCode: 1 }) }), /installation failed \(1\).*immutable package remains/);
  assert.equal((await readdir(path.join(f.dshHome, 'idol-desktop', 'packages'))).length, 1);
});

test('linked source content is refused before staging or touching the installation', async t => {
  const f = await fixture(t), outside = path.join(f.directory, 'outside');
  await mkdir(outside); await writeFile(path.join(outside, 'keep.txt'), 'outside');
  await symlink(outside, path.join(f.root, 'lib', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(createDesktopBundle({ ...f, pack() { assert.fail('linked source must not reach the packer'); } }), /Refusing linked release content/);
  assert.equal(await readFile(path.join(outside, 'keep.txt'), 'utf8'), 'outside');
});

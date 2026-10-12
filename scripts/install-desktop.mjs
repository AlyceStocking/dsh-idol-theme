import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createGunzip } from 'node:zlib';
import { requiredSourceFiles } from './sync-desktop.mjs';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultHome = () => path.resolve(process.env.DSH_HOME || path.join(homedir(), '.dsh'));
const releaseNames = ['lib', 'desktop', 'package.json', 'cordis.patch.yml', 'README.md', 'README.en.md', 'LICENSE'];
const excluded = new Set(['node_modules', '.git', '.gitignore', '.npmignore']);
const requiredArchiveFiles = [...requiredSourceFiles, 'README.md', 'README.en.md', 'LICENSE'];
const within = (base, candidate) => {
  const relative = path.relative(base, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

async function regularTree(candidate) {
  const info = await lstat(candidate);
  if (info.isSymbolicLink()) throw new Error(`Refusing linked release content: ${candidate}`);
  if (info.isDirectory()) {
    for (const name of await readdir(candidate)) if (!excluded.has(name)) await regularTree(path.join(candidate, name));
  } else if (!info.isFile()) throw new Error(`Unsupported release content: ${candidate}`);
}

async function regularDirectory(directory) {
  await mkdir(directory, { recursive: true });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Refusing linked release directory: ${directory}`);
  return realpath(directory);
}

async function validateSource(root) {
  for (const name of releaseNames) await regularTree(path.join(root, name));
  const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (metadata.name !== 'dsh-yukimi-theme' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(metadata.version ?? '')) throw new Error('Source is not a versioned Yukimi plugin.');
  if (metadata.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('Source does not declare the Yukimi bundle patch.');
  for (const relative of requiredArchiveFiles) {
    const info = await lstat(path.join(root, relative));
    if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty release component: ${relative}`);
  }
  return metadata;
}

function execute({ executable, args, options }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, shell: false, ...options });
    let stdout = '', stderr = '';
    child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', chunk => { stdout = (stdout + chunk).slice(-1024 * 1024); });
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk).slice(-16384); });
    child.once('error', reject);
    child.once('close', exitCode => resolve({ exitCode, stdout, stderr }));
  });
}

async function npmPack({ directory, destination }) {
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!path.isAbsolute(npmCli) || path.basename(npmCli) !== 'npm-cli.js' || !(await lstat(npmCli)).isFile()) throw new Error('Run with npm run desktop:install, or install npm beside Node.js.');
  const result = await execute({ executable: process.execPath, args: [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', destination], options: { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] } });
  if (result.exitCode !== 0) throw new Error(`npm pack failed: ${result.stderr}`);
  const reports = JSON.parse(result.stdout);
  if (!Array.isArray(reports) || reports.length !== 1 || !reports[0].filename || path.basename(reports[0].filename) !== reports[0].filename || !Array.isArray(reports[0].files)) throw new Error('Invalid npm pack report.');
  return { archive: path.join(destination, reports[0].filename), files: reports[0].files.map(file => file.path) };
}

function requireFiles(files) {
  for (const required of requiredArchiveFiles) if (!files.has(required)) throw new Error(`Archive is missing required component: ${required}`);
}

// Read tar headers only; Electron file bodies stream past without being extracted
// or retained in memory. npm uses regular USTAR entries with optional PAX paths.
async function verifyArchive(archive) {
  const files = new Set();
  let header = Buffer.alloc(0), remaining = 0, dataSize = 0, extension = '', extensionData = [], extensionSize = 0, nextPath, ended = false;
  const string = value => value.toString('utf8').replace(/\0.*$/su, '');
  function finishExtension() {
    if (!extension) return;
    const data = Buffer.concat(extensionData);
    let offset = 0;
    while (offset < data.length) {
      const space = data.indexOf(32, offset), length = Number(data.subarray(offset, space).toString('ascii'));
      if (space < offset || !Number.isSafeInteger(length) || length <= space - offset + 1 || offset + length > data.length || data[offset + length - 1] !== 10) throw new Error('Invalid PAX header.');
      const record = data.subarray(space + 1, offset + length - 1).toString('utf8');
      if (record.startsWith('path=')) {
        if (extension !== 'x') throw new Error('Global PAX paths are unsupported.');
        nextPath = record.slice(5);
      }
      offset += length;
    }
    extension = ''; extensionData = []; extensionSize = 0;
  }
  const input = createReadStream(archive), decompressed = createGunzip();
  // pipe() alone does not forward a file read error to the async consumer.
  input.on('error', error => decompressed.destroy(error));
  input.pipe(decompressed);
  try {
  for await (const chunk of decompressed) {
    let offset = 0;
    while (offset < chunk.length) {
      if (ended) {
        if (chunk.subarray(offset).some(byte => byte !== 0)) throw new Error('Unexpected data after tar terminator.');
        break;
      }
      if (remaining) {
        const length = Math.min(remaining, chunk.length - offset);
        if (extension && extensionSize < dataSize) {
          const piece = chunk.subarray(offset, offset + Math.min(length, dataSize - extensionSize));
          extensionData.push(piece); extensionSize += piece.length;
        }
        offset += length; remaining -= length;
        if (!remaining) finishExtension();
        continue;
      }
      const length = Math.min(512 - header.length, chunk.length - offset);
      header = Buffer.concat([header, chunk.subarray(offset, offset + length)]); offset += length;
      if (header.length < 512) continue;
      if (header.every(byte => byte === 0)) { ended = true; header = Buffer.alloc(0); continue; }
      const expected = Number.parseInt(string(header.subarray(148, 156)).trim(), 8);
      const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
      dataSize = Number.parseInt(string(header.subarray(124, 136)).trim(), 8);
      if (expected !== checksum || !Number.isSafeInteger(dataSize) || dataSize < 0) throw new Error('Invalid tar header.');
      const type = string(header.subarray(156, 157));
      const prefix = string(header.subarray(345, 500));
      const name = nextPath ?? (prefix ? `${prefix}/` : '') + string(header.subarray(0, 100));
      remaining = Math.ceil(dataSize / 512) * 512;
      header = Buffer.alloc(0);
      if (type === 'x' || type === 'g') {
        if (dataSize > 65536) throw new Error('Oversized PAX header.');
        extension = type; extensionData = []; extensionSize = 0;
        if (!remaining) finishExtension();
        continue;
      }
      nextPath = undefined;
      if (!['', '0', '5'].includes(type)) throw new Error(`Unsupported tar entry: ${name}`);
      const parts = name.replace(/\/$/u, '').split('/');
      if (parts[0] !== 'package' || parts.some(part => !part || part === '.' || part === '..' || /[\\\u0000-\u001f]/u.test(part)) || parts.some(part => excluded.has(part))) throw new Error(`Unsafe tar entry: ${name}`);
      const relative = parts.slice(1).join('/');
      if (relative && !['lib', 'desktop'].includes(parts[1]) && !releaseNames.includes(relative)) throw new Error(`Unexpected release entry: ${relative}`);
      if (type !== '5') {
        if (!relative || files.has(relative)) throw new Error(`Duplicate or invalid tar file: ${name}`);
        if (requiredArchiveFiles.includes(relative) && !dataSize) throw new Error(`Empty archive component: ${relative}`);
        files.add(relative);
      }
    }
  }
  } finally { input.destroy(); decompressed.destroy(); }
  if (!ended || remaining || header.length) throw new Error('Truncated tar archive.');
  requireFiles(files);
}

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function createDesktopBundle({ root = defaultRoot, dshHome = defaultHome(), pack = npmPack } = {}) {
  root = await realpath(root);
  const metadata = await validateSource(root);
  const build = await regularDirectory(path.join(root, 'build'));
  if (!within(root, build)) throw new Error('Release staging must be inside this checkout.');
  const stage = await mkdtemp(path.join(build, 'desktop-release-'));
  const directory = path.join(stage, 'package'), destination = path.join(stage, 'output');
  await mkdir(directory); await mkdir(destination);
  for (const name of releaseNames) await cp(path.join(root, name), path.join(directory, name), { recursive: true, errorOnExist: true, force: false, filter: source => !excluded.has(path.basename(source)) });
  const packed = await pack({ directory, destination });
  const archive = path.resolve(typeof packed === 'string' ? packed : packed.archive);
  if (!within(destination, archive) || (await lstat(archive)).isSymbolicLink() || !(await lstat(archive)).isFile()) throw new Error('The packer did not return a regular archive inside its output directory.');
  if (packed.files) requireFiles(new Set(packed.files));
  await verifyArchive(archive);
  const sha256 = await digest(archive);
  const home = await regularDirectory(path.resolve(dshHome));
  const data = await regularDirectory(path.join(home, 'yukimi-desktop'));
  const packages = await regularDirectory(path.join(data, 'packages'));
  const persistent = path.join(packages, `${metadata.name}-${metadata.version}-${sha256}.tgz`);
  let reused = false;
  try { await copyFile(archive, persistent, constants.COPYFILE_EXCL); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const info = await lstat(persistent);
    if (!info.isFile() || info.isSymbolicLink() || await digest(persistent) !== sha256) throw new Error(`Refusing to overwrite a different existing package: ${persistent}`);
    reused = true;
  }
  return { archive: persistent, sha256, reused, stage };
}

async function desktopCommand(dshCli) {
  const shim = path.resolve(dshCli || process.env.DSH_DESKTOP_CLI || path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'));
  const expected = '@echo off\nsetlocal DisableDelayedExpansion\nset "ELECTRON_RUN_AS_NODE=1"\n"%~dp0..\\..\\..\\..\\DeepSeek Harness.exe" --expose-internals "%~dp0..\\..\\..\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh-desktop-host\\lib\\cli.js" %*\nexit /b %errorlevel%';
  if (path.basename(shim).toLowerCase() !== 'dsh.cmd' || (await readFile(shim, 'utf8')).replaceAll('\r\n', '\n').trim() !== expected) throw new Error('Unrecognized Desktop dsh.cmd launcher; use --dsh-cli with the official Desktop shim.');
  const directory = path.dirname(shim);
  const executable = path.resolve(directory, '..', '..', '..', '..', 'DeepSeek Harness.exe');
  const archive = path.resolve(directory, '..', '..', '..', 'app.asar');
  for (const file of [executable, archive]) if (!(await lstat(file)).isFile()) throw new Error(`Missing Desktop carrier: ${file}`);
  return { executable, args: ['--expose-internals', path.join(archive, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')] };
}

export async function installDesktopPackage({ root = defaultRoot, dshHome = defaultHome(), dshCli, pack = npmPack, run = execute, bundleOnly = false } = {}) {
  const bundle = await createDesktopBundle({ root, dshHome, pack });
  if (bundleOnly) return { ...bundle, installed: false };
  const command = await desktopCommand(dshCli);
  const result = await run({ ...command, args: [...command.args, 'plugin', '--profile', 'desktop', 'add', bundle.archive], options: { cwd: path.resolve(root), shell: false, windowsHide: true, stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: path.resolve(dshHome) } } });
  if (result.exitCode !== 0) throw new Error(`Desktop plugin installation failed (${result.exitCode}). The immutable package remains at ${bundle.archive}`);
  return { ...bundle, installed: true, restartRequired: true };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const options = {};
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--bundle-only') options.bundleOnly = true;
    else if (argument === '--dsh-cli' || argument === '--dsh-home') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path.`);
      options[argument === '--dsh-cli' ? 'dshCli' : 'dshHome'] = value;
    } else throw new Error(`Unknown option: ${argument}`);
  }
  if (!options.bundleOnly) console.error('请先彻底退出 DeepSeek Harness 和桌宠；本脚本不会终止进程。安装后重新启动 DeepSeek Harness。');
  const result = await installDesktopPackage(options);
  console.log(result.archive);
}

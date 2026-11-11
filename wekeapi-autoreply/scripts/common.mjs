import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the wekeapi CLI: PATH first, then nearest wekeapi-core/assets/bin upward.
export function resolveCli() {
  try { execFileSync('wekeapi', ['--version'], { stdio: 'ignore', windowsHide: true }); return 'wekeapi'; } catch {}
  const plat = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform] || process.platform;
  const arch = process.arch === 'x64' ? 'amd64' : process.arch;
  const exe = process.platform === 'win32' ? '.exe' : '';
  const name = `wekeapi-${plat}-${arch}${exe}`;
  let d = __dirname;
  for (let i = 0; i < 6; i++) {
    const cand = path.join(d, 'wekeapi-core', 'assets', 'bin', name);
    if (fs.existsSync(cand)) return cand;
    const parent = path.dirname(d);
    if (parent === d) break;
    d = parent;
  }
  throw new Error('wekeapi CLI not found in PATH or wekeapi-core/assets/bin');
}

export function runCli(cli, args) {
  const out = execFileSync(cli, args, { encoding: 'utf8', timeout: 30000, windowsHide: true });
  try { return JSON.parse(out); }
  catch {
    const m = out.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('CLI returned non-JSON: ' + out.slice(0, 200));
  }
}

export function loadAccounts(cli) {
  const res = runCli(cli, ['account', 'list']);
  if (res.code !== 0) throw new Error('account list code=' + res.code + ' ' + res.message);
  return res.data.accounts || [];
}

export function flagValue(argv, name, def) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}

export function resolveStateDir(argv) {
  return flagValue(argv, '--state-dir', path.join(os.homedir(), '.wekeapi', 'autoreply'));
}

export function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
export function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj));
}
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
export function log(...args) { process.stderr.write(args.join(' ') + '\n'); }
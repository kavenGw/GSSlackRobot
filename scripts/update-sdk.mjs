// 启动前运行：距上次检查超过 SDK_UPDATE_INTERVAL_DAYS 天则升级 Claude Agent SDK。
// 用 --no-save 不改 package.json/lock，lock 始终是可回退的基线。任何失败都不阻塞 bot 启动。
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const PKG = '@anthropic-ai/claude-agent-sdk';
const STATE_FILE = 'data/sdk-update.json';
const DEFAULT_INTERVAL_DAYS = 7;
const DAY_MS = 86_400_000;
const NPM_TIMEOUT_MS = 5 * 60_000;

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const log = msg => console.log(`[sdk-update] ${msg}`);

function intervalDays() {
  const raw = process.env.SDK_UPDATE_INTERVAL_DAYS;
  const days = raw ? Number(raw) : DEFAULT_INTERVAL_DAYS;
  return Number.isFinite(days) && days >= 0 ? days : DEFAULT_INTERVAL_DAYS;
}

function lastCheckMs() {
  try {
    return Date.parse(JSON.parse(readFileSync(STATE_FILE, 'utf8')).lastCheck) || 0;
  } catch {
    return 0;
  }
}

function markChecked() {
  mkdirSync('data', { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ lastCheck: new Date().toISOString() }));
}

function isPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

function installedVersion() {
  return JSON.parse(readFileSync(`node_modules/${PKG}/package.json`, 'utf8')).version;
}

function latestVersion() {
  const { status, stdout } = spawnSync(`npm view ${PKG} version`, {
    shell: true,
    encoding: 'utf8',
    timeout: NPM_TIMEOUT_MS,
  });
  const version = status === 0 ? stdout.trim() : '';
  return /^\d+\.\d+\.\d+$/.test(version) ? version : null;
}

function run(command) {
  return spawnSync(command, { shell: true, stdio: 'inherit', timeout: NPM_TIMEOUT_MS }).status === 0;
}

const install = version => run(`npm install ${PKG}@${version} --no-save --no-audit --no-fund`);

async function main() {
  const days = intervalDays();
  if (days === 0) return;
  if (Date.now() - lastCheckMs() < days * DAY_MS) return;

  // 已有实例在跑时 SDK 自带的 CLI 可能被占用，且本次启动反正会被单实例守护拦下
  if (!(await isPortFree(Number(process.env.SINGLETON_PORT) || 19280))) {
    log('已有实例在运行，跳过');
    return;
  }

  const current = installedVersion();
  const latest = latestVersion();
  if (!latest) {
    log('查询最新版本失败，跳过');
    return;
  }
  if (latest === current) {
    log(`已是最新版本 ${current}`);
    markChecked();
    return;
  }

  log(`升级 ${current} -> ${latest}`);
  if (!install(latest)) {
    log('安装失败，继续使用当前版本');
    return;
  }
  if (run('npm run build')) {
    log(`已升级到 ${latest}`);
    markChecked();
    return;
  }

  log(`新版本编译失败，回退到 ${current}`);
  if (!install(current)) log(`回退失败，请手动执行 npm install ${PKG}@${current} --no-save`);
  markChecked();
}

try {
  await main();
} catch (error) {
  log(`出错，已跳过：${error.message}`);
}

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// packaging/ios/build-support.mjs：独立 iOS 构建工具共用的路径与可测试校验逻辑。
export const builderRoot = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(builderRoot, '../..');
export const nativeRoot = path.join(builderRoot, 'native');
export const outputRoot = path.join(builderRoot, 'output');

export function parseHttpsOrigin(raw = '', label = 'VITE_FOLIA_API_BASE') {
  const value = raw.trim();
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} 必须填写 HTTPS 站点源地址。`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label} 必须填写纯 HTTPS 站点源地址，且不含路径、查询参数、账号密码或片段。`);
  }
  return url.origin;
}

export function validateProviderBase(raw = '', label, origin = '') {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('/') && !value.startsWith('//')) {
    if (!origin) throw new Error(`${label} 使用了相对接口路径；请先设置 VITE_FOLIA_API_BASE。`);
    return value;
  }
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} 必须填写 HTTPS 地址或以 /api 开头的相对路径。`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error(`${label} 必须使用 HTTPS，且不含账号密码或片段。`);
  }
  return value;
}

export function readBuildEnvironment(env = process.env) {
  const origin = parseHttpsOrigin(env.VITE_FOLIA_API_BASE);
  const providers = Object.fromEntries(['VITE_NETEASE_API_BASE', 'VITE_KUGOU_API_BASE', 'VITE_QQ_API_BASE']
    .map(key => [key, validateProviderBase(env[key], key, origin)]));
  return { origin, providers };
}

export function describeBuildExperience({ origin, providers }) {
  return origin || Object.values(providers).some(Boolean)
    ? '已配置在线服务地址，实际连接与播放仍待真机验证；本地音频导入尚未移植。'
    : '未配置在线后端：此包是无后端界面体验包；本地音频导入尚未移植，也未内置可试听歌曲。';
}

export function requireMacOS(platform = process.platform) {
  if (platform !== 'darwin') {
    throw new Error('IOS_REQUIRES_MACOS: 请在安装 Xcode 26 或更新版本的 macOS 上运行此命令，或使用 GitHub Actions 中的“苹果未签名安装包”构建流程。');
  }
}

export function validateBuildNumber(value = '1') {
  if (!/^[1-9]\d{0,17}$/.test(value)) throw new Error('IOS_BUILD_NUMBER 必须是最多 18 位的正整数。');
  return value;
}

export function unsignedArchiveArguments({ project, archivePath, derivedDataPath, version, buildNumber }) {
  return [
    '-project', project, '-scheme', 'App', '-configuration', 'Release',
    '-sdk', 'iphoneos', '-destination', 'generic/platform=iOS',
    '-archivePath', archivePath, '-derivedDataPath', derivedDataPath,
    'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGN_IDENTITY=',
    'DEVELOPMENT_TEAM=', 'SKIP_INSTALL=NO', 'TARGETED_DEVICE_FAMILY=1', 'ARCHS=arm64',
    `MARKETING_VERSION=${version}`, `CURRENT_PROJECT_VERSION=${validateBuildNumber(buildNumber)}`,
    'archive',
  ];
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: builderRoot, stdio: 'inherit', env: process.env, ...options,
  });
  if (result.error) throw new Error(`启动 ${command} 失败（${result.error.code ?? '未知错误'}）。`);
  if (result.status !== 0) throw new Error(`${command} 执行结束，退出状态：${result.status ?? '未知'}。`);
  return result;
}

export function runCapacitor(args) {
  return run(process.execPath, [path.join(builderRoot, 'node_modules/@capacitor/cli/bin/capacitor'), ...args], {
    env: { ...process.env, CI: 'true', CAPACITOR_DISABLE_TELEMETRY: 'true' },
  });
}

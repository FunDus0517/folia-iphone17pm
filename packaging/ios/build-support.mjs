import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// packaging/ios/build-support.mjs: shared, testable validation for the isolated iOS build tools.
export const builderRoot = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(builderRoot, '../..');
export const nativeRoot = path.join(builderRoot, 'native');
export const outputRoot = path.join(builderRoot, 'output');

export function parseHttpsOrigin(raw = '', label = 'VITE_FOLIA_API_BASE') {
  const value = raw.trim();
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} must be an HTTPS origin.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label} must be an HTTPS origin without a path, query, credentials, or fragment.`);
  }
  return url.origin;
}

export function validateProviderBase(raw = '', label, origin = '') {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('/') && !value.startsWith('//')) {
    if (!origin) throw new Error(`${label} uses a relative API path; set VITE_FOLIA_API_BASE first.`);
    return value;
  }
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} must be HTTPS or a relative /api path.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error(`${label} must use HTTPS without credentials or a fragment.`);
  }
  return value;
}

export function readBuildEnvironment(env = process.env) {
  const origin = parseHttpsOrigin(env.VITE_FOLIA_API_BASE);
  const providers = Object.fromEntries(['VITE_NETEASE_API_BASE', 'VITE_KUGOU_API_BASE', 'VITE_QQ_API_BASE']
    .map(key => [key, validateProviderBase(env[key], key, origin)]));
  return { origin, providers };
}

export function requireMacOS(platform = process.platform) {
  if (platform !== 'darwin') {
    throw new Error('IOS_REQUIRES_MACOS: run this command on macOS with Xcode 26+ or use the iOS Unsigned IPA GitHub Actions workflow.');
  }
}

export function validateBuildNumber(value = '1') {
  if (!/^[1-9]\d{0,17}$/.test(value)) throw new Error('IOS_BUILD_NUMBER must be a positive integer of at most 18 digits.');
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
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 'unknown'}.`);
  return result;
}

export function runCapacitor(args) {
  return run(process.execPath, [path.join(builderRoot, 'node_modules/@capacitor/cli/bin/capacitor'), ...args], {
    env: { ...process.env, CI: 'true', CAPACITOR_DISABLE_TELEMETRY: 'true' },
  });
}

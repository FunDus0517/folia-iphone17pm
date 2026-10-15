import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { builderRoot, parseHttpsOrigin, readBuildEnvironment, requireMacOS, unsignedArchiveArguments, validateProviderBase } from './build-support.mjs';

// packaging/ios/build-support.test.mjs: portable tests; these do not invoke Xcode or claim an IPA build.
test('accepts a pure HTTPS origin and removes its trailing slash', () => {
  assert.equal(parseHttpsOrigin('https://music.example.org/'), 'https://music.example.org');
  assert.equal(parseHttpsOrigin(''), '');
});

test('rejects insecure origins, paths, query strings and embedded credentials', () => {
  for (const value of ['http://music.example.org', 'https://music.example.org/api', 'https://music.example.org?key=a',
    'https://user:pass@music.example.org', 'https://music.example.org#x', '//music.example.org']) {
    assert.throws(() => parseHttpsOrigin(value));
  }
});

test('requires the origin for relative provider APIs and accepts HTTPS provider paths', () => {
  assert.equal(validateProviderBase('/api/qq', 'QQ', 'https://music.example.org'), '/api/qq');
  assert.equal(validateProviderBase('https://music.example.org/netease', 'NETEASE'), 'https://music.example.org/netease');
  assert.throws(() => validateProviderBase('/api/qq', 'QQ'));
  assert.throws(() => validateProviderBase('//music.example.org', 'QQ', 'https://music.example.org'));
  assert.throws(() => validateProviderBase('http://localhost:3000', 'NETEASE'));
});

test('records an unconfigured backend instead of inventing a service', () => {
  assert.deepEqual(readBuildEnvironment({}), { origin: '', providers: {
    VITE_NETEASE_API_BASE: '', VITE_KUGOU_API_BASE: '', VITE_QQ_API_BASE: '',
  } });
});

test('the native build rejects Windows/Linux and accepts macOS', () => {
  assert.throws(() => requireMacOS('win32'), /IOS_REQUIRES_MACOS/);
  assert.throws(() => requireMacOS('linux'), /IOS_REQUIRES_MACOS/);
  assert.doesNotThrow(() => requireMacOS('darwin'));
});

test('archives a real device build with signing explicitly disabled', () => {
  const args = unsignedArchiveArguments({ project: '/p/App.xcodeproj', archivePath: '/p/Folia.xcarchive',
    derivedDataPath: '/p/DerivedData', version: '0.7.19', buildNumber: '12' });
  assert.ok(args.includes('generic/platform=iOS'));
  assert.ok(args.includes('CODE_SIGNING_ALLOWED=NO'));
  assert.ok(args.includes('CODE_SIGNING_REQUIRED=NO'));
  assert.ok(args.includes('TARGETED_DEVICE_FAMILY=1'));
  assert.ok(args.includes('ARCHS=arm64'));
  assert.equal(args.at(-1), 'archive');
  assert.throws(() => unsignedArchiveArguments({ buildNumber: '1; echo broken' }));
});

test('the shell loads bundled assets and never a remote server.url', () => {
  const config = JSON.parse(fs.readFileSync(path.join(builderRoot, 'capacitor.config.json'), 'utf8'));
  assert.equal(config.webDir, '../../dist');
  assert.equal(config.ios.path, 'native');
  assert.equal(config.server?.url, undefined);
  assert.equal(config.ios.contentInset, 'never');
});

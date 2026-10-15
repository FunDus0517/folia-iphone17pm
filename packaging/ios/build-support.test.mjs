import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { builderRoot, describeBuildExperience, parseHttpsOrigin, readBuildEnvironment, requireMacOS, unsignedArchiveArguments, validateProviderBase } from './build-support.mjs';

// packaging/ios/build-support.test.mjs：跨平台测试；不调用 Xcode，也不代表已生成 IPA。
test('接受纯 HTTPS 站点源地址并移除尾部斜线', () => {
  assert.equal(parseHttpsOrigin('https://music.example.org/'), 'https://music.example.org');
  assert.equal(parseHttpsOrigin(''), '');
});

test('拒绝非 HTTPS、路径、查询参数及嵌入的账号密码', () => {
  for (const value of ['http://music.example.org', 'https://music.example.org/api', 'https://music.example.org?key=a',
    'https://user:pass@music.example.org', 'https://music.example.org#x', '//music.example.org']) {
    assert.throws(() => parseHttpsOrigin(value));
  }
});

test('相对音乐接口要求配置站点源地址，并接受 HTTPS 接口路径', () => {
  assert.equal(validateProviderBase('/api/qq', 'QQ', 'https://music.example.org'), '/api/qq');
  assert.equal(validateProviderBase('https://music.example.org/netease', 'NETEASE'), 'https://music.example.org/netease');
  assert.throws(() => validateProviderBase('/api/qq', 'QQ'));
  assert.throws(() => validateProviderBase('//music.example.org', 'QQ', 'https://music.example.org'));
  assert.throws(() => validateProviderBase('http://localhost:3000', 'NETEASE'));
});

test('无后端时明确标注界面体验包与尚未移植的本地音频导入', () => {
  assert.deepEqual(readBuildEnvironment({}), { origin: '', providers: {
    VITE_NETEASE_API_BASE: '', VITE_KUGOU_API_BASE: '', VITE_QQ_API_BASE: '',
  } });
  assert.match(describeBuildExperience(readBuildEnvironment({})), /无后端界面体验包/);
  assert.match(describeBuildExperience(readBuildEnvironment({})), /本地音频导入尚未移植/);
  assert.match(describeBuildExperience(readBuildEnvironment({})), /未内置可试听歌曲/);
  assert.match(describeBuildExperience(readBuildEnvironment({ VITE_FOLIA_API_BASE: 'https://music.example.org' })), /待真机验证/);
});

test('原生构建在 Windows 或 Linux 终止，在 macOS 继续', () => {
  assert.throws(() => requireMacOS('win32'), /IOS_REQUIRES_MACOS/);
  assert.throws(() => requireMacOS('linux'), /IOS_REQUIRES_MACOS/);
  assert.doesNotThrow(() => requireMacOS('darwin'));
});

test('使用真实设备归档参数并明确关闭签名', () => {
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

test('原生容器加载包内资源而非远程网页地址', () => {
  const config = JSON.parse(fs.readFileSync(path.join(builderRoot, 'capacitor.config.json'), 'utf8'));
  assert.equal(config.webDir, '../../dist');
  assert.equal(config.ios.path, 'native');
  assert.equal(config.server?.url, undefined);
  assert.equal(config.ios.contentInset, 'never');
});

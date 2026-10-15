import fs from 'node:fs';
import path from 'node:path';
import { nativeRoot, repositoryRoot, requireMacOS, run, runCapacitor } from './build-support.mjs';

// packaging/ios/prepare-ios.mjs：生成并同步固定版本的 SPM 原生容器，再设置应用图标。
try {
  requireMacOS();
  if (!fs.existsSync(path.join(repositoryRoot, 'dist/index.html'))) {
    throw new Error('请先运行 npm --prefix packaging/ios run build:web 构建本地网页资源。');
  }
  if (!fs.existsSync(path.join(nativeRoot, 'App/App.xcodeproj/project.pbxproj'))) {
    runCapacitor(['add', 'ios', '--packagemanager', 'SPM']);
  }
  runCapacitor(['sync', 'ios']);
  const plistPath = path.join(nativeRoot, 'App/App/Info.plist');
  const readPlist = () => JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plistPath], {
    stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8',
  }).stdout);
  const initialPlist = readPlist();
  // 已存在的键覆盖，首次生成时缺少的键插入；重复同步也保持唯一的简体中文声明。
  for (const [key, valueArguments] of [
    ['CFBundleDevelopmentRegion', ['-string', 'zh_CN']],
    ['CFBundleLocalizations', ['-json', '["zh-Hans"]']],
  ]) {
    run('/usr/bin/plutil', [Object.hasOwn(initialPlist, key) ? '-replace' : '-insert', key, ...valueArguments, plistPath]);
  }
  run('/usr/bin/plutil', ['-lint', plistPath]);
  const localizedPlist = readPlist();
  if (localizedPlist.CFBundleDevelopmentRegion !== 'zh_CN'
    || !Array.isArray(localizedPlist.CFBundleLocalizations)
    || localizedPlist.CFBundleLocalizations.length !== 1
    || localizedPlist.CFBundleLocalizations[0] !== 'zh-Hans') {
    throw new Error('原生应用的简体中文语言声明校验失败。');
  }
  const iconDir = path.join(nativeRoot, 'App/App/Assets.xcassets/AppIcon.appiconset');
  fs.mkdirSync(iconDir, { recursive: true });
  run('/usr/bin/sips', ['-z', '1024', '1024', path.join(repositoryRoot, 'build/icon.png'), '--out', path.join(iconDir, 'AppIcon.png')]);
  fs.writeFileSync(path.join(iconDir, 'Contents.json'), `${JSON.stringify({
    images: [{ filename: 'AppIcon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  }, null, 2)}\n`);
  console.log(`IOS_PROJECT_READY: iOS 原生工程已准备完成：${path.join(nativeRoot, 'App/App.xcodeproj')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

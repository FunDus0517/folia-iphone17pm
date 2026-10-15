import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { nativeRoot, outputRoot, repositoryRoot, requireMacOS, run, unsignedArchiveArguments } from './build-support.mjs';

// packaging/ios/build-unsigned.mjs：为真实 iPhone 归档，并打包明确标注为未签名的 IPA。
try {
  requireMacOS();
  const project = path.join(nativeRoot, 'App/App.xcodeproj');
  if (!fs.existsSync(project)) throw new Error('请先运行 npm --prefix packaging/ios run prepare:ios 准备原生工程。');
  const version = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('网页软件包版本必须由三段数字组成。');
  const archivePath = path.join(outputRoot, 'Folia.xcarchive');
  const ipaName = `Folia-iPhone17PM-${version}-unsigned.ipa`;
  const ipaPath = path.join(outputRoot, ipaName);
  const payloadRoot = path.join(outputRoot, 'package');
  fs.mkdirSync(outputRoot, { recursive: true });
  // 先清理旧产物，避免归档失败后把旧文件误判为本次构建成功。
  for (const target of [archivePath, payloadRoot, ipaPath, `${ipaPath}.sha256`]) {
    if (!path.resolve(target).startsWith(`${path.resolve(outputRoot)}${path.sep}`)) throw new Error('产物路径超出了 iOS 输出目录。');
    fs.rmSync(target, { recursive: true, force: true });
  }
  const xcode = run('xcodebuild', ['-version'], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).stdout;
  console.log(xcode.trim());
  const xcodeVersion = /^Xcode (\d+)/m.exec(xcode);
  if (!xcodeVersion || Number(xcodeVersion[1]) < 26) throw new Error('Capacitor 8 要求 Xcode 26 或更新版本。');
  run('xcodebuild', unsignedArchiveArguments({
    project, archivePath, derivedDataPath: path.join(outputRoot, 'DerivedData'), version,
    buildNumber: process.env.IOS_BUILD_NUMBER || '1',
  }));
  const appSource = path.join(archivePath, 'Products/Applications/App.app');
  if (!fs.existsSync(path.join(appSource, 'Info.plist'))) throw new Error('设备端归档中缺少 App.app/Info.plist。');
  const appDestination = path.join(payloadRoot, 'Payload/Folia.app');
  fs.mkdirSync(path.dirname(appDestination), { recursive: true });
  run('/usr/bin/ditto', [appSource, appDestination]);
  run('/usr/bin/plutil', ['-lint', path.join(appDestination, 'Info.plist')]);
  const appInfo = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(appDestination, 'Info.plist')], {
    stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8',
  }).stdout);
  if (!appInfo.CFBundleSupportedPlatforms?.includes('iPhoneOS')) throw new Error('此归档不是 iPhoneOS 设备端应用。');
  if (!appInfo.CFBundleExecutable || path.basename(appInfo.CFBundleExecutable) !== appInfo.CFBundleExecutable) {
    throw new Error('应用可执行文件名缺失或格式无效。');
  }
  run('/usr/bin/lipo', ['-verify_arch', 'arm64', path.join(appDestination, appInfo.CFBundleExecutable)]);
  const signature = spawnSync('/usr/bin/codesign', ['-dv', appDestination], { encoding: 'utf8' });
  if (signature.error) throw new Error(`启动签名检查失败（${signature.error.code ?? '未知错误'}）。`);
  if (signature.status === 0 || !`${signature.stdout}${signature.stderr}`.includes('not signed at all')) {
    throw new Error('归档应用未满足明确的未签名构建要求。');
  }
  run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', 'Payload', ipaPath], { cwd: payloadRoot });
  run('/usr/bin/unzip', ['-t', ipaPath]);
  const digest = createHash('sha256').update(fs.readFileSync(ipaPath)).digest('hex');
  fs.writeFileSync(`${ipaPath}.sha256`, `${digest}  ${ipaName}\n`);
  fs.writeFileSync(path.join(outputRoot, 'BUILD-INFO.json'), `${JSON.stringify({
    app: 'Folia', target: 'iPhone 17 Pro Max', version, unsigned: true,
    architecture: 'arm64', platform: 'iPhoneOS', signatureVerifiedAbsent: true,
    requiresUserSigning: true, sha256: digest,
    sourceCommit: process.env.GITHUB_SHA || null,
    webBuild: JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'dist/ios-build-info.json'), 'utf8')),
  }, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ipa_path=${ipaPath}\nipa_name=${ipaName}\n`);
  console.log(`IOS_UNSIGNED_IPA_READY: 未签名 IPA 已生成：${ipaPath}`);
  console.log(`SHA256: ${digest}`);
  console.log('此 IPA 尚未签名，安装前需要使用自己的 Apple 身份重新签名。');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

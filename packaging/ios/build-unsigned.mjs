import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { nativeRoot, outputRoot, repositoryRoot, requireMacOS, run, unsignedArchiveArguments } from './build-support.mjs';

// packaging/ios/build-unsigned.mjs: archive for real iPhones and package an explicitly unsigned IPA.
try {
  requireMacOS();
  const project = path.join(nativeRoot, 'App/App.xcodeproj');
  if (!fs.existsSync(project)) throw new Error('Prepare the native project with npm --prefix packaging/ios run prepare:ios first.');
  const version = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('The web package version must contain three numeric version components.');
  const archivePath = path.join(outputRoot, 'Folia.xcarchive');
  const ipaName = `Folia-iPhone17PM-${version}-unsigned.ipa`;
  const ipaPath = path.join(outputRoot, ipaName);
  const payloadRoot = path.join(outputRoot, 'package');
  fs.mkdirSync(outputRoot, { recursive: true });
  // Old outputs must never pass the success checks after a failed archive.
  for (const target of [archivePath, payloadRoot, ipaPath, `${ipaPath}.sha256`]) {
    if (!path.resolve(target).startsWith(`${path.resolve(outputRoot)}${path.sep}`)) throw new Error('Output path left the iOS output directory.');
    fs.rmSync(target, { recursive: true, force: true });
  }
  const xcode = run('xcodebuild', ['-version'], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).stdout;
  console.log(xcode.trim());
  const xcodeVersion = /^Xcode (\d+)/m.exec(xcode);
  if (!xcodeVersion || Number(xcodeVersion[1]) < 26) throw new Error('Capacitor 8 requires Xcode 26 or newer.');
  run('xcodebuild', unsignedArchiveArguments({
    project, archivePath, derivedDataPath: path.join(outputRoot, 'DerivedData'), version,
    buildNumber: process.env.IOS_BUILD_NUMBER || '1',
  }));
  const appSource = path.join(archivePath, 'Products/Applications/App.app');
  if (!fs.existsSync(path.join(appSource, 'Info.plist'))) throw new Error('The device archive did not contain App.app/Info.plist.');
  const appDestination = path.join(payloadRoot, 'Payload/Folia.app');
  fs.mkdirSync(path.dirname(appDestination), { recursive: true });
  run('/usr/bin/ditto', [appSource, appDestination]);
  run('/usr/bin/plutil', ['-lint', path.join(appDestination, 'Info.plist')]);
  const appInfo = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(appDestination, 'Info.plist')], {
    stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8',
  }).stdout);
  if (!appInfo.CFBundleSupportedPlatforms?.includes('iPhoneOS')) throw new Error('The archive is not an iPhoneOS device application.');
  if (!appInfo.CFBundleExecutable || path.basename(appInfo.CFBundleExecutable) !== appInfo.CFBundleExecutable) {
    throw new Error('The app executable name is missing or invalid.');
  }
  run('/usr/bin/lipo', ['-verify_arch', 'arm64', path.join(appDestination, appInfo.CFBundleExecutable)]);
  const signature = spawnSync('/usr/bin/codesign', ['-dv', appDestination], { encoding: 'utf8' });
  if (signature.error) throw signature.error;
  if (signature.status === 0 || !`${signature.stdout}${signature.stderr}`.includes('not signed at all')) {
    throw new Error('The archived app did not match the explicitly unsigned build requirement.');
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
  console.log(`IOS_UNSIGNED_IPA_READY: ${ipaPath}`);
  console.log(`SHA256: ${digest}`);
  console.log('This IPA is unsigned and requires the user\'s own signing before installation.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

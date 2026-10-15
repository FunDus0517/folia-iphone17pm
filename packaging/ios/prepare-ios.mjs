import fs from 'node:fs';
import path from 'node:path';
import { nativeRoot, repositoryRoot, requireMacOS, run, runCapacitor } from './build-support.mjs';

// packaging/ios/prepare-ios.mjs: regenerate/sync the pinned SPM shell and brand its app icon.
try {
  requireMacOS();
  if (!fs.existsSync(path.join(repositoryRoot, 'dist/index.html'))) {
    throw new Error('Build local web assets with npm --prefix packaging/ios run build:web first.');
  }
  if (!fs.existsSync(path.join(nativeRoot, 'App/App.xcodeproj/project.pbxproj'))) {
    runCapacitor(['add', 'ios', '--packagemanager', 'SPM']);
  }
  runCapacitor(['sync', 'ios']);
  const iconDir = path.join(nativeRoot, 'App/App/Assets.xcassets/AppIcon.appiconset');
  fs.mkdirSync(iconDir, { recursive: true });
  run('/usr/bin/sips', ['-z', '1024', '1024', path.join(repositoryRoot, 'build/icon.png'), '--out', path.join(iconDir, 'AppIcon.png')]);
  fs.writeFileSync(path.join(iconDir, 'Contents.json'), `${JSON.stringify({
    images: [{ filename: 'AppIcon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  }, null, 2)}\n`);
  console.log(`IOS_PROJECT_READY: ${path.join(nativeRoot, 'App/App.xcodeproj')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

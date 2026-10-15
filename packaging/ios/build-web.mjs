import fs from 'node:fs';
import path from 'node:path';
import { builderRoot, readBuildEnvironment, repositoryRoot, run } from './build-support.mjs';

// packaging/ios/build-web.mjs: build local web assets with native-only PWA and API settings.
try {
  const { origin, providers } = readBuildEnvironment();
  const vite = path.join(repositoryRoot, 'node_modules/vite/bin/vite.js');
  if (!fs.existsSync(vite)) throw new Error('Install the root web dependencies with npm ci --ignore-scripts first.');
  console.log(origin ? `iOS API origin: ${origin}` : 'iOS API origin: not configured; this package has no bundled online-music backend.');
  run(process.execPath, [vite, 'build', '--base', './', '--mode', 'ios'], {
    cwd: repositoryRoot,
    env: { ...process.env, ...providers, VITE_FOLIA_API_BASE: origin, VITE_NATIVE_IOS: 'true', ELECTRON: 'false' },
  });
  const indexPath = path.join(repositoryRoot, 'dist/index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  if (/registerSW\.js|virtual:pwa-register/.test(html)) throw new Error('The native iOS build still includes a PWA registration script.');
  fs.writeFileSync(path.join(repositoryRoot, 'dist/ios-build-info.json'), `${JSON.stringify({
    target: 'iphone17pm', native: true, backendOrigin: origin || null,
    configuredProviders: Object.entries(providers).filter(([, value]) => value).map(([key]) => key),
    unsigned: true, sourceCommit: process.env.GITHUB_SHA || null,
  }, null, 2)}\n`);
  console.log(`IOS_WEB_BUILD_OK: ${path.resolve(builderRoot, '../../dist')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

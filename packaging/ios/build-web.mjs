import fs from 'node:fs';
import path from 'node:path';
import { builderRoot, describeBuildExperience, readBuildEnvironment, repositoryRoot, run } from './build-support.mjs';

// packaging/ios/build-web.mjs：以原生容器专用的 PWA 与接口设置构建本地网页资源。
try {
  const { origin, providers } = readBuildEnvironment();
  const vite = path.join(repositoryRoot, 'node_modules/vite/bin/vite.js');
  if (!fs.existsSync(vite)) throw new Error('请先在仓库根目录运行 npm ci --ignore-scripts 安装网页依赖。');
  console.log(origin ? `iOS 接口站点源地址：${origin}` : 'iOS 接口站点源地址：未配置。');
  const experience = describeBuildExperience({ origin, providers });
  console.log(experience);
  run(process.execPath, [vite, 'build', '--base', './', '--mode', 'ios'], {
    cwd: repositoryRoot,
    env: { ...process.env, ...providers, VITE_FOLIA_API_BASE: origin, VITE_NATIVE_IOS: 'true', ELECTRON: 'false' },
  });
  const indexPath = path.join(repositoryRoot, 'dist/index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  if (/registerSW\.js|virtual:pwa-register/.test(html)) throw new Error('原生 iOS 构建仍包含 PWA 注册脚本，请检查原生构建开关。');
  fs.writeFileSync(path.join(repositoryRoot, 'dist/ios-build-info.json'), `${JSON.stringify({
    target: 'iphone17pm', native: true, backendOrigin: origin || null,
    configuredProviders: Object.entries(providers).filter(([, value]) => value).map(([key]) => key),
    unsigned: true, sourceCommit: process.env.GITHUB_SHA || null, experience,
  }, null, 2)}\n`);
  console.log(`IOS_WEB_BUILD_OK: 本地网页资源构建完成：${path.resolve(builderRoot, '../../dist')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

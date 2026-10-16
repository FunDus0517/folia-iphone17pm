import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// playwright.mobile.config.ts — real WebKit touch regression for phone layouts.
const webServer = base.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error('Mobile tests require the single Vite web server.');
export default defineConfig({
  ...base,
  workers: 1,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    ...webServer,
    command: webServer.command.replaceAll('4173', '4175'),
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    env: { ...webServer.env, VITE_NATIVE_IOS: 'true' },
  },
  projects: [{
    name: 'iphone17pm-webkit',
    testDir: './test/ui',
    testMatch: ['iphone17pm.spec.ts', 'mobileLogin.spec.ts', 'mobileServices.spec.ts'],
    use: {
      browserName: 'webkit',
      viewport: { width: 440, height: 956 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
      screenshot: 'only-on-failure',
      // The base config can point at a local Chromium binary, not a WebKit binary.
      launchOptions: {},
    },
  }],
});

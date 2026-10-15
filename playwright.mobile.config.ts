import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// playwright.mobile.config.ts — real WebKit touch regression for phone layouts.
export default defineConfig({
  ...base,
  workers: 1,
  projects: [{
    name: 'iphone17pm-webkit',
    testDir: './test/ui',
    testMatch: 'iphone17pm.spec.ts',
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

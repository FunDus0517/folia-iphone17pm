import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installBaseState, openApp, svgDataUrl } from './helpers/appFixtures';

// Native service setup and real app provider entry regression. All HTTP is explicitly mocked;
// these checks do not validate a user's backend, real account, network, or audio device.
const configKey = 'folia:native-music-config:v1';
const evidence = resolve('..', 'mobile-login-evidence');
mkdirSync(evidence, { recursive: true });
const empty = { backendOrigin: '', neteaseApiBase: '', qqApiBase: '', kugouApiBase: '' };
const configured = {
  backendOrigin: '', neteaseApiBase: 'https://music-api.test/netease',
  qqApiBase: 'https://music-api.test/qq', kugouApiBase: 'https://music-api.test/kugou',
};

async function openNative(page: Page, config = empty, suite: 'bravais' | 'grid' = 'bravais') {
  page.setDefaultTimeout(15_000);
  await installBaseState(page, { neteaseMode: 'guest', preserveNativeMediaQueries: true });
  await page.addInitScript(({ key, value }) => {
    delete (window as Window & { electron?: unknown }).electron;
    localStorage.setItem(key, JSON.stringify({ version: 1, config: value }));
  }, { key: configKey, value: config });
  await openApp(page);
  await page.addStyleTag({ content: '[data-testid="dev-library-renderer-switch"]{visibility:hidden!important}' });
  await page.evaluate(async id => {
    const path = '/src/library/core/state/useLibrarySuiteStore.ts';
    const { useLibrarySuiteStore } = await import(path);
    useLibrarySuiteStore.getState().setSuite(id);
  }, suite);
  await expect(page.locator(suite === 'bravais' ? '[data-library-stage="bravais"]' : '.folia-home-navigation')).toBeVisible();
  await page.screenshot({ path: resolve(evidence, `native-${suite}-startup.png`) });
}

async function openProviderMenu(page: Page) {
  // Phone height can collapse the home seam to a spine. Its account button expands
  // the seam and opens the same provider menu; do not assume the desktop strip exists.
  await page.locator('[data-bravais-account-toggle]').filter({ visible: true }).first().tap();
  await expect(page.locator('[data-bravais-account-list]')).toBeVisible();
}

async function mockMusicServices(page: Page) {
  const calls: string[] = [];
  await page.route('https://music-api.test/**', async route => {
    const url = new URL(route.request().url());
    calls.push(url.pathname);
    const [, provider, ...parts] = url.pathname.split('/');
    const endpoint = '/' + parts.join('/');
    let body: unknown = { code: 200, data: {} };
    if (endpoint === '/login/channels') body = { code: 200, data: { channels: ['qq', 'wechat'] } };
    if (endpoint === '/login/status') body = { code: 200, data: {} };
    if (endpoint === '/user/detail') body = provider === 'kugou' ? { status: 0, error_code: 152, data: {} } : { code: 301, data: {} };
    if (endpoint === '/register/dev') body = { status: 1, data: { dfid: 'layout-fixture-device' } };
    if (endpoint === '/login/qr/key') body = provider === 'kugou' ? { status: 1, data: { qrcode: 'layout-qr-key' } } : { code: 200, data: { unikey: 'layout-qr-key' } };
    if (endpoint === '/login/qr/create') body = provider === 'kugou' ? { status: 1, data: { base64: svgDataUrl('测试二维码', '#fff', '#111') } } : { code: 200, data: { qrimg: svgDataUrl('测试二维码', '#fff', '#111') } };
    if (endpoint === '/login/qr/check') body = provider === 'kugou' ? { status: 1, data: { status: 1 } } : { code: 801 };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

for (const suite of ['bravais', 'grid'] as const) {
  test(`${suite === 'bravais' ? '海报墙' : '网格'}未配置的三平台可进入服务设置且不发送取码请求`, async ({ page }) => {
    const qrRequests: string[] = [];
    page.on('request', request => { if (/\/login\/qr\//.test(request.url())) qrRequests.push(request.url()); });
    await openNative(page, empty, suite);
    for (const provider of ['netease', 'qq', 'kugou']) {
      if (suite === 'bravais') await openProviderMenu(page);
      const entry = page.locator(`[data-native-config-provider="${provider}"]`).filter({ visible: true }).first();
      await expect(entry).toBeEnabled();
      await expect(entry).toHaveAccessibleName(/配置音乐服务/);
      await entry.tap();
      const form = page.getByTestId('native-music-service-settings');
      await expect(form).toBeVisible();
      for (const field of ['neteaseApiBase', 'qqApiBase', 'kugouApiBase', 'backendOrigin']) {
        await expect(page.locator(`#native-music-${field}`)).toHaveValue('');
      }
      expect(qrRequests).toEqual([]);
      await page.locator('.folia-settings-close').tap();
      await expect(page.getByTestId('settings-panel')).toHaveCount(0);
    }
  });
}

test('手机服务配置检查地址与连接结果并在横屏确认保存和清除', async ({ page }) => {
  await mockMusicServices(page);
  await openNative(page);
  await openProviderMenu(page);
  await page.locator('[data-native-config-provider="netease"]').tap();
  const form = page.getByTestId('native-music-service-settings');
  await expect(form).toBeVisible();
  await page.locator('#native-music-neteaseApiBase').fill('http://localhost:3000');
  await page.getByTestId('native-music-save').tap();
  await expect(form.getByRole('alert')).toContainText('HTTPS');
  await expect(page.getByRole('heading', { name: '确认更换音乐服务' })).toHaveCount(0);
  for (const [field, value] of Object.entries(configured)) {
    if (value) await page.locator(`#native-music-${field}`).fill(value);
  }
  await page.getByTestId('native-music-check-qq').tap();
  await expect(form.getByRole('status').filter({ hasText: '已收到音乐接口响应' })).toBeVisible();
  await page.locator('#native-music-qqApiBase').fill('https://music-api.test/qq-changed');
  await expect(form.getByText('已收到音乐接口响应', { exact: false })).toHaveCount(0);
  await page.locator('#native-music-qqApiBase').fill(configured.qqApiBase);
  await page.setViewportSize({ width: 956, height: 440 });
  await page.getByTestId('native-music-save').tap();
  const confirm = page.getByTestId('native-music-confirmation');
  await expect(page.getByRole('heading', { name: '确认更换音乐服务' })).toBeVisible();
  const save = confirm.getByRole('button', { name: '确认保存', exact: true });
  await expect.poll(async () => {
    const box = await save.boundingBox();
    return Boolean(box && box.height >= 43.9 && box.y >= 0 && box.y + box.height <= 440);
  }).toBe(true);
  await page.screenshot({ path: resolve(evidence, 'service-save-confirm-landscape.png') });
  await save.tap();
  await expect(page.getByTestId('native-music-reload')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).config, configKey)).toEqual(configured);
  await page.getByTestId('native-music-clear').tap();
  await confirm.getByRole('button', { name: '取消', exact: true }).tap();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).config, configKey)).toEqual(configured);
  await page.getByTestId('native-music-clear').tap();
  await confirm.getByRole('button', { name: '确认清除', exact: true }).tap();
  expect(await page.evaluate(key => localStorage.getItem(key), configKey)).toBeNull();
});

for (const provider of ['netease', 'qq', 'kugou'] as const) {
  test(`配置后${provider === 'netease' ? '网易云' : provider === 'qq' ? 'QQ' : '酷狗'}入口实际触发对应接口并显示居中扫码`, async ({ page }) => {
    const calls = await mockMusicServices(page);
    await openNative(page, configured);
    await openProviderMenu(page);
    const entry = page.locator(`[data-bravais-account-provider="${provider}"] [role="menuitemradio"]`);
    await expect(entry).toBeEnabled();
    await expect(entry).not.toHaveAttribute('data-native-config-provider');
    await entry.tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    if (provider === 'qq') await dialog.getByRole('button', { name: 'QQ 扫码', exact: true }).tap();
    await expect(dialog.getByAltText('QR Code')).toBeVisible();
    await expect.poll(() => calls.includes(`/${provider}/login/qr/key`)).toBe(true);
    expect(calls.some(path => /\/login\/qr\/key$/.test(path) && !path.startsWith(`/${provider}/`))).toBe(false);
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(400);
    expect(Math.abs(box.x + box.width / 2 - 220)).toBeLessThan(2);
    await page.screenshot({ path: resolve(evidence, `native-${provider}-configured-login.png`) });
    await dialog.getByRole('button', { name: '关闭登录窗口', exact: true }).tap();
    await expect(dialog).toHaveCount(0);
  });
}

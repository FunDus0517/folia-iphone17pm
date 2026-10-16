import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { installBaseState } from './helpers/appFixtures';
import '../../dev/probes/accountBehavior/probeApi';

// Phone account surfaces use the real controller and suites with scripted provider responses.
// This validates touch layout/state transitions, not live third-party login or device networking.
const evidence = resolve('..', 'mobile-login-evidence');
mkdirSync(evidence, { recursive: true });

async function openProbe(page: Page, suite: 'grid' | 'bravais') {
  await installBaseState(page, { neteaseMode: 'guest', preserveNativeMediaQueries: true });
  await page.addInitScript(() => { delete (window as Window & { electron?: unknown }).electron; });
  await page.goto('/dev-probe.html?probe=accountBehavior');
  await expect.poll(() => page.evaluate(() => Boolean(window.__accountProbe?.ready()))).toBe(true);
  await page.evaluate(id => window.__accountProbe!.setSuite(id), suite);
  await expect(page.locator(suite === 'bravais' ? '[data-library-stage="bravais"]' : '.folia-home-navigation')).toBeVisible();
}

async function expectTouch(target: Locator) {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(43.9);
  expect(box!.height).toBeGreaterThanOrEqual(43.9);
}

async function expectPhoneDialog(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Measure the modal frame, not its scrollport's content box (stable scrollbar gutters
  // intentionally subtract width from Bravais's inner section in short landscape windows).
  const surface = await dialog.locator('.folia-login-card').count()
    ? dialog.locator('.folia-login-card') : page.locator('[data-bravais-seam="login"]');
  console.log('LOGIN_FRAME', JSON.stringify(await surface.boundingBox()), 'VIEWPORT', JSON.stringify(page.viewportSize()));
  await expect.poll(async () => {
    const box = await surface.boundingBox();
    const viewport = page.viewportSize()!;
    // A classic scrollbar gutter can make the modal host 8px narrower than
    // innerWidth after rotation. Check its real containing block, not that strip.
    const host = await surface.evaluate(element => (element.closest('.folia-login-overlay') ?? element.closest('.bravais-root'))!.getBoundingClientRect().toJSON());
    return Boolean(box && Math.abs(box.x + box.width / 2 - (host.x + host.width / 2)) < 2
      && host.x >= 0 && host.width >= viewport.width - 16
      && box.width >= Math.min(560, host.width - 40) && box.x >= 10
      && box.y >= 0 && box.y + box.height <= viewport.height + 1);
  }).toBe(true);
  if (await dialog.locator('.bravais-account-head').count()) {
    await expect.poll(() => dialog.evaluate(element => Number(getComputedStyle(element.closest('.bravais-seam-content')!).opacity))).toBe(1);
  }
  return dialog;
}

test('手机网易扫码登录居中并保留可触达的关闭按钮', async ({ page }) => {
  await openProbe(page, 'bravais');
  await page.evaluate(() => window.__accountProbe!.startLogin('netease'));
  await expect(page.getByRole('dialog').getByAltText('QR Code')).toBeVisible();
  const bounds = await page.getByRole('dialog').boundingBox();
  console.log('BRAVAIS_PHONE_LOGIN_BOUNDS', JSON.stringify(bounds));
  if (process.env.FOLIA_CAPTURE_BASELINE) await page.screenshot({ path: resolve(evidence, 'baseline-bravais-login.png') });
  const dialog = await expectPhoneDialog(page);
  await page.screenshot({ path: resolve(evidence, 'modified-bravais-login.png') });
  await expectTouch(dialog.locator('[data-bravais-form-action="close"]'));
  await dialog.locator('[data-bravais-form-action="close"]').tap();
  await expect(dialog).toHaveCount(0);
});

for (const suite of ['bravais', 'grid'] as const) {
  test(`${suite === 'bravais' ? '海报墙' : '网格'}手机登录方式与取码错误可重试且横屏关闭可达`, async ({ page }) => {
    await openProbe(page, suite);
    await page.evaluate(() => {
      window.__accountProbe!.failCreate('acct-quill', 1);
      return window.__accountProbe!.startLogin('acct-quill');
    });
    let dialog = await expectPhoneDialog(page);
    await expect(dialog.getByAltText('QR Code')).toHaveCount(0);
    expect(await page.evaluate(() => window.__accountProbe!.calls().filter(c => c.providerId === 'acct-quill' && c.op === 'create').length)).toBe(0);
    const method = dialog.getByRole('button', { name: 'QQ 扫码', exact: true });
    await expectTouch(method);
    await method.tap();
    const retry = dialog.getByRole('button', { name: '刷新二维码', exact: true });
    await expect(retry).toBeVisible();
    const errorArea = suite === 'bravais' ? dialog.locator('[data-bravais-login-qr="error"]') : dialog.locator('[data-login-qr-error]');
    await expect(errorArea).toBeVisible();
    await expect(errorArea.locator('.animate-spin')).toHaveCount(0);
    await expectTouch(retry);
    await page.screenshot({ path: resolve(evidence, `${suite}-qr-error-portrait.png`) });
    await retry.tap();
    await expect(dialog.getByAltText('QR Code')).toBeVisible();
    expect(await page.evaluate(() => window.__accountProbe!.calls().filter(c => c.providerId === 'acct-quill' && c.op === 'create').length)).toBe(2);
    await page.setViewportSize({ width: 956, height: 440 });
    dialog = await expectPhoneDialog(page);
    const scroller = suite === 'bravais' ? dialog.locator('.bravais-account-scroll') : dialog.locator('.folia-login-card');
    await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const close = dialog.getByRole('button', { name: '关闭登录窗口', exact: true });
    await expectTouch(close);
    const closeBox = (await close.boundingBox())!;
    expect(closeBox.y).toBeGreaterThanOrEqual(0);
    expect(closeBox.y + closeBox.height).toBeLessThan(440);
    await page.screenshot({ path: resolve(evidence, `${suite}-login-landscape-scrolled.png`) });
    await close.tap();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => window.__accountProbe!.calls().filter(c => c.providerId === 'acct-quill' && c.op === 'cancel').length)).toBeGreaterThan(0);
  });

  test(`${suite === 'bravais' ? '海报墙' : '网格'}手机单方式扫码过期与后端故障状态可操作`, async ({ page }) => {
    await page.setViewportSize({ width: 956, height: 440 });
    await openProbe(page, suite);
    await page.evaluate(() => {
      window.__accountProbe!.scriptQr('acct-gamma', ['expired']);
      return window.__accountProbe!.startLogin('acct-gamma');
    });
    let dialog = await expectPhoneDialog(page);
    const retry = dialog.getByRole('button', { name: '刷新二维码', exact: true });
    await expect(retry).toBeVisible();
    await retry.scrollIntoViewIfNeeded();
    await expectTouch(retry);
    await retry.tap();
    await expect(dialog.getByAltText('QR Code')).toBeVisible();
    await dialog.getByRole('button', { name: '关闭登录窗口', exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    await page.evaluate(() => {
      window.__accountProbe!.setNeteaseBackend({ supported: true, status: 'error', error: '测试后端连接失败：服务暂未启动。'.repeat(8) });
      return window.__accountProbe!.startLogin('netease');
    });
    dialog = await expectPhoneDialog(page);
    await expect(dialog.getByAltText('QR Code')).toHaveCount(0);
    const restart = dialog.getByRole('button', { name: '重启后端服务', exact: true });
    await restart.scrollIntoViewIfNeeded();
    await expectTouch(restart);
    await page.screenshot({ path: resolve(evidence, `${suite}-backend-error-landscape.png`) });
    await dialog.getByRole('button', { name: '关闭登录窗口', exact: true }).tap();
    await expect(dialog).toHaveCount(0);
  });
}

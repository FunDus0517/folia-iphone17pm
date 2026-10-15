import { expect, test, type Locator, type Page } from '@playwright/test';
import { installBaseState, mockNeteaseApi, openApp } from './helpers/appFixtures';

// test/ui/iphone17pm.spec.ts — iPhone 17 Pro Max CSS-point dimensions, not physical pixels.
const portrait = { width: 440, height: 956 };
const landscape = { width: 956, height: 440 };

const expectTouchTarget = async (target: Locator) => {
  await expect(target).toBeVisible();
  await expect.poll(async () => {
    const box = await target.boundingBox();
    return Boolean(box && box.width >= 43.9 && box.height >= 43.9);
  }).toBe(true);
};

const expectInside = async (target: Locator, viewport: typeof portrait, inset = 0) => {
  await expect.poll(async () => {
    const box = await target.boundingBox();
    return Boolean(box && box.x >= inset - 1 && box.y >= -1
      && box.x + box.width <= viewport.width - inset + 1 && box.y + box.height <= viewport.height + 1);
  }).toBe(true);
};

// Seed the ordinary playback stores, then exercise the real HTML audio element and controls.
const seedPlayer = async (page: Page) => {
  const wav = Buffer.alloc(44 + 160_000);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8_000, 24); wav.writeUInt32LE(16_000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  await page.route('**/__mobile_audio__.wav', route => route.fulfill({ contentType: 'audio/wav', body: wav }));
  await page.evaluate(async () => {
    const playbackPath = '/src/stores/usePlaybackStore.ts';
    const viewPath = '/src/stores/useAppViewStore.ts';
    const { usePlaybackStore } = await import(playbackPath);
    const { useAppViewStore } = await import(viewPath);
    const song = {
      id: 397, name: 'Mobile Layout Fixture', artists: [{ id: 10, name: 'Fixture Artist' }],
      album: { id: 20, name: 'Fixture Album' }, durationMs: 10_000,
      sourceRef: { kind: 'online', providerId: 'netease', mediaId: '397' },
    };
    usePlaybackStore.setState({
      currentSong: song, playQueue: [song], audioSrc: '/__mobile_audio__.wav',
      duration: 10, playerState: 'PAUSED',
    });
    useAppViewStore.getState().setView('player');
  });
  await expect(page.locator('.folia-player-expanded')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await installBaseState(page, { neteaseMode: 'logged-in', preserveNativeMediaQueries: true });
  await mockNeteaseApi(page, 'logged-in');
  await openApp(page);
});

test('portrait home has full-size navigation and a non-zooming search input', async ({ page }) => {
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  const navigation = page.locator('.folia-home-navigation');
  await expect(navigation).toBeVisible();
  for (const button of await navigation.getByRole('button').all()) await expectTouchTarget(button);
  const input = page.locator('.folia-home-search input');
  await expect(input).toHaveCSS('font-size', '16px');
  expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectInside(navigation, portrait);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(440);
  await page.screenshot({ path: 'test-results/iphone17pm-portrait-home.png' });
});

test('Bravais home also exposes 44-point touch tools', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/library/core/state/useLibrarySuiteStore.ts';
    const { useLibrarySuiteStore } = await import(path);
    useLibrarySuiteStore.getState().setSuite('bravais');
  });
  const tools = page.locator('[data-library-stage="bravais"] .bravais-seam-tools');
  await expect(tools).toBeVisible();
  for (const button of await tools.getByRole('button').all()) await expectTouchTarget(button);
  await tools.locator('[data-bravais-seam-action="settings"]').tap();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await page.screenshot({ path: 'test-results/iphone17pm-bravais-settings.png' });
});

for (const [orientation, viewport] of Object.entries({ portrait, landscape })) {
  test(`${orientation} playback remains tappable while playing and fits the safe viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // Simulated insets verify notch/home-indicator avoidance; WebKit's emulator reports env() = 0.
    const top = orientation === 'portrait' ? 62 : 0;
    const bottom = orientation === 'portrait' ? 34 : 21;
    const side = orientation === 'portrait' ? 0 : 62;
    await page.addStyleTag({ content: `:root { --folia-safe-top:${top}px; --folia-safe-bottom:${bottom}px; --folia-safe-left:${side}px; --folia-safe-right:${side}px; }` });
    await seedPlayer(page);
    const controls = page.locator('.folia-player-controls');
    const play = controls.getByRole('button', { name: 'Play', exact: true });
    await expectTouchTarget(play);
    for (const button of await controls.locator('[data-ponder-slot]').all()) await expectTouchTarget(button);
    expect((await controls.locator('input[type="range"]').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await play.tap();
    await expect(controls.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await expect(page.locator('.folia-player-expanded')).toBeVisible();
    await expectInside(controls, viewport, side);
    const box = (await controls.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - bottom);
    const handle = page.getByTestId('panel-toggle').getByRole('button');
    await expectTouchTarget(handle);
    await expectInside(handle, viewport, side);
    await handle.tap();
    const panel = page.getByTestId('unified-panel-surface');
    await expect(panel).toBeVisible();
    await expectInside(panel, viewport, side);
    expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(top);
    for (const tab of await panel.locator('[data-ponder-panel-tab-button]').all()) await expectTouchTarget(tab);
    await page.screenshot({ path: `test-results/iphone17pm-${orientation}-player.png` });
  });
}

test('search and settings fit after rotation, with reachable close controls', async ({ page }) => {
  await page.locator('.folia-home-search input').fill('fixture');
  await page.locator('.folia-home-search input').press('Enter');
  const search = page.locator('.folia-search-workspace');
  await expect(search).toBeVisible();
  await expect(search.locator('input')).toHaveCSS('font-size', '16px');
  for (const button of await search.locator('header button').all()) await expectTouchTarget(button);
  await page.setViewportSize(landscape);
  await expectInside(search, landscape);
  await search.getByRole('button', { name: 'Back to Home', exact: true }).tap();
  await expect(search).toBeHidden();
  await page.evaluate(async () => {
    const path = '/src/stores/useSettingsModalStore.ts';
    const { openSettings } = await import(path);
    openSettings('options');
  });
  const settings = page.getByTestId('settings-panel');
  await expect(settings).toBeVisible();
  await expectInside(settings, landscape);
  await expectTouchTarget(settings.getByRole('button', { name: 'Close', exact: true }));
  await settings.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(settings).toBeHidden();
  await page.evaluate(async () => {
    const path = '/src/stores/useAppViewStore.ts';
    const { openCommandPalette } = await import(path);
    openCommandPalette();
  });
  const palette = page.getByTestId('command-palette-panel');
  await expect(palette).toBeVisible();
  await expectInside(palette, landscape);
  for (const button of await palette.locator('.folia-command-header > button').all()) await expectTouchTarget(button);
  await page.screenshot({ path: 'test-results/iphone17pm-landscape-palette.png' });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppLanguagePreference } from '../../../src/i18n/config';

// 当前文件：验证原生 iOS 始终使用简体中文，且英文系统、旧偏好和命令入口不会切回外语。

const installBrowser = (savedPreference?: string, detectorPreference?: string) => {
    const values = new Map<string, string>();
    if (savedPreference) values.set('folia_app_language', savedPreference);
    if (detectorPreference) values.set('i18nextLng', detectorPreference);
    const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
        clear: () => { values.clear(); },
    };
    const html = { lang: 'en-US', getAttribute: () => html.lang };
    const setAppLocale = vi.fn(async () => undefined);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US', 'en'] });
    vi.stubGlobal('document', { documentElement: html, cookie: '' });
    vi.stubGlobal('window', { localStorage: storage, electron: { setAppLocale } });
    return { storage, html, setAppLocale };
};

const loadLanguageConfig = async (native: boolean, savedPreference?: string, detectorPreference?: string) => {
    vi.resetModules();
    vi.stubEnv('VITE_NATIVE_IOS', native ? 'true' : 'false');
    const browser = installBrowser(savedPreference, detectorPreference);
    const config = await import('../../../src/i18n/config');
    if (!config.default.isInitialized) {
        await new Promise<void>(resolve => { config.default.on('initialized', () => resolve()); });
    }
    return { ...browser, ...config, i18n: config.default };
};

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('原生 iOS 简体中文', () => {
    it.each([undefined, 'system', 'en', 'in'])('忽略英文系统和旧语言偏好：%s', async preference => {
        const { i18n, html, readStoredAppLanguagePreference } = await loadLanguageConfig(true, preference, 'en-US');

        expect(readStoredAppLanguagePreference()).toBe('zh-CN');
        expect(i18n.resolvedLanguage).toBe('zh-CN');
        expect(html.lang).toBe('zh-CN');
        expect(i18n.t('player.play')).toBe('播放');
        expect(i18n.t('player.pause')).toBe('暂停');
        expect(i18n.options.fallbackLng).toEqual(['zh-CN']);
        expect(i18n.options.supportedLngs).toEqual(expect.arrayContaining(['zh-CN']));
        expect(i18n.options.supportedLngs).not.toContain('en');
    });

    it.each(['system', 'en', 'in', 'zh-CN'] as AppLanguagePreference[])('所有应用入口归一化为中文：%s', async preference => {
        const { i18n, html, storage, setAppLocale, applyAppLanguagePreference } = await loadLanguageConfig(true, 'en', 'en');

        expect(await applyAppLanguagePreference(preference)).toBe('zh-CN');
        expect(storage.getItem('folia_app_language')).toBe('zh-CN');
        expect(i18n.resolvedLanguage).toBe('zh-CN');
        expect(html.lang).toBe('zh-CN');
        expect(setAppLocale).toHaveBeenLastCalledWith('zh-CN');
    });

    it('缺少翻译时也不展示英文默认文案', async () => {
        const { i18n } = await loadLanguageConfig(true);

        expect(i18n.t('nativeChinese.missing', { defaultValue: 'English fallback' })).toBe('暂无内容');
        expect(i18n.t('nativeChinese.missing', { defaultValue: '中文默认文案' })).toBe('中文默认文案');
        expect(i18n.t('player.play', { lng: 'en' })).toBe('播放');
    });

    it('设置状态和切换通知保留实际生效的中文偏好', async () => {
        const { i18n, storage } = await loadLanguageConfig(true, 'en', 'en');
        const { useSettingsModalStore } = await import('../../../src/stores/useSettingsModalStore');
        const { useStatusMessageStore } = await import('../../../src/stores/useStatusMessageStore');

        await useSettingsModalStore.getState().handleSetAppLanguagePreference('en');

        expect(useSettingsModalStore.getState().appLanguagePreference).toBe('zh-CN');
        expect(storage.getItem('folia_app_language')).toBe('zh-CN');
        expect(i18n.resolvedLanguage).toBe('zh-CN');
        expect(useStatusMessageStore.getState().message?.text).toContain('简体中文');
        expect(useStatusMessageStore.getState().message?.text).not.toContain('English');
    });

    it('命令入口只允许简体中文，不展示系统或其他语言切换', async () => {
        await loadLanguageConfig(true);
        const { createAppLanguageCommand } = await import('../../../src/components/command-palette/commandFactories');

        for (const preference of ['system', 'en', 'in', 'zh-CN'] as const) {
            const command = createAppLanguageCommand(`language-${preference}`, preference, '语言', '选择界面语言', []);
            expect(command.isAvailable?.()).toBe(preference === 'zh-CN');
        }
    });
});

describe('Web 与桌面语言兼容', () => {
    it('继续尊重已有英文偏好并允许其他语言', async () => {
        const { i18n, html, readStoredAppLanguagePreference, applyAppLanguagePreference } = await loadLanguageConfig(false, 'en');

        expect(readStoredAppLanguagePreference()).toBe('en');
        expect(i18n.resolvedLanguage).toBe('en');
        expect(html.lang).toBe('en');
        expect(i18n.t('player.play')).toBe('Play');
        expect(await applyAppLanguagePreference('in')).toBe('in');
        expect(i18n.resolvedLanguage).toBe('in');
        expect(await applyAppLanguagePreference('zh-CN')).toBe('zh-CN');
    });

    it('跟随英文系统仍生效，语言命令保持可用', async () => {
        const { i18n, applyAppLanguagePreference } = await loadLanguageConfig(false, 'system');
        const { createAppLanguageCommand } = await import('../../../src/components/command-palette/commandFactories');

        expect(await applyAppLanguagePreference('system')).toBe('en');
        expect(i18n.resolvedLanguage).toBe('en');
        for (const preference of ['system', 'en', 'in', 'zh-CN'] as const) {
            const command = createAppLanguageCommand(`language-${preference}`, preference, '语言', '选择界面语言', []);
            expect(command.isAvailable?.()).toBe(true);
        }
    });
});

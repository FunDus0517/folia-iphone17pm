import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearNativeMusicConfig, getNativeMusicApiBase, NATIVE_MUSIC_CONFIG_KEY, readNativeMusicConfig,
    resolveNativeMusicApiBase, saveNativeMusicConfig, validateNativeMusicConfig,
} from '../../../src/services/nativeMusicConfig';
import { checkNativeMusicConnection } from '../../../src/services/nativeMusicConnection';
import { getNeteaseTransportAvailability } from '../../../src/services/netease';
import { getQqTransportAvailability, requestQq } from '../../../src/services/onlineMusic/qqTransport';
import { getKugouTransportAvailability } from '../../../src/services/onlineMusic/kugouTransport';
import { neteaseProvider } from '../../../src/services/onlineMusic/neteaseProvider';

// test/unit/services/nativeMusicConfig.test.ts：配置、会话隔离与连接诊断使用本地桩，不连接真实音乐服务。
const empty = { backendOrigin: '', neteaseApiBase: '', qqApiBase: '', kugouApiBase: '' };
let storage: Map<string, string>;
beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
        removeItem: (key: string) => { storage.delete(key); },
        key: (index: number) => [...storage.keys()][index] ?? null,
        get length() { return storage.size; },
    });
    vi.stubEnv('VITE_NATIVE_IOS', 'true');
    for (const key of ['VITE_FOLIA_API_BASE', 'VITE_NETEASE_API_BASE', 'VITE_QQ_API_BASE', 'VITE_KUGOU_API_BASE']) vi.stubEnv(key, '');
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('手机音乐服务配置', () => {
    it('三平台均未配置时不谎报网易已配置', () => {
        expect(readNativeMusicConfig()).toEqual(empty);
        for (const availability of [getNeteaseTransportAvailability(), getQqTransportAvailability(), getKugouTransportAvailability()]) {
            expect(availability).toEqual({ configured: false, reason: 'not-configured' });
        }
        expect(neteaseProvider.getAvailability?.()).toEqual({ configured: false, reason: 'not-configured' });
    });
    it('保存HTTPS及显式相对路径，立即供传输层读取', () => {
        const saved = saveNativeMusicConfig({ ...empty, backendOrigin: ' https://folia.example.test/ ', neteaseApiBase: '/netease/', qqApiBase: 'https://qq.example.test/api/', kugouApiBase: '/kugou' });
        expect(saved.neteaseApiBase).toBe('/netease');
        expect(getNativeMusicApiBase('netease')).toBe('https://folia.example.test/netease');
        expect(getNativeMusicApiBase('qq')).toBe('https://qq.example.test/api');
        expect(getNativeMusicApiBase('kugou')).toBe('https://folia.example.test/kugou');
        expect(resolveNativeMusicApiBase(saved, 'qq')).toBe('https://qq.example.test/api');
        for (const availability of [getNeteaseTransportAvailability(), getQqTransportAvailability(), getKugouTransportAvailability()]) expect(availability.configured).toBe(true);
    });
    it.each(['http://api.example.test', 'https://user:pass@api.example.test', 'https://api.example.test?token=x', 'https://api.example.test#x', 'https://localhost:3000', 'https://127.0.0.1', 'https://[::1]', '//api.example.test', '/api/qq'])('拒绝不适合手机的接口：%s', qqApiBase => {
        expect(() => validateNativeMusicConfig({ ...empty, qqApiBase })).toThrow();
    });
    it('Folia域名不允许路径，空白字段不会猜测平台路由', () => {
        expect(() => validateNativeMusicConfig({ ...empty, backendOrigin: 'https://folia.example.test/path' })).toThrow();
        expect(validateNativeMusicConfig({ ...empty, backendOrigin: 'https://folia.example.test' }).qqApiBase).toBe('');
    });
    it.each(['broken', '{"version":2,"config":{}}', '{"version":1,"config":{"qqApiBase":9}}'])('损坏存储不阻止启动：%s', value => {
        storage.set(NATIVE_MUSIC_CONFIG_KEY, value);
        expect(readNativeMusicConfig()).toEqual(empty);
    });
    it('只清理地址变化平台的凭据，保留无关偏好与其它平台', () => {
        saveNativeMusicConfig({ ...empty, neteaseApiBase: 'https://old.example.test', qqApiBase: 'https://qq.example.test' });
        storage.set('online_provider:netease:cookie', 'old-session');
        storage.set('netease_cookie', 'legacy-session');
        storage.set('online_provider:qq:cookie', 'other-session');
        storage.set('folia_app_language', 'zh-CN');
        saveNativeMusicConfig({ ...empty, neteaseApiBase: 'https://new.example.test', qqApiBase: 'https://qq.example.test' });
        expect(storage.has('online_provider:netease:cookie')).toBe(false);
        expect(storage.has('netease_cookie')).toBe(false);
        expect(storage.get('online_provider:qq:cookie')).toBe('other-session');
        expect(storage.get('folia_app_language')).toBe('zh-CN');
    });
    it('相同地址不清会话，Folia域名变化只影响相对接口', () => {
        const config = { ...empty, backendOrigin: 'https://a.example.test', neteaseApiBase: '/netease', qqApiBase: 'https://qq.example.test' };
        saveNativeMusicConfig(config);
        storage.set('online_provider:netease:cookie', 'old-session');
        storage.set('online_provider:qq:cookie', 'qq-session');
        saveNativeMusicConfig(config);
        expect(storage.has('online_provider:netease:cookie')).toBe(true);
        saveNativeMusicConfig({ ...config, backendOrigin: 'https://b.example.test' });
        expect(storage.has('online_provider:netease:cookie')).toBe(false);
        expect(storage.has('online_provider:qq:cookie')).toBe(true);
    });
    it('清除覆盖恢复构建默认，并清理不再适用的会话', () => {
        vi.stubEnv('VITE_QQ_API_BASE', 'https://built.example.test');
        saveNativeMusicConfig({ ...empty, qqApiBase: 'https://custom.example.test' });
        storage.set('online_provider:qq:cookie', 'session');
        clearNativeMusicConfig();
        expect(getNativeMusicApiBase('qq')).toBe('https://built.example.test');
        expect(storage.has('online_provider:qq:cookie')).toBe(false);
    });
    it('网页模式不读取手机覆盖配置', () => {
        saveNativeMusicConfig({ ...empty, qqApiBase: 'https://phone.example.test' });
        vi.stubEnv('VITE_NATIVE_IOS', 'false');
        expect(readNativeMusicConfig()).toEqual(empty);
        expect(() => saveNativeMusicConfig(empty)).toThrow();
    });
    it('服务切换后丢弃晚到的QQ登录响应，不把旧令牌写回', async () => {
        saveNativeMusicConfig({ ...empty, qqApiBase: 'https://old.example.test' });
        let complete!: (response: Response) => void;
        const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { complete = resolve; }));
        vi.stubGlobal('fetch', fetcher);
        const request = requestQq('login_qr_check', { key: 'old-round' });
        const rejection = expect(request).rejects.toThrow('音乐服务地址已更改');
        await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
        saveNativeMusicConfig({ ...empty, qqApiBase: 'https://new.example.test' });
        complete(new Response(JSON.stringify({ code: 803, cookie: 'qqmusic_session=old-service-token' })));
        await rejection;
        expect(storage.has('online_provider:qq:cookie')).toBe(false);
    });
});

describe('手机音乐连接诊断', () => {
    it('空地址不发送请求', async () => {
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        expect((await checkNativeMusicConnection('qq', '')).status).toBe('failed');
        expect(fetcher).not.toHaveBeenCalled();
    });
    it.each(['netease', 'qq', 'kugou'] as const)('只读检查%s不携带旧登录信息', async provider => {
        storage.set(`online_provider:${provider}:cookie`, 'do-not-send');
        const data = provider === 'kugou' ? { status: 0, error_code: 152 } : { code: 200, data: { profile: null } };
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data))); vi.stubGlobal('fetch', fetcher);
        const result = await checkNativeMusicConnection(provider, 'https://api.example.test');
        expect(result.status).toBe('success');
        expect(result.message).toContain('不代表账号已登录或歌曲可播放');
        expect(fetcher.mock.calls[0][0]).not.toContain('do-not-send');
        expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
    });
    it.each([{ ok: true }, { code: 500, data: {} }, []])('不把无关JSON或服务错误当成成功：%j', async body => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
        expect((await checkNativeMusicConnection('qq', 'https://api.example.test')).status).toBe('failed');
    });
    it('HTML与跨域网络错误提供中文诊断而非成功', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>login</html>')));
        expect((await checkNativeMusicConnection('qq', 'https://api.example.test')).status).toBe('failed');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        expect((await checkNativeMusicConnection('qq', 'https://api.example.test')).message).toContain('连接失败');
    });
});

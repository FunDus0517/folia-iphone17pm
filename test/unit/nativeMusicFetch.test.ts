import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ isNativePlatform: vi.fn(), request: vi.fn() }));
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: bridge.isNativePlatform },
    CapacitorHttp: { request: bridge.request },
}));

import { nativeMusicFetch } from '../../src/services/nativeMusicFetch';

const apiUrl = 'https://music.example.test/qq/login/status';
const nativeResult = (data: unknown = { code: 200 }) => ({
    data, status: 200, headers: { 'content-type': 'application/json', 'x-music-test': 'yes' }, url: apiUrl,
});

describe('音乐服务局部原生请求', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        bridge.isNativePlatform.mockReturnValue(true);
        bridge.request.mockResolvedValue(nativeResult());
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('网页分支原样传入 fetch 并返回同一响应', async () => {
        bridge.isNativePlatform.mockReturnValue(false);
        const response = new Response('网页响应');
        const fetchMock = vi.fn().mockResolvedValue(response);
        vi.stubGlobal('fetch', fetchMock);
        const init: RequestInit = { method: 'GET', credentials: 'include', signal: new AbortController().signal };
        expect(await nativeMusicFetch('/api/qq/login/status', init)).toBe(response);
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/qq/login/status', init);
        expect(bridge.request).not.toHaveBeenCalled();
    });

    it('原生 GET 使用局部桥、禁重定向并设置连接与读取超时', async () => {
        const response = await nativeMusicFetch(apiUrl);
        expect(bridge.request).toHaveBeenCalledExactlyOnceWith({
            url: apiUrl, method: 'GET', headers: {}, responseType: 'text',
            connectTimeout: 8_000, readTimeout: 8_000, disableRedirects: true,
        });
        expect(response.status).toBe(200);
        expect(response.url).toBe(apiUrl);
        expect(response.headers.get('x-music-test')).toBe('yes');
        expect(await response.json()).toEqual({ code: 200 });
    });

    it('保留 JSON POST 字符串、请求头及查询中的会话参数', async () => {
        const url = `${apiUrl}?cookie=MUSIC_U%3Dtest`;
        bridge.request.mockResolvedValue({ ...nativeResult(), url });
        const body = JSON.stringify({ tid: '123', op: 'add' });
        await nativeMusicFetch(url, {
            method: 'post', body,
            headers: new Headers({ 'Content-Type': 'application/json', 'X-Session': 'opaque-test' }),
        });
        expect(bridge.request).toHaveBeenCalledWith(expect.objectContaining({
            url, method: 'POST', data: body,
            headers: { 'content-type': 'application/json', 'x-session': 'opaque-test' },
        }));
    });

    it.each([
        'http://music.example.test/api', '/api/qq',
        'https://user:password@music.example.test/api', 'file:///music.json',
    ])('原生入口拒绝非 HTTPS 或嵌入账号地址：%s', async input => {
        await expect(nativeMusicFetch(input)).rejects.toBeInstanceOf(TypeError);
        expect(bridge.request).not.toHaveBeenCalled();
    });

    it('原生分支拒绝文件请求体和不支持的方法', async () => {
        await expect(nativeMusicFetch(apiUrl, { method: 'PUT' })).rejects.toBeInstanceOf(TypeError);
        await expect(nativeMusicFetch(apiUrl, { method: 'POST', body: new Blob(['large']) })).rejects.toBeInstanceOf(TypeError);
        await expect(nativeMusicFetch(apiUrl, { body: '{}' })).rejects.toBeInstanceOf(TypeError);
        expect(bridge.request).not.toHaveBeenCalled();
    });

    it('保留 HTTP 错误响应与文本而非把状态错误改成网络错误', async () => {
        bridge.request.mockResolvedValue({ ...nativeResult(), status: 503, data: '<html>服务暂不可用</html>' });
        const response = await nativeMusicFetch(apiUrl);
        expect(response.status).toBe(503);
        expect(response.ok).toBe(false);
        expect(await response.text()).toBe('<html>服务暂不可用</html>');
    });

    it('204 空响应不会向 Response 构造器传入请求体', async () => {
        bridge.request.mockResolvedValue({ ...nativeResult(), status: 204, data: '' });
        const response = await nativeMusicFetch(apiUrl);
        expect(response.status).toBe(204);
        expect(await response.text()).toBe('');
    });

    it('已取消信号不启动原生请求', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(nativeMusicFetch(apiUrl, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(bridge.request).not.toHaveBeenCalled();
    });

    it('等待中的取消结束 JS 等待并丢弃迟到响应', async () => {
        let finish!: (value: ReturnType<typeof nativeResult>) => void;
        bridge.request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const controller = new AbortController();
        const result = nativeMusicFetch(apiUrl, { signal: controller.signal });
        const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
        controller.abort();
        await rejection;
        finish(nativeResult());
        await Promise.resolve();
    });

    it('八秒墙钟超时转为常规 TypeError，不真实等待八秒', async () => {
        vi.useFakeTimers();
        bridge.request.mockImplementation(() => new Promise(() => {}));
        const result = nativeMusicFetch(apiUrl);
        const rejection = expect(result).rejects.toThrowError(new TypeError('音乐服务请求超时'));
        await vi.advanceTimersByTimeAsync(8_000);
        await rejection;
        expect(vi.getTimerCount()).toBe(0);
    });

    it('网络错误转为常规 TypeError 且不回显包含凭据的底层错误', async () => {
        bridge.request.mockRejectedValue(new Error('MUSIC_U=secret-token'));
        await expect(nativeMusicFetch(apiUrl)).rejects.toThrowError(new TypeError('音乐服务网络请求失败'));
    });

    it('同步原生错误也转换为常规 TypeError', async () => {
        bridge.request.mockImplementation(() => { throw new Error('native transport'); });
        await expect(nativeMusicFetch(apiUrl)).rejects.toThrowError(new TypeError('音乐服务网络请求失败'));
    });

    it.each([
        { code: -1001 }, { code: 'NSURLErrorTimedOut' }, { message: 'The request timed out: cookie=secret-token' },
    ])('原生提前返回的超时也被统一分类且不回显底层文本', async error => {
        bridge.request.mockRejectedValue(error);
        await expect(nativeMusicFetch(apiUrl)).rejects.toThrowError(new TypeError('音乐服务请求超时'));
    });

    it('原生取消错误保留 AbortError 分类', async () => {
        bridge.request.mockRejectedValue({ code: -999, message: 'cancelled' });
        await expect(nativeMusicFetch(apiUrl)).rejects.toMatchObject({ name: 'AbortError' });
    });

    it.each([
        { url: 'https://other.example.test/api' },
        { status: 302, headers: { location: 'https://other.example.test/api' } },
        { status: 302, headers: { location: 'http://music.example.test/api' } },
    ])('拒绝跨站点或降级重定向', async change => {
        bridge.request.mockResolvedValue({ ...nativeResult(), ...change });
        await expect(nativeMusicFetch(apiUrl)).rejects.toBeInstanceOf(TypeError);
    });

    it('同站点重定向不被自动跟随并保留原始状态', async () => {
        bridge.request.mockResolvedValue({ ...nativeResult(), status: 302, headers: { location: '/qq/status' }, data: '' });
        const response = await nativeMusicFetch(apiUrl);
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/qq/status');
        expect(bridge.request).toHaveBeenCalledTimes(1);
    });

    it('成功响应会清理超时定时器和取消监听', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const remove = vi.spyOn(controller.signal, 'removeEventListener');
        await nativeMusicFetch(apiUrl, { signal: controller.signal });
        expect(vi.getTimerCount()).toBe(0);
        expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    });
});
